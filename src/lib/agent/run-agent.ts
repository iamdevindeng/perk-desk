// Orchestrates merchant research, balanced shortlisting, brand checks, and grounded pitches.
// Called by: the run route, smoke scripts, and run-agent unit tests
import { generateText, isStepCount, tool, type LanguageModel, type Tool } from "ai";
import { z } from "zod";
import { BRAND_CHECK_MAX, BRAND_CHECK_MIN_POPULARITY, MIN_INDEPENDENTS, RUN_AGENT_TIMEOUT_MS, RUN_MAX_STEPS, TRACE_SUMMARY_MAX } from "@/lib/config";
import { contextQlooOptions, createRunContext, handleToolError, type RunContext } from "@/lib/agent/context";
import { checkPitch } from "@/lib/agent/guards";
import { agentModel, AGENT_CALL_SETTINGS } from "@/lib/agent/model";
import { writePitches } from "@/lib/agent/pitch-writer";
import { buildRunUserPrompt, RUN_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import { buildFindMerchantsTool } from "@/lib/agent/tools/find-merchants";
import { buildSearchCategoriesTool } from "@/lib/agent/tools/search-categories";
import { hasDeepSeekKey, isAgentDisabled } from "@/lib/env";
import { runFallbackResearch } from "@/lib/fallback/fallback-run";
import { buildTemplatePitch } from "@/lib/fallback/pitch-template";
import { normalizeName } from "@/lib/merchants/name-match";
import { countIndependents } from "@/lib/merchants/scoring";
import { buildShortlist } from "@/lib/merchants/shortlist";
import { searchBrandExact } from "@/lib/qloo/search";
import { MerchantResultSchema, RunRequestSchema, RunResultSchema, type CategoryReport, type MerchantCandidate, type MerchantResult, type RunRequest, type RunResult, type StepId, type TraceEvent } from "@/lib/types";

type RunOptions = { model?: LanguageModel };
const FinishInputSchema = z.object({ note: z.string().max(TRACE_SUMMARY_MAX) });
type FinishInput = z.infer<typeof FinishInputSchema>;

function step(context: RunContext, stepId: StepId, status: "start" | "done", summary: string): void {
  context.emit({ type: "step", at: 0, step: stepId, status, summary: summary.slice(0, TRACE_SUMMARY_MAX) });
}

function buildFinishTool(context: RunContext): Tool<FinishInput, { finished: boolean }> {
  return tool({
    description: "Finish research after every confirmed category has been checked and thin results reviewed.",
    inputSchema: FinishInputSchema,
    execute: async ({ note }): Promise<{ finished: boolean }> => {
      context.emit({ type: "tool_call", at: 0, tool: "finishResearch", summary: "Finishing merchant research" });
      context.finished = true;
      if (note.trim()) context.emit({ type: "agent_note", at: 0, text: note });
      context.emit({ type: "tool_result", at: 0, tool: "finishResearch", summary: "Research handed to deterministic completion" });
      return { finished: true };
    },
  });
}

async function tryResearchAgent(context: RunContext, options: RunOptions): Promise<string | null> {
  if (isAgentDisabled()) return "Agent mode is disabled; using deterministic research.";
  if (!options.model && !hasDeepSeekKey()) return "Research model is unavailable; using deterministic research.";
  try {
    await generateText({
      model: options.model ?? agentModel(), instructions: RUN_SYSTEM_PROMPT, prompt: buildRunUserPrompt(context),
      tools: { findMerchants: buildFindMerchantsTool(context), searchCategories: buildSearchCategoriesTool(context), finishResearch: buildFinishTool(context) },
      toolChoice: "auto", ...AGENT_CALL_SETTINGS, abortSignal: AbortSignal.timeout(RUN_AGENT_TIMEOUT_MS),
      stopWhen: [isStepCount(RUN_MAX_STEPS), () => context.finished || context.fatalError !== null],
      onStepFinish: (finishedStep) => {
        if (finishedStep.text.trim()) context.emit({ type: "agent_note", at: 0, text: finishedStep.text.slice(0, TRACE_SUMMARY_MAX) });
      },
    });
    return context.finished ? null : "The research agent did not finish; completing the remaining research directly.";
  } catch {
    return "Research agent unavailable; using deterministic research.";
  }
}

function markKnownBrand(entityId: string, context: RunContext): void {
  for (const outcome of context.results.values()) {
    outcome.candidates = outcome.candidates.map((candidate) => candidate.place.entityId === entityId ? { ...candidate, multiLocation: true } : candidate);
    outcome.independentCount = countIndependents(outcome.candidates);
  }
}

async function checkMerchantBrands(candidates: MerchantCandidate[], context: RunContext): Promise<MerchantCandidate[]> {
  const checked = candidates.map((candidate) => ({ ...candidate }));
  for (const candidate of checked.slice(0, BRAND_CHECK_MAX)) {
    try {
      const brand = await searchBrandExact(candidate.place.name, contextQlooOptions(context));
      if (brand && normalizeName(brand.name) === normalizeName(candidate.place.name) && brand.popularity >= BRAND_CHECK_MIN_POPULARITY) {
        candidate.multiLocation = true;
        markKnownBrand(candidate.place.entityId, context);
      }
    } catch (error) { handleToolError(context, error); }
  }
  if (context.fatalError) throw context.fatalError;
  return checked;
}

function resultCard(candidate: MerchantCandidate): MerchantResult {
  const place = candidate.place;
  let googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address}`)}`;
  if (place.googlePlaceId) googleMapsUrl += `&query_place_id=${encodeURIComponent(place.googlePlaceId)}`;
  return MerchantResultSchema.parse({ ...candidate, pitch: "", pitchSource: "template", googleMapsUrl });
}

