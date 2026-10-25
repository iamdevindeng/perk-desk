"use client";
// Coordinates the editable program profile, planning request, and branch map.
// Called by: Next.js App Router as the single Perk Desk page
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import PresetPicker from "@/components/PresetPicker";
import ProgramIntro from "@/components/ProgramIntro";
import ProgramHeader from "@/components/ProgramHeader";
import ProfileForm from "@/components/ProfileForm";
import TasteInput from "@/components/TasteInput";
import CategoryConfirm from "@/components/CategoryConfirm";
import AgentTrace from "@/components/AgentTrace";
import { MerchantResults } from "@/components/MerchantCard";
import { Button } from "@/components/ui/button";
import { LIVE_LIMIT_MESSAGE, PAGE_SCROLL_OFFSET_PX } from "@/lib/config";
import { getCities } from "@/lib/data";
import { emptyProfile, isEmptyProfile, loadProfile, rememberBranchesByCity, saveProfile } from "@/lib/profile-storage";
import { usePageNavigation, type PageNavigation } from "@/lib/page-navigation";
import { buildPlanRequest, presetRequestChanges } from "@/lib/request-builders";
import { usePlanning, useResearch, type Stage } from "@/lib/page-research";
import { ProfileSchema, type Branch, type BranchLookupResponse, type MerchantResult, type MerchantStatus, type Preset, type Profile, type TraceEvent } from "@/lib/types";

const MerchantMap = dynamic(() => import("@/components/MerchantMap"), {
  ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" aria-label="Loading map" />,
});

function useStage() {
  const [stage, updateStage] = useState<Stage>("edit");
  const busyRef = useRef(false);
  function setStage(next: Stage): void { busyRef.current = next === "planning" || next === "running"; updateStage(next); }
  return { stage, setStage, busyRef };
}

function branchHasLocation(branch: Branch): boolean { return (branch.lat !== undefined && branch.lon !== undefined) || branch.address.trim().length > 0; }

function canPlan(profile: Profile, brandsText: string): boolean {
  try { buildPlanRequest(profile, brandsText); return profile.branches.every(branchHasLocation); }
  catch { return false; }
}

function useSavedProfile() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [branchCandidates, setBranchCandidates] = useState<BranchLookupResponse["places"]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    // Read browser storage after hydration, preserving identical server/client initial markup.
    queueMicrotask(() => { if (mounted) { setProfile(loadProfile() ?? emptyProfile()); setReady(true); } });
    return () => { mounted = false; };
  }, []);
  function updateProfile(next: Profile): void {
    if (next.city !== profile.city) setBranchCandidates([]);
    setProfile(next); saveProfile(next);
  }
  return { profile, updateProfile, ready, branchCandidates, setBranchCandidates };
}

type ProfileActionsInput = {
  profile: Profile; brandsText: string; hasOutput: boolean; pickingBranchId?: string;
  navigation: PageNavigation; updateProfile: (profile: Profile) => void; setStage: (stage: Stage) => void;
  clearPlanning: () => void; clearResearch: () => void;
  setBrandsText: (text: string) => void; setPresetId: (id: string | undefined) => void;
  setBranchLookupVersion: (update: (version: number) => number) => void; setBranchCandidates: (places: BranchLookupResponse["places"]) => void;
  setPickingBranchId: (id: string | undefined) => void; setSelectedMerchantId: (id: string | undefined) => void; setIndependentsOnly: (value: boolean) => void;
};

