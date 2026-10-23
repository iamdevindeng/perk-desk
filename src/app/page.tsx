"use client";
// Coordinates the editable program profile, planning request, and branch map.
// Called by: Next.js App Router as the single Perk Desk page
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactElement } from "react";
import PresetPicker from "@/components/PresetPicker";
import ProfileForm from "@/components/ProfileForm";
import TasteInput from "@/components/TasteInput";
import CategoryConfirm from "@/components/CategoryConfirm";
import AgentTrace from "@/components/AgentTrace";
import { Button } from "@/components/ui/button";
import { DEFAULT_RADIUS_M, RUN_MAX_CATEGORIES } from "@/lib/config";
import { getCities } from "@/lib/data";
import { loadProfile, saveProfile } from "@/lib/profile-storage";
import { buildPlanRequest, buildRunRequest, mergePreferences } from "@/lib/request-builders";
import { postPlan, streamRun } from "@/lib/run-client";
import { ProfileSchema, type CategoryTag, type PlanResponse, type Preset, type Profile, type RunResult, type TraceEvent } from "@/lib/types";

const MerchantMap = dynamic(() => import("@/components/MerchantMap"), {
  ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-label="Loading map" />,
});

type Stage = "edit" | "planning" | "confirm" | "running" | "results";

function emptyProfile(): Profile {
  return { institutionName: "", city: getCities()[0].label,
    branches: [{ id: "branch-1", name: "Main branch", address: "", radiusMeters: DEFAULT_RADIUS_M }],
    signedMerchantsText: "", businessMembersText: "", categoryPreferences: { removed: [], added: [] }, merchantStatus: {} };
}

function canPlan(profile: Profile, brandsText: string): boolean {
  try { buildPlanRequest(profile, brandsText); return true; }
  catch { return false; }
}

function requestError(error: unknown): string {
  if (error instanceof Error && error.name !== "ZodError") return error.message;
  return "Check your profile, branch locations, and category choices, then try again.";
}

function useSavedProfile() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    // Read browser storage after hydration, preserving identical server/client initial markup.
    queueMicrotask(() => { if (mounted) { setProfile(loadProfile() ?? emptyProfile()); setReady(true); } });
    return () => { mounted = false; };
  }, []);
  function updateProfile(next: Profile): void { setProfile(next); saveProfile(next); }
  return { profile, updateProfile, ready };
}

type PlanInputs = { profile: Profile; brandsText: string; presetId?: string; updateProfile: (profile: Profile) => void; setStage: (stage: Stage) => void };

function usePlanning(input: PlanInputs) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [confirmedCategories, setConfirmedCategories] = useState<CategoryTag[]>([]);
  const [brandOverrides, setBrandOverrides] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  async function startPlan(): Promise<void> {
    input.setStage("planning"); setErrorMessage("");
    try {
      const response = await postPlan(buildPlanRequest(input.profile, input.brandsText, input.presetId, brandOverrides));
      setPlan(response); setConfirmedCategories(response.categories.slice(0, RUN_MAX_CATEGORIES)); input.setStage("confirm");
      input.updateProfile({ ...input.profile, branches: input.profile.branches.map((branch) => response.branches.find((located) => located.id === branch.id) ?? branch) });
    } catch (error) { setErrorMessage(requestError(error)); input.setStage("edit"); }
  }
  function clear(): void { setPlan(null); setBrandOverrides({}); setConfirmedCategories([]); setErrorMessage(""); }
  const needsReplan = plan !== null && Object.entries(brandOverrides).some(([name, entityId]) => plan.brands.find((brand) => brand.inputName === name)?.entityId !== entityId);
  return { plan, confirmedCategories, setConfirmedCategories, brandOverrides, setBrandOverrides, needsReplan, errorMessage, setErrorMessage, startPlan, clear };
}

type ResearchInputs = PlanInputs & { plan: PlanResponse | null; categories: CategoryTag[]; overrides: Record<string, string>; needsReplan: boolean; setErrorMessage: (message: string) => void };