function pitchedCard(card: MerchantResult, pitches: Map<string, string>, context: RunContext): MerchantResult {
  const generated = pitches.get(card.place.entityId);
  const validGenerated = generated !== undefined && checkPitch(generated, card);
  const pitch = validGenerated ? generated : buildTemplatePitch(card, context.request.institutionName);
  if (!checkPitch(pitch, card)) {
    context.warnings.push(`A valid pitch could not be prepared for ${card.place.name}; the merchant remains on the list.`);
    return { ...card, pitch: "", pitchSource: "template" };
  }
  return { ...card, pitch, pitchSource: validGenerated ? "agent" : "template" };
}

async function finishMerchants(context: RunContext, mode: RunResult["mode"], options: RunOptions): Promise<MerchantResult[]> {
  const candidates = new Map([...context.results].map(([tagId, outcome]) => [tagId, outcome.candidates]));
  const shortlist = await checkMerchantBrands(buildShortlist(candidates, context.request.branches), context);
  const cards = shortlist.map(resultCard);
  let pitches = new Map<string, string>();
  if (mode === "agent") {
    try { pitches = await writePitches(cards, context.request.institutionName, options); }
    catch { context.warnings.push("Pitch writing was unavailable; template pitches were used."); }
  }
  return cards.map((card) => pitchedCard(card, pitches, context));
}

function categoryReports(context: RunContext): CategoryReport[] {
  const categories = new Map(context.request.categories.map((category) => [category.tagId, category.label]));
  for (const outcome of context.results.values()) categories.set(outcome.tagId, outcome.label);
  return Array.from(categories, ([tagId, label]) => {
    const independentCount = context.results.get(tagId)?.independentCount ?? 0;
    const replacedBy = context.replacements.get(tagId);
    return { tagId, label, independentCount, status: replacedBy ? "replaced" : independentCount < MIN_INDEPENDENTS ? "thin" : "ok", replacedBy };
  });
}

async function performResearch(context: RunContext, options: RunOptions): Promise<RunResult["mode"]> {
  const reason = await tryResearchAgent(context, options);
  if (context.fatalError) throw context.fatalError;
  if (reason) {
    context.emit({ type: "fallback", at: 0, reason });
    context.warnings.push(reason);
  }
  // Even a model that immediately finishes cannot omit confirmed categories (ARCHITECTURE.md §6.1).
  await runFallbackResearch(context, reason !== null);
  if (context.fatalError) throw context.fatalError;
  return reason ? "fallback" : "agent";
}

export async function runResearch(request: RunRequest, emit: (event: TraceEvent) => void, options: RunOptions = {}): Promise<RunResult> {
  const startedAt = Date.now();
  const context = createRunContext(RunRequestSchema.parse(request), emit);
  step(context, "resolve_brands", "start", "Loading confirmed member brands");
  step(context, "resolve_brands", "done", `Using ${context.request.brands.length} confirmed brands`);
  step(context, "pick_categories", "start", "Loading confirmed merchant categories");
  step(context, "pick_categories", "done", `Using ${context.request.categories.length} confirmed categories`);
  step(context, "find_merchants", "start", "Searching near each branch");
  step(context, "filter_score", "start", "Filtering and scoring candidate merchants");
  step(context, "data_check", "start", "Checking local independent-shop availability");
  const mode = await performResearch(context, options);
  step(context, "find_merchants", "done", `Researched ${context.results.size} categories`);
  step(context, "filter_score", "done", `Kept ${[...context.results.values()].reduce((count, outcome) => count + outcome.candidates.length, 0)} category matches`);
  step(context, "data_check", "done", `Tried ${context.replacements.size} adjacent categories`);
  step(context, "rank_pitch", "start", "Balancing the shortlist and preparing pitches");
  const merchants = await finishMerchants(context, mode, options);
  step(context, "rank_pitch", "done", `Prepared ${merchants.length} merchants`);
  return RunResultSchema.parse({ mode, merchants, categories: categoryReports(context), excludedCounts: context.excludedCounts,
    qlooCalls: context.qlooCalls, durationMs: Date.now() - startedAt, warnings: context.warnings });
}