function profileActions(input: ProfileActionsInput) {
  function clearResults(): void { input.clearPlanning(); input.clearResearch(); input.setStage("edit"); }
  function editProfile(next: Profile): void {
    input.updateProfile(next); input.setPresetId(undefined); clearResults();
    if (!next.branches.some((branch) => branch.id === input.pickingBranchId)) input.setPickingBranchId(undefined);
  }
  function editBrands(text: string): void { input.setBrandsText(text); input.setPresetId(undefined); clearResults(); }
  function selectPreset(preset: Preset): void {
    const profile = ProfileSchema.parse({ ...preset.profile, branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })) });
    input.updateProfile({ ...profile, branchesByCity: rememberBranchesByCity(input.profile) });
    input.setBrandsText(preset.brandsText); input.setPresetId(preset.id); input.setBranchLookupVersion((version) => version + 1);
    input.setBranchCandidates([]); clearResults(); input.setPickingBranchId(undefined); input.navigation.navigate("plan-categories-button");
  }
  function startBlank(): void {
    const alreadyBlank = isEmptyProfile(input.profile) && input.brandsText === "" && !input.hasOutput;
    if (!alreadyBlank && !window.confirm("Start blank? This clears your profile, branches, member brands and results in this browser.")) return;
    input.updateProfile(emptyProfile()); input.setBrandsText(""); input.setPresetId(undefined); clearResults();
    input.setPickingBranchId(undefined); input.setSelectedMerchantId(undefined); input.setIndependentsOnly(false); input.setBranchCandidates([]);
    input.setBranchLookupVersion((version) => version + 1); input.navigation.navigate("institution-name");
  }
  return { editProfile, editBrands, selectPreset, startBlank };
}

