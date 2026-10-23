// Holds per-request agent state and emits safe progress events for tools and fallback paths.
// Called by: plan/run orchestration, agent tools, and unit tests
import { getCategoryDefaults, getCategoryLabel } from "@/lib/data";
import { isQlooError, type QlooCallOptions, type QlooError } from "@/lib/qloo/client";
import type {
  BrandCandidate, MerchantCandidate, PlannedCategory, PlanRequest, ResolvedBrand,
  RunRequest, RunResult, TagRef, TraceEvent,
} from "@/lib/types";

export type BrandResolution = {
  inputName: string; status: "resolved" | "ambiguous" | "unresolved";
  chosen?: BrandCandidate; matchKind?: ResolvedBrand["matchKind"]; candidates: BrandCandidate[];
};
export type CategoryOutcome = {
  tagId: string; label: string; candidates: MerchantCandidate[]; independentCount: number;
};
export type PlanContext = {
  request: PlanRequest; emit: (event: TraceEvent) => void;
  brandsByInput: Map<string, BrandResolution>; brandTags: Map<string, TagRef[]>;
  candidateCategories: Map<string, string>; knownDensities: Map<string, number>;
  submitCount: number; plan: PlannedCategory[] | null; qlooCalls: number;
  warnings: string[]; fatalError: QlooError | null;
};
export type RunContext = {
  request: RunRequest; emit: (event: TraceEvent) => void;
  results: Map<string, CategoryOutcome>; replacements: Map<string, string>;
  candidateCategories: Map<string, string>; knownDensities: Map<string, number>;
  pendingCategories: Set<string>; finished: boolean; qlooCalls: number;
  excludedCounts: RunResult["excludedCounts"]; warnings: string[]; fatalError: QlooError | null;
};

function timedEmitter(onEvent: (event: TraceEvent) => void): (event: TraceEvent) => void {
  const startedAt = Date.now();
  return (event) => onEvent({ ...event, at: Date.now() - startedAt });
}

export function createPlanContext(request: PlanRequest, emit: (event: TraceEvent) => void = () => undefined): PlanContext {
  return {
    request, emit: timedEmitter(emit), brandsByInput: new Map(), brandTags: new Map(),
    candidateCategories: new Map(), knownDensities: new Map(), submitCount: 0,
    plan: null, qlooCalls: 0, warnings: [], fatalError: null,
  };
}

export function createRunContext(request: RunRequest, emit: (event: TraceEvent) => void = () => undefined): RunContext {
  const candidateCategories = new Map(request.categories.map((category) => [category.tagId, category.label]));
  for (const category of request.categories) {
    const defaults = getCategoryDefaults().categories.find((entry) => entry.tagId === category.tagId);
    for (const adjacent of defaults?.adjacent ?? []) candidateCategories.set(adjacent, getCategoryLabel(adjacent));
  }
  return {
    request, emit: timedEmitter(emit), results: new Map(), replacements: new Map(), candidateCategories,
    knownDensities: new Map(), pendingCategories: new Set(), finished: false, qlooCalls: 0,
    excludedCounts: { nationalChain: 0, noiseGenre: 0, closed: 0, signedOrExcluded: 0 }, warnings: [], fatalError: null,
  };
}

export function contextQlooOptions(context: PlanContext | RunContext): QlooCallOptions {
  return { onCall(info) {
    if (!info.cached) context.qlooCalls += 1;
    context.emit({ type: "qloo_call", at: 0, ...info });
  } };
}

export function handleToolError(context: PlanContext | RunContext, error: unknown): { error: string } {
  if (isQlooError(error) && ["config", "auth", "quota"].includes(error.code)) {
    // SDK tool execution may capture a throw; orchestration must also check this flag.
    context.fatalError = error;
    throw error;
  }
  const message = "This lookup failed; try another category or continue with available results.";
  context.warnings.push(message);
  return { error: message };
}
