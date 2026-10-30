// Orchestrates location resolution, guarded planning, and deterministic fallback categories.
// Called by: the plan route, smoke/eval scripts, and plan-agent unit tests
import { generateText, isStepCount, tool, type LanguageModel, type Tool } from "ai";
import { BRANCH_MAX_CITY_DISTANCE_M, PLAN_MAX_CATEGORIES, PLAN_MAX_STEPS, PLAN_MAX_SUBMISSIONS, PLAN_MIN_CATEGORIES, PLAN_TIMEOUT_MS, TRACE_SUMMARY_MAX } from "@/lib/config";
import { contextQlooOptions, createPlanContext, handleToolError, researchStopped, type ResearchOptions, type PlanContext } from "@/lib/agent/context";
import { applyPlanGuards, PlanSubmissionSchema, type PlanSubmission } from "@/lib/agent/guards";
import { agentModel, AGENT_CALL_SETTINGS } from "@/lib/agent/model";
import { buildPlanUserPrompt, PLAN_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import { buildResolveBrandsTool, resolveBrandNames } from "@/lib/agent/tools/resolve-brands";
import { buildSearchCategoriesTool } from "@/lib/agent/tools/search-categories";
import { findPreset, findUsCityCenter, getCities } from "@/lib/data";
import { hasDeepSeekKey, isAgentDisabled } from "@/lib/env";
import { buildFallbackPlan, chooseFallbackBrands } from "@/lib/fallback/fallback-plan";
import { haversineMeters } from "@/lib/merchants/distance";
import { createQlooError } from "@/lib/qloo/client";
import { resolveLocality } from "@/lib/qloo/insights";
import { PlanRequestSchema, PlanResponseSchema, ResolvedBrandSchema, type Branch, type PlanRequest, type PlanResponse, type TraceEvent } from "@/lib/types";

type PlanOptions = ResearchOptions & { onCacheable?: (cacheable: boolean) => void; emit?: (event: TraceEvent) => void; model?: LanguageModel };
type Locality = { name: string; lat: number; lon: number };
type SubmitResult = { accepted: boolean; kept: string[]; errors: string[] };

export function expandPlanRequest(request: PlanRequest): PlanRequest {
  if (!request.presetId) return request;
  const preset = findPreset(request.presetId);
  if (!preset) throw createQlooError("bad_request", 400, "Unknown demo preset.");
  return PlanRequestSchema.parse({
    ...request, institutionName: preset.profile.institutionName, city: preset.profile.city,
    branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })),
    brandNames: preset.brandsText.split(/\r?\n/).map((name) => name.trim()).filter(Boolean),
  });
}

async function lookupLocality(query: string, context: PlanContext): Promise<Locality | null> {
  if (researchStopped(context) || !query.trim()) return null;
  try {
    return await resolveLocality(query, contextQlooOptions(context));
  } catch (error) {
    handleToolError(context, error);
    return null;
  }
}

async function locateBranch(branch: Branch, context: PlanContext): Promise<Branch | null> {
  if (branch.lat !== undefined && branch.lon !== undefined) return branch;
  const point = await lookupLocality(branch.address, context);
  if (!point) {
    context.warnings.push(`Could not locate branch ${branch.name}; pick its location on the map.`);
    return null;
  }
  context.warnings.push(`Branch ${branch.name} location is approximate; pick it on the map to refine.`);
  return { ...branch, lat: point.lat, lon: point.lon, locationSource: "qloo_locality" };
}

