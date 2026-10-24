// Holds per-request agent state and emits safe progress events for tools and fallback paths.
// Called by: plan/run orchestration, agent tools, and unit tests
import { PLAN_DEADLINE_MS, QLOO_FAILURE_LIMIT, RESEARCH_BUDGET_MESSAGE, RUN_DEADLINE_MS } from "@/lib/config";
import { getCategoryDefaults, getCategoryLabel } from "@/lib/data";
import { createQlooError, isQlooError, type QlooCallOptions, type QlooError } from "@/lib/qloo/client";
import type {
  BrandCandidate, MerchantCandidate, PlannedCategory, PlanRequest, ResolvedBrand,
  RunRequest, RunResult, TagRef, TraceEvent,
} from "@/lib/types";

export type BrandResolution = {
  inputName: string; status: "resolved" | "ambiguous" | "unresolved";
  chosen?: BrandCandidate; matchKind?: ResolvedBrand["matchKind"]; candidates: BrandCandidate[];
};
export type CategoryOutcome = {
  tagId: string; label: string; candidates: MerchantCandidate[]; independentCount: number; complete: boolean;
};
export type ResearchOptions = { signal?: AbortSignal; deadlineAt?: number };
type ResearchControl = {
  signal: AbortSignal; deadlineAt: number; qlooDown: boolean; qlooErrors: number;
  seenErrors: Set<QlooError>; lastQlooError: QlooError | null;
};
export type PlanContext = ResearchControl & {
  request: PlanRequest; emit: (event: TraceEvent) => void;
  brandsByInput: Map<string, BrandResolution>; brandTags: Map<string, TagRef[]>;
  candidateCategories: Map<string, string>; knownDensities: Map<string, number>;
  submitCount: number; plan: PlannedCategory[] | null; qlooCalls: number;
  budgetReached: boolean; warnings: string[]; fatalError: QlooError | null;
};
export type RunContext = ResearchControl & {
  request: RunRequest; emit: (event: TraceEvent) => void;
  results: Map<string, CategoryOutcome>; replacements: Map<string, string>;
  candidateCategories: Map<string, string>; knownDensities: Map<string, number>;
  pendingCategories: Set<string>; finished: boolean; qlooCalls: number; successfulLookups: number; cacheable: boolean;
  excludedCounts: RunResult["excludedCounts"]; budgetReached: boolean; warnings: string[]; fatalError: QlooError | null;
};

function timedEmitter(onEvent: (event: TraceEvent) => void): (event: TraceEvent) => void {
  const startedAt = Date.now();
  return (event) => onEvent({ ...event, at: Date.now() - startedAt });
}

export function createPlanContext(request: PlanRequest, emit: (event: TraceEvent) => void = () => undefined, options: ResearchOptions = {}): PlanContext {
  return {
    ...researchControl(options, PLAN_DEADLINE_MS), request, emit: timedEmitter(emit), brandsByInput: new Map(), brandTags: new Map(),
    candidateCategories: new Map(), knownDensities: new Map(), submitCount: 0,
    plan: null, qlooCalls: 0, budgetReached: false, warnings: [], fatalError: null,
  };
}

export function createRunContext(request: RunRequest, emit: (event: TraceEvent) => void = () => undefined, options: ResearchOptions = {}): RunContext {
  const candidateCategories = new Map(request.categories.map((category) => [category.tagId, category.label]));
  for (const category of request.categories) {
    const defaults = getCategoryDefaults().categories.find((entry) => entry.tagId === category.tagId);
    for (const adjacent of defaults?.adjacent ?? []) candidateCategories.set(adjacent, getCategoryLabel(adjacent));
  }
  return {
    ...researchControl(options, RUN_DEADLINE_MS), request, emit: timedEmitter(emit), results: new Map(), replacements: new Map(), candidateCategories,
    knownDensities: new Map(), pendingCategories: new Set(), finished: false, qlooCalls: 0, successfulLookups: 0, cacheable: true,
    excludedCounts: { nationalChain: 0, noiseGenre: 0, closed: 0, signedOrExcluded: 0 }, budgetReached: false, warnings: [], fatalError: null,
  };
}

function researchControl(options: ResearchOptions, timeout: number): ResearchControl {
  return { signal: options.signal ?? AbortSignal.timeout(timeout), deadlineAt: options.deadlineAt ?? Date.now() + timeout,
    qlooDown: false, qlooErrors: 0, seenErrors: new Set(), lastQlooError: null };
}

export function stopResearch(context: PlanContext | RunContext, message: string): void {
  if ("cacheable" in context) context.cacheable = false;
  if (context.warnings.includes(message)) return;
  context.warnings.push(message);
  context.emit({ type: "agent_note", at: 0, text: message });
}

export function researchStopped(context: PlanContext | RunContext): boolean {
  if (context.budgetReached) return true;
  if (context.signal.aborted || Date.now() >= context.deadlineAt) {
    stopResearch(context, "Stopped early because research time ended; available results were kept.");
    return true;
  }
  return context.qlooDown;
}

export function hasResearchTime(context: RunContext, minimum: number): boolean {
  if (researchStopped(context)) return false;
  if (context.deadlineAt - Date.now() >= minimum) return true;
  stopResearch(context, "Stopped extra research to finish on time; available results were kept.");
  return false;
}

function recordQlooFailure(context: PlanContext | RunContext, error: QlooError): void {
  if (context.seenErrors.has(error) || context.signal.aborted || !["timeout", "upstream", "network"].includes(error.code)) return;
  context.seenErrors.add(error);
  context.qlooErrors += 1;
  context.lastQlooError = error;
  if (context.qlooErrors < QLOO_FAILURE_LIMIT) return;
  context.qlooDown = true;
  stopResearch(context, "Stopped early because Qloo is having trouble; available results were kept.");
}

export function contextQlooOptions(context: PlanContext | RunContext): QlooCallOptions {
  return {
    signal: context.signal,
    beforeCall() {
      if (context.qlooDown && context.lastQlooError) throw context.lastQlooError;
      if (researchStopped(context)) throw createQlooError(context.budgetReached ? "budget" : "timeout", null, "Research stopped.");
    },
    onError(error) { recordQlooFailure(context, error); },
    onCall(info) {
      if (!info.cached) context.qlooCalls += 1;
      context.emit({ type: "qloo_call", at: 0, ...info });
    },
  };
}

export function handleToolError(
  context: PlanContext | RunContext, error: unknown, message = "This lookup failed; try another category or continue with available results.",
): { error: string } {
  if (isQlooError(error)) recordQlooFailure(context, error);
  if (isQlooError(error) && error.code === "budget") {
    if (!context.budgetReached) {
      context.emit({ type: "agent_note", at: 0, text: RESEARCH_BUDGET_MESSAGE });
      context.warnings.push(RESEARCH_BUDGET_MESSAGE);
    }
    context.budgetReached = true;
  }
  if (isQlooError(error) && ["config", "auth", "quota"].includes(error.code)) {
    // SDK tool execution may capture a throw; orchestration must also check this flag.
    context.fatalError = error;
    throw error;
  }
  if ("cacheable" in context) context.cacheable = false;
  context.warnings.push(message);
  return { error: message };
}
