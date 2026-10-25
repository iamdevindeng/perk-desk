// Manages planning and research requests, including invalidation of late responses.
// Called by: src/app/page.tsx to coordinate request state and step navigation
import { useEffect, useRef, useState } from "react";
import { RUN_MAX_CATEGORIES } from "@/lib/config";
import { dedupeMerchants } from "@/lib/merchants/dedupe";
import type { PageNavigation } from "@/lib/page-navigation";
import { buildPlanRequest, buildRunRequest, mergePreferences, presetRequestChanges } from "@/lib/request-builders";
import { isRunRequestError, postPlan, streamRun } from "@/lib/run-client";
import type { CategoryTag, PlanResponse, Profile, RunResult, TraceEvent } from "@/lib/types";

export type Stage = "edit" | "planning" | "confirm" | "running" | "results";
type PlanInputs = { navigation: PageNavigation; profile: Profile; brandsText: string; presetId?: string; updateProfile: (profile: Profile) => void; setStage: (stage: Stage) => void };
type ResearchInputs = PlanInputs & { plan: PlanResponse | null; categories: CategoryTag[]; overrides: Record<string, string>; needsReplan: boolean; setErrorMessage: (message: string) => void };
type PlanningState = {
  plan: PlanResponse | null; canonicalPlan: PlanResponse | null; confirmedCategories: CategoryTag[];
  setConfirmedCategories: (categories: CategoryTag[]) => void;
  brandOverrides: Record<string, string>; setBrandOverrides: (overrides: Record<string, string>) => void;
  needsReplan: boolean; errorMessage: string; setErrorMessage: (message: string) => void;
  startPlan: () => Promise<void>; clear: () => void;
};
type ResearchState = { runEvents: TraceEvent[]; result: RunResult | null; clear: () => void; startRun: () => Promise<void> };

function useRequestVersion() {
  const versionRef = useRef(0);
  useEffect(() => () => { versionRef.current += 1; }, []);
  return versionRef;
}

function requestError(error: unknown): string {
  if (error instanceof Error && error.name !== "ZodError") return error.message;
  return "Check your profile, branch locations, and category choices, then try again.";
}

export function usePlanning(input: PlanInputs): PlanningState {
  const versionRef = useRequestVersion();
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [canonicalPlan, setCanonicalPlan] = useState<PlanResponse | null>(null);
  const [confirmedCategories, setConfirmedCategories] = useState<CategoryTag[]>([]);
  const [brandOverrides, setBrandOverrides] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  async function startPlan(): Promise<void> {
    const requestVersion = ++versionRef.current;
    input.navigation.cancel(); input.setStage("planning"); setErrorMessage("");
    try {
      const response = await postPlan(buildPlanRequest(input.profile, input.brandsText, input.presetId, brandOverrides));
      if (requestVersion !== versionRef.current) return;
      if (input.presetId && !response.limited && !presetRequestChanges({ ...input, brandOverrides }).plan) setCanonicalPlan(response);
      setPlan(response); setConfirmedCategories(response.categories.slice(0, RUN_MAX_CATEGORIES)); input.setStage("confirm");
      if (!response.limited) input.navigation.navigate("category-confirm-heading");
      input.updateProfile({ ...input.profile, branches: input.profile.branches.map((branch) => response.branches.find((located) => located.id === branch.id) ?? branch) });
    } catch (error) {
      if (requestVersion !== versionRef.current) return;
      setErrorMessage(requestError(error)); input.setStage("edit");
    }
  }
  function clear(): void { input.navigation.cancel(); versionRef.current += 1; setPlan(null); setCanonicalPlan(null); setBrandOverrides({}); setConfirmedCategories([]); setErrorMessage(""); }
  const needsReplan = plan !== null && Object.entries(brandOverrides).some(([name, entityId]) => plan.brands.find((brand) => brand.inputName === name)?.entityId !== entityId);
  return { plan, canonicalPlan, confirmedCategories, setConfirmedCategories, brandOverrides, setBrandOverrides, needsReplan, errorMessage, setErrorMessage, startPlan, clear };
}

export function useResearch(input: ResearchInputs): ResearchState {
  const versionRef = useRequestVersion();
  const [runEvents, setRunEvents] = useState<TraceEvent[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  function clear(): void { input.navigation.cancel(); versionRef.current += 1; setRunEvents([]); setResult(null); }
  async function startRun(): Promise<void> {
    if (!input.plan || input.needsReplan || !input.categories.length) return;
    clear(); input.setStage("running"); input.setErrorMessage(""); input.navigation.navigate("research-progress-heading");
    const requestVersion = versionRef.current;
    let succeeded = false;
    try {
      const profile = { ...input.profile, categoryPreferences: mergePreferences(input.profile.categoryPreferences, input.plan.categories, input.categories) };
      const request = buildRunRequest(profile, input.plan, input.categories, input.overrides, input.presetId);
      input.updateProfile(profile);
      await streamRun(request, (event) => {
        if (requestVersion !== versionRef.current) return;
        setRunEvents((previous) => [...previous, event]);
        if (event.type === "result") { setResult(dedupeMerchants(event.result)); succeeded = true; input.navigation.navigate("merchant-results-heading"); }
      });
    } catch (error) {
      if (requestVersion !== versionRef.current) return;
      input.navigation.cancel();
      const message = requestError(error);
      const serverError = isRunRequestError(error) ? error : null;
      setRunEvents((previous) => [...previous, { type: "error", at: 0, code: serverError?.code ?? "internal", message: serverError?.message ?? "Something went wrong." }]);
      input.setErrorMessage(message); setResult(null); succeeded = false;
    }
    if (requestVersion !== versionRef.current) return;
    input.setStage(succeeded ? "results" : "confirm");
  }
  return { runEvents, result, clear, startRun };
}