async function resolveLocations(context: PlanContext): Promise<PlanResponse["city"]> {
  const known = getCities().find((city) => city.label.toLowerCase() === context.request.city.trim().toLowerCase());
  // Census internal points can be a few km from downtown, well inside the 50 km filter.
  const point = known ?? findUsCityCenter(context.request.city) ?? await lookupLocality(context.request.city, context);
  const branches: Branch[] = [];
  for (const branch of context.request.branches) {
    const located = await locateBranch(branch, context);
    if (!located) continue;
    if (point && located.lat !== undefined && located.lon !== undefined &&
      haversineMeters(point, { lat: located.lat, lon: located.lon }) > BRANCH_MAX_CITY_DISTANCE_M) {
      context.warnings.push(`Branch ${located.name} is more than 50 km from ${context.request.city}; pick its location on the map.`);
      continue;
    }
    branches.push(located);
  }
  context.request = { ...context.request, branches };
  if (!branches.length) context.warnings.push("No branch locations were resolved; pick a location on the map.");
  return point ? { label: context.request.city, lat: point.lat, lon: point.lon } : undefined;
}

function submitPlan(submission: PlanSubmission, context: PlanContext): SubmitResult {
  if (context.submitCount >= PLAN_MAX_SUBMISSIONS) {
    return { accepted: false, kept: (context.plan ?? []).map((category) => category.tagId), errors: ["The plan has already received its one correction."] };
  }
  context.submitCount += 1;
  const guarded = applyPlanGuards(submission, context);
  // Retain valid partial work for fallback; the stop condition still permits one correction.
  context.plan = guarded.kept;
  return { accepted: guarded.kept.length >= PLAN_MIN_CATEGORIES, kept: guarded.kept.map((category) => category.tagId), errors: guarded.errors };
}

function buildSubmitPlanTool(context: PlanContext): Tool<PlanSubmission, SubmitResult | { error: string }> {
  return tool({
    description: "Submit categories with real brand/tag evidence; one correction is allowed if too few survive.",
    inputSchema: PlanSubmissionSchema,
    execute: async (submission) => {
      context.emit({ type: "tool_call", at: 0, tool: "submitPlan", summary: "Checking proposed categories and evidence" });
      try {
        const result = submitPlan(submission, context);
        context.emit({ type: "tool_result", at: 0, tool: "submitPlan", summary: `Kept ${result.kept.length} categories` });
        return result;
      } catch (error) { return handleToolError(context, error); }
    },
  });
}

async function tryAgent(context: PlanContext, options: PlanOptions): Promise<string | null> {
  if (researchStopped(context)) return "Planning stopped; using available categories.";
  if (isAgentDisabled()) return "Agent mode is disabled; using rule-based categories.";
  if (!options.model && !hasDeepSeekKey()) return "Planning model is unavailable; using rule-based categories.";
  try {
    await generateText({
      model: options.model ?? agentModel(), instructions: PLAN_SYSTEM_PROMPT, prompt: buildPlanUserPrompt(context),
      tools: { resolveBrands: buildResolveBrandsTool(context), searchCategories: buildSearchCategoriesTool(context), submitPlan: buildSubmitPlanTool(context) },
      toolChoice: "auto", ...AGENT_CALL_SETTINGS, abortSignal: AbortSignal.any([AbortSignal.timeout(PLAN_TIMEOUT_MS), context.signal]),
      stopWhen: [isStepCount(PLAN_MAX_STEPS), () => context.fatalError !== null || researchStopped(context) || (context.plan !== null &&
        (context.plan.length >= PLAN_MIN_CATEGORIES || context.submitCount >= PLAN_MAX_SUBMISSIONS))],
      onStepFinish: (step) => {
        if (step.text.trim()) context.emit({ type: "agent_note", at: 0, text: step.text.slice(0, TRACE_SUMMARY_MAX) });
      },
    });
    return (context.plan?.length ?? 0) >= PLAN_MIN_CATEGORIES ? null : "Too few valid categories survived; completing the plan with rules.";
  } catch {
    return "Planning agent unavailable; using rule-based categories.";
  }
}