function useResearch(input: ResearchInputs) {
  const [runEvents, setRunEvents] = useState<TraceEvent[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  function clear(): void { setRunEvents([]); setResult(null); }
  async function startRun(): Promise<void> {
    if (!input.plan || input.needsReplan || !input.categories.length) return;
    clear(); input.setStage("running"); input.setErrorMessage("");
    let succeeded = false;
    try {
      const profile = { ...input.profile, categoryPreferences: mergePreferences(input.profile.categoryPreferences, input.plan.categories, input.categories) };
      const request = buildRunRequest(profile, input.plan, input.categories, input.overrides, input.presetId);
      input.updateProfile(profile);
      await streamRun(request, (event) => {
        setRunEvents((previous) => [...previous, event]);
        if (event.type === "result") { setResult(event.result); succeeded = true; }
      });
    } catch (error) {
      const message = requestError(error);
      setRunEvents((previous) => [...previous, { type: "error", at: 0, code: "internal", message }]);
      input.setErrorMessage(message); setResult(null); succeeded = false;
    }
    input.setStage(succeeded ? "results" : "confirm");
  }
  return { runEvents, result, clear, startRun };
}

function ResultPreview({ result }: { result: RunResult }): ReactElement {
  return <section className="rounded-xl border border-teal-200 bg-teal-50 p-5" aria-label="Research result">
    <h2 className="font-semibold text-teal-950">{result.merchants.length} merchants found · {result.mode === "agent" ? "Agent" : "Fallback"}</h2>
    <ul className="mt-3 space-y-1 text-sm">{result.merchants.map((merchant) => <li key={merchant.place.entityId}>{merchant.place.name}</li>)}</ul>
  </section>;
}

export default function Home(): ReactElement {
  const { profile, updateProfile, ready } = useSavedProfile();
  const [brandsText, setBrandsText] = useState("");
  const [presetId, setPresetId] = useState<string>();
  const [stage, setStage] = useState<Stage>("edit");
  const [pickingBranchId, setPickingBranchId] = useState<string>();
  const inputs = { profile, brandsText, presetId, updateProfile, setStage };
  const planning = usePlanning(inputs);
  const research = useResearch({ ...inputs, plan: planning.plan, categories: planning.confirmedCategories,
    overrides: planning.brandOverrides, needsReplan: planning.needsReplan, setErrorMessage: planning.setErrorMessage });
  const { plan, errorMessage } = planning;
  const busy = stage === "planning" || stage === "running";
  const center = getCities().find((city) => city.label === profile.city) ?? plan?.city ?? getCities()[0];
  function editProfile(next: Profile): void {
    updateProfile(next); setPresetId(undefined); planning.clear(); research.clear(); setStage("edit");
    if (!next.branches.some((branch) => branch.id === pickingBranchId)) setPickingBranchId(undefined);
  }
  function editBrands(text: string): void { setBrandsText(text); setPresetId(undefined); planning.clear(); research.clear(); setStage("edit"); }
  function selectPreset(preset: Preset): void {
    updateProfile(ProfileSchema.parse({ ...preset.profile, branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })) }));
    setBrandsText(preset.brandsText); setPresetId(preset.id); planning.clear(); research.clear(); setStage("edit"); setPickingBranchId(undefined);
  }
  function pickLocation(point: { lat: number; lon: number }): void {
    editProfile({ ...profile, branches: profile.branches.map((branch) => branch.id === pickingBranchId ? { ...branch, ...point, locationSource: "map" } : branch) });
    setPickingBranchId(undefined);
  }
  function startPlan(): void { research.clear(); setPickingBranchId(undefined); void planning.startPlan(); }
  const trace = research.runEvents.length ? research.runEvents : plan?.trace ?? [];
  const visibleTrace: TraceEvent[] = plan?.limited && !research.runEvents.length
    ? [...trace, { type: "limited", at: 0, message: plan.message ?? "The live-run limit is reached." }] : trace;
  return <main className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-8 sm:px-8 lg:py-12">
    <header className="mb-8 max-w-3xl">
      <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-teal-700">Perk Desk</p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Find your next local partners.</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">Turn the brands your members love into a focused list of local merchants near your branches.</p>
    </header>
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <PresetPicker onSelect={selectPreset} disabled={busy || !ready} />
        <ProfileForm profile={profile} onChange={editProfile} pickingBranchId={pickingBranchId}
          onPickBranch={(id) => setPickingBranchId(id === pickingBranchId ? undefined : id)} disabled={busy || !ready} />
        <TasteInput value={brandsText} onChange={editBrands} disabled={busy || !ready} />
        {errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessage}</p>}
        <Button onClick={startPlan} disabled={!ready || busy || !canPlan(profile, brandsText)} className="w-full bg-teal-800 py-3 hover:bg-teal-900">
          {stage === "planning" ? "Planning…" : "Plan merchant categories"}
        </Button>
        {stage === "planning" && <p role="status" className="text-sm text-slate-500">Resolving brands and finding supported categories…</p>}
        {plan && <CategoryConfirm plan={plan} confirmedCategories={planning.confirmedCategories}
          onChange={(categories) => { planning.setConfirmedCategories(categories); research.clear(); planning.setErrorMessage(""); setStage("confirm"); }}
          brandOverrides={planning.brandOverrides} needsReplan={planning.needsReplan} disabled={busy}
          onBrandOverride={(name, entityId) => { planning.setBrandOverrides({ ...planning.brandOverrides, [name]: entityId }); research.clear(); }}
          onReplan={startPlan} onConfirm={research.startRun} />}
        {visibleTrace.length > 0 && <AgentTrace events={visibleTrace} disabled={busy}
          onRetry={research.runEvents.length ? research.startRun : startPlan} />}
        {research.result && <ResultPreview result={research.result} />}
      </div>
      <aside className="min-w-0 lg:sticky lg:top-6">
        <MerchantMap center={center} branches={profile.branches} merchants={[]} onSelectMerchant={() => undefined}
          onPickLocation={pickingBranchId ? pickLocation : undefined} />
        <p className="mt-3 text-xs leading-5 text-slate-500">Circles show each branch’s trade area. Address matches may be approximate; use “Pick on map” to refine a location.</p>
      </aside>
    </div>
  </main>;
}