export default function Home(): ReactElement {
  const { profile, updateProfile, ready, branchCandidates, setBranchCandidates } = useSavedProfile();
  const [brandsText, setBrandsText] = useState("");
  const [presetId, setPresetId] = useState<string>();
  const [branchLookupVersion, setBranchLookupVersion] = useState(0);
  const { stage, setStage, busyRef } = useStage();
  const [pickingBranchId, setPickingBranchId] = useState<string>();
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>();
  const [independentsOnly, setIndependentsOnly] = useState(false);
  const navigation = usePageNavigation();
  const inputs = { profile, brandsText, presetId, updateProfile, setStage, navigation };
  const planning = usePlanning(inputs);
  const research = useResearch({ ...inputs, plan: planning.plan, categories: planning.confirmedCategories, overrides: planning.brandOverrides, needsReplan: planning.needsReplan, setErrorMessage: planning.setErrorMessage });
  const visibleMerchants = useMemo(() => (research.result?.merchants ?? []).filter((merchant) => !independentsOnly || !merchant.multiLocation), [research.result, independentsOnly]);
  const { plan, errorMessage } = planning;
  const changes = presetRequestChanges({ ...inputs, brandOverrides: planning.brandOverrides, plan, canonicalPlan: planning.canonicalPlan, confirmedCategories: planning.confirmedCategories });
  const busy = stage === "planning" || stage === "running";
  const center = getCities().find((city) => city.label === profile.city) ?? plan?.city ?? getCities()[0];
  const { editProfile, editBrands, selectPreset, startBlank: resetBlank } = profileActions({ ...inputs, pickingBranchId,
    clearPlanning: planning.clear, clearResearch: research.clear, hasOutput: Boolean(plan || research.result),
    setBrandsText, setPresetId, setBranchLookupVersion, setBranchCandidates, setPickingBranchId, setSelectedMerchantId, setIndependentsOnly });
  function startBlank(): void { if (ready && !busyRef.current) resetBlank(); }
  function pickLocation(point: { lat: number; lon: number }): void {
    if (busyRef.current || !pickingBranchId) return;
    editProfile({ ...profile, branches: profile.branches.map((branch) => branch.id === pickingBranchId ? { ...branch, ...point, locationSource: "map" } : branch) });
    setPickingBranchId(undefined);
  }
  function changeStatus(merchant: MerchantResult, status: MerchantStatus): void {
    updateProfile({ ...profile, merchantStatus: { ...profile.merchantStatus,
      [merchant.place.entityId]: { name: merchant.place.name, status, updatedAt: new Date().toISOString() } } });
  }
  function selectMapMerchant(entityId: string): void {
    setSelectedMerchantId(entityId); document.getElementById(`merchant-${entityId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function startRun(): void { if (!busyRef.current) { setPickingBranchId(undefined); void research.startRun(); } }
  function startPlan(): void { research.clear(); setPickingBranchId(undefined); void planning.startPlan(); }
  const trace = research.runEvents.length ? research.runEvents : plan?.trace ?? [];
  const visibleTrace: TraceEvent[] = plan?.limited && !research.runEvents.length
    ? [...trace, { type: "limited", at: 0, message: plan.message ?? LIVE_LIMIT_MESSAGE }] : trace;
  return <><ProgramHeader /><main className="mx-auto w-full max-w-[1440px] flex-1 px-5 py-8 sm:px-8 lg:py-12">
    <ProgramIntro />
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <PresetPicker onSelect={selectPreset} onStartBlank={startBlank} disabled={busy || !ready} />
        <ProfileForm key={`profile-${branchLookupVersion}`} profile={profile} onChange={editProfile} pickingBranchId={pickingBranchId} branchLookupVersion={branchLookupVersion} onPreviewChange={setBranchCandidates}
          onPickBranch={(id) => setPickingBranchId(id === pickingBranchId ? undefined : id)} disabled={busy || !ready} />
        <TasteInput key={`taste-${branchLookupVersion}`} value={brandsText} onChange={editBrands} disabled={busy || !ready} />
        {errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessage}</p>}
        <Button id="plan-categories-button" onClick={startPlan} disabled={!ready || busy || !canPlan(profile, brandsText)} className="w-full bg-teal-800 py-3 hover:bg-teal-900"
          aria-describedby={profile.branches.every(branchHasLocation) ? undefined : "branch-location-hint"}>
          {stage === "planning" ? "Planning…" : "Plan merchant categories"}
        </Button>
        {!profile.branches.every(branchHasLocation) && <p id="branch-location-hint" className="text-sm text-slate-500">Add an address or pick a map location for every branch.</p>}
        {changes.plan && <p className="text-xs text-slate-500">Changes run live research and count toward today&apos;s limit.</p>}
        {stage === "planning" && <p role="status" className="text-sm text-slate-500">Resolving brands and finding supported categories…</p>}
        {plan && <CategoryConfirm plan={plan} confirmedCategories={planning.confirmedCategories}
          onChange={(categories) => { planning.setConfirmedCategories(categories); research.clear(); planning.setErrorMessage(""); setStage("confirm"); }}
          brandOverrides={planning.brandOverrides} needsReplan={planning.needsReplan} disabled={busy} liveResearchChanges={changes.run}
          onBrandOverride={(name, entityId) => { planning.setBrandOverrides({ ...planning.brandOverrides, [name]: entityId }); research.clear(); }}
          onReplan={startPlan} onConfirm={startRun} />}
        {(stage === "running" || visibleTrace.length > 0) && <AgentTrace events={visibleTrace} disabled={busy} onRetry={research.runEvents.length ? startRun : startPlan} />}
        {research.result && <MerchantResults result={research.result} profile={profile} brands={plan?.brands} selectedMerchantId={selectedMerchantId}
          independentsOnly={independentsOnly} onIndependentsOnlyChange={setIndependentsOnly}
          onSelectMerchant={setSelectedMerchantId} onStatusChange={changeStatus} />}
      </div>
      <aside id="merchant-map-card" tabIndex={-1} aria-label="Your local area map" className="min-w-0 lg:sticky lg:top-[var(--page-scroll-offset)]"
        style={{ "--page-scroll-offset": `${PAGE_SCROLL_OFFSET_PX}px` } as CSSProperties}>
        <MerchantMap center={center} branches={profile.branches} candidates={branchCandidates} merchants={visibleMerchants} selectedMerchantId={selectedMerchantId} onSelectMerchant={selectMapMerchant}
          onPickLocation={!busy && pickingBranchId ? pickLocation : undefined} />
        <p className="mt-3 text-xs leading-5 text-slate-500">Circles show each branch’s trade area. Address matches may be approximate; use “Pick on map” to refine a location.</p>
      </aside>
    </div>
  </main></>;
}