async function completeBrandResolution(context: PlanContext, preserveResolved: boolean): Promise<void> {
  for (const name of context.request.brandNames) {
    if (researchStopped(context)) break;
    if (context.brandsByInput.has(name)) continue;
    await resolveBrandNames([name], context);
  }
  if (context.fatalError) throw context.fatalError;
  // Keep a successful agent plan's observed matches so popularity ties cannot detach its evidence.
  const chosenIds = new Set(chooseFallbackBrands(context, preserveResolved).map((brand) => brand.entityId));
  // An implicit first-candidate choice must not survive through an earlier partial plan.
  if (context.plan) context.plan = context.plan.map((category) => ({ ...category,
    evidence: category.evidence.filter((item) => !("brandEntityId" in item) || chosenIds.has(item.brandEntityId)),
  })).filter((category) => category.evidence.length);
}

async function completePlan(context: PlanContext, reason: string | null): Promise<PlanResponse["mode"]> {
  if (context.fatalError) throw context.fatalError;
  await completeBrandResolution(context, reason === null);
  if (!reason && (context.plan?.length ?? 0) < PLAN_MIN_CATEGORIES) reason = "Too few categories have confirmed brand matches; completing the plan with rules.";
  if (!reason) return "agent";
  context.emit({ type: "fallback", at: 0, reason });
  context.warnings.push(reason);
  // Brand finalization already applied fallback ranking where needed; keep its choices during backfill.
  const fallback = await buildFallbackPlan(context, true);
  if (context.fatalError) throw context.fatalError;
  const combined = new Map((context.plan ?? []).map((category) => [category.tagId, category]));
  for (const category of fallback) if (!combined.has(category.tagId)) combined.set(category.tagId, category);
  context.plan = Array.from(combined.values()).slice(0, PLAN_MAX_CATEGORIES);
  return "fallback";
}

function buildResponse(context: PlanContext, mode: PlanResponse["mode"], city: PlanResponse["city"], trace: TraceEvent[]): PlanResponse {
  const resolutions = [...context.brandsByInput.values()];
  const brands = resolutions.filter((resolution) => resolution.chosen).map((resolution) => ResolvedBrandSchema.parse({
    ...resolution.chosen, inputName: resolution.inputName, matchKind: resolution.matchKind ?? "fallback", candidates: resolution.candidates,
  }));
  const unresolved = context.request.brandNames.filter((name) => !context.brandsByInput.get(name)?.chosen);
  const ambiguousBrands = resolutions.filter((resolution) => !resolution.chosen && resolution.candidates.length)
    .map((resolution) => ({ inputName: resolution.inputName, candidates: resolution.candidates }));
  if (!brands.length && context.request.branches.length) context.warnings.push("None of these brands were found on Qloo");
  return PlanResponseSchema.parse({
    mode, city, branches: context.request.branches, brands, unresolved, ambiguousBrands, categories: brands.length ? context.plan ?? [] : [],
    candidateCategories: Array.from(context.candidateCategories, ([tagId, label]) => ({ tagId, label })), trace, warnings: context.warnings,
  });
}

export async function runPlan(request: PlanRequest, options: PlanOptions = {}): Promise<PlanResponse> {
  const trace: TraceEvent[] = [];
  const context = createPlanContext(expandPlanRequest(PlanRequestSchema.parse(request)), (event) => { trace.push(event); options.emit?.(event); }, options);
  const city = await resolveLocations(context);
  if (!context.request.branches.length) return buildResponse(context, "fallback", city, trace);
  context.emit({ type: "step", at: 0, step: "resolve_brands", status: "start", summary: "Resolving member brands" });
  context.emit({ type: "step", at: 0, step: "pick_categories", status: "start", summary: "Finding supported merchant categories" });
  const reason = await tryAgent(context, options);
  const mode = await completePlan(context, reason);
  context.emit({ type: "step", at: 0, step: "resolve_brands", status: "done", summary: `Checked ${context.brandsByInput.size} brand names` });
  context.emit({ type: "step", at: 0, step: "pick_categories", status: "done", summary: `Prepared ${context.plan?.length ?? 0} categories for confirmation` });
  options.onCacheable?.(!researchStopped(context) && context.cacheable);
  return buildResponse(context, mode, city, trace);
}
