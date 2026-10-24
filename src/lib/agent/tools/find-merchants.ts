// Researches one category near every branch and maintains run-wide merchant eligibility.
// Called by: the research agent, deterministic fallback, and find-merchants unit tests
import { tool, type Tool } from "ai";
import { z } from "zod";
import { DENSITY_TTL_S, MERCHANT_SAMPLE_MAX, MIN_INDEPENDENTS, TRACE_SUMMARY_MAX } from "@/lib/config";
import { contextQlooOptions, handleToolError, type CategoryOutcome, type RunContext } from "@/lib/agent/context";
import { citySlug } from "@/lib/hash";
import { markDuplicateNames } from "@/lib/merchants/chains";
import { filterPlaces } from "@/lib/merchants/filter";
import { nameMatches } from "@/lib/merchants/name-match";
import { assignNearestBranch, computeBrandShares, countIndependents, mergeSeededAndBaseline, scoreCandidates } from "@/lib/merchants/scoring";
import { findPlaces } from "@/lib/qloo/insights";
import { isQlooError } from "@/lib/qloo/client";
import { isBlacklistedCategory } from "@/lib/qloo/tags";
import { setJson } from "@/lib/store/cache";
import { CategoryTagIdSchema, type MerchantCandidate, type Place, type RunRequest } from "@/lib/types";

const FindMerchantsInputSchema = z.object({ tagId: CategoryTagIdSchema, replacesTagId: CategoryTagIdSchema.optional() });
type FindMerchantsInput = z.infer<typeof FindMerchantsInputSchema>;
type FindMerchantsSummary = { tagId: string; label: string; independentCount: number; thin: boolean; sampleNames: string[] };
type FindMerchantsOutput = FindMerchantsSummary | { error: string };
type LocatedBranch = RunRequest["branches"][number];

function requestError(input: FindMerchantsInput, context: RunContext): string | null {
  const { tagId, replacesTagId } = input;
  if (!context.candidateCategories.has(tagId) || isBlacklistedCategory(tagId)) return "Choose an allowed category from this run's candidates.";
  const originals = context.request.categories.map((category) => category.tagId);
  if (!replacesTagId) return originals.includes(tagId) ? null : "Only confirmed categories can be researched without a replacement.";
  const original = context.results.get(replacesTagId);
  if (!originals.includes(replacesTagId) || tagId === replacesTagId) return "Replace an original confirmed category with a different category.";
  if (!original || original.independentCount >= MIN_INDEPENDENTS) return "Only a researched category with few independent shops can be replaced.";
  const previous = context.replacements.get(replacesTagId);
  if (previous && (previous !== tagId || !context.results.has(tagId))) return "Each original category can be replaced only once.";
  return null;
}

function summarize(outcome: CategoryOutcome): FindMerchantsSummary {
  return {
    tagId: outcome.tagId, label: outcome.label, independentCount: outcome.independentCount,
    thin: outcome.independentCount < MIN_INDEPENDENTS,
    sampleNames: outcome.candidates.slice(0, MERCHANT_SAMPLE_MAX).map((candidate) => candidate.place.name),
  };
}

async function placesForBranch(branch: LocatedBranch, tagId: string, seeded: boolean, context: RunContext): Promise<Place[]> {
  try {
    if (context.fatalError) throw context.fatalError;
    return await findPlaces({
      lat: branch.lat, lon: branch.lon, radiusMeters: branch.radiusMeters, tagId,
      brandIds: seeded ? context.request.brands.map((brand) => brand.entityId) : [],
    }, contextQlooOptions(context));
  } catch (error) {
    if (isQlooError(error) && ["auth", "quota", "config"].includes(error.code)) handleToolError(context, error);
    context.warnings.push(`${branch.name}: ${seeded ? "taste" : "baseline"} lookup failed; available results were kept.`);
    return [];
  }
}

async function branchCandidates(branch: LocatedBranch, tagId: string, label: string, context: RunContext): Promise<MerchantCandidate[]> {
  const seeded = await placesForBranch(branch, tagId, true, context);
  const baseline = await placesForBranch(branch, tagId, false, context);
  const merged = mergeSeededAndBaseline(seeded, baseline, branch, { tagId, label });
  // Preserve the original seeded affinity range before exclusions. See ARCHITECTURE.md §6.2.
  const filtered = filterPlaces(scoreCandidates(merged, branch), context.request);
  context.excludedCounts.closed += filtered.excludedCounts.closed;
  context.excludedCounts.noiseGenre += filtered.excludedCounts.noiseGenre;
  context.excludedCounts.nationalChain += filtered.excludedCounts.nationalChain;
  context.excludedCounts.signedOrExcluded += filtered.excludedCounts.signedOrExcluded;
  return filtered.kept.map((candidate) => ({
    ...candidate, brandShares: computeBrandShares(candidate.explain, context.request.brands),
    // Membership is a follow-up badge only; scoring and eligibility remain unchanged (ARCHITECTURE.md §6.2).
    businessMember: nameMatches(candidate.place.name, context.request.businessMemberNames),
  }));
}

async function persistDensity(tagId: string, context: RunContext): Promise<void> {
  const count = context.results.get(tagId)!.independentCount;
  await setJson(`pd:v1:density:${citySlug(context.request.city)}:${tagId}`, count, DENSITY_TTL_S);
  // Concurrent category completion can change duplicate flags during the write; persist the latest count.
  if (context.results.get(tagId)!.independentCount !== count) await persistDensity(tagId, context);
}

async function refreshOutcomes(context: RunContext): Promise<void> {
  const allCandidates = [...context.results.values()].flatMap((outcome) => outcome.candidates);
  const marked = markDuplicateNames(allCandidates);
  for (const outcome of context.results.values()) {
    const candidates = marked.filter((candidate) => candidate.categoryTagId === outcome.tagId);
    const independentCount = countIndependents(candidates);
    context.results.set(outcome.tagId, { ...outcome, candidates, independentCount });
    context.knownDensities.set(outcome.tagId, independentCount);
  }
  for (const tagId of context.results.keys()) await persistDensity(tagId, context);
}

export async function findMerchantsForCategory(input: FindMerchantsInput, context: RunContext): Promise<FindMerchantsOutput> {
  const parsed = FindMerchantsInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid place category." };
  const error = requestError(parsed.data, context);
  if (error) return { error };
  if (context.pendingCategories.has(input.tagId)) return { error: "This category is already being researched." };
  // Reserve before the first await so simultaneous tool calls cannot replace a category twice.
  if (input.replacesTagId) context.replacements.set(input.replacesTagId, input.tagId);
  const existing = context.results.get(input.tagId);
  if (existing) return summarize(existing);
  context.pendingCategories.add(input.tagId);
  try {
    const label = context.candidateCategories.get(input.tagId)!;
    const candidates: MerchantCandidate[] = [];
    for (const branch of context.request.branches) candidates.push(...await branchCandidates(branch, input.tagId, label, context));
    context.results.set(input.tagId, { tagId: input.tagId, label, candidates: assignNearestBranch(candidates), independentCount: 0 });
    await refreshOutcomes(context);
    return summarize(context.results.get(input.tagId)!);
  } finally {
    context.pendingCategories.delete(input.tagId);
  }
}

export function buildFindMerchantsTool(context: RunContext): Tool<FindMerchantsInput, FindMerchantsOutput> {
  return tool({
    description: "Find local merchants for a confirmed category, or try one replacement for a thin original category.",
    inputSchema: FindMerchantsInputSchema,
    async execute(input): Promise<FindMerchantsOutput> {
      context.emit({ type: "tool_call", at: 0, tool: "findMerchants", summary: `Research ${input.tagId}`.slice(0, TRACE_SUMMARY_MAX) });
      let result: FindMerchantsOutput;
      try { result = await findMerchantsForCategory(input, context); }
      catch (error) { result = handleToolError(context, error); }
      const summary = "error" in result ? result.error : `${result.label}: ${result.independentCount} independent shops`;
      context.emit({ type: "tool_result", at: 0, tool: "findMerchants", summary: summary.slice(0, TRACE_SUMMARY_MAX) });
      return result;
    },
  });
}
