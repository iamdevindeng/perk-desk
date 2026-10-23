"use client";
// Coordinates the editable program profile, planning request, and branch map.
// Called by: Next.js App Router as the single Perk Desk page
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactElement } from "react";
import PresetPicker from "@/components/PresetPicker";
import ProfileForm from "@/components/ProfileForm";
import TasteInput from "@/components/TasteInput";
import { Button } from "@/components/ui/button";
import { DEFAULT_RADIUS_M } from "@/lib/config";
import { getCities } from "@/lib/data";
import { loadProfile, saveProfile } from "@/lib/profile-storage";
import { buildPlanRequest } from "@/lib/request-builders";
import { postPlan } from "@/lib/run-client";
import { ProfileSchema, type PlanResponse, type Preset, type Profile } from "@/lib/types";

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

function PlannedCategories({ plan }: { plan: PlanResponse }): ReactElement {
  return <section className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-5" aria-label="Planned categories">
    <h2 className="font-semibold text-teal-950">Your category plan</h2>
    {plan.message && <p role="status">{plan.message}</p>}
    <div className="flex flex-wrap gap-2">{plan.categories.map((category) =>
      <span key={category.tagId} className="rounded-full border border-teal-200 bg-white px-3 py-1 text-sm">{category.label}</span>)}</div>
    {plan.warnings.map((warning, index) => <p key={index} className="text-sm text-slate-600">{warning}</p>)}
    <p className="text-sm text-slate-600">Review your categories before starting merchant research.</p>
  </section>;
}

export default function Home(): ReactElement {
  const { profile, updateProfile, ready } = useSavedProfile();
  const [brandsText, setBrandsText] = useState("");
  const [presetId, setPresetId] = useState<string>();
  const [stage, setStage] = useState<Stage>("edit");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [pickingBranchId, setPickingBranchId] = useState<string>();
  const busy = stage === "planning" || stage === "running";
  const center = getCities().find((city) => city.label === profile.city) ?? plan?.city ?? getCities()[0];
  function editProfile(next: Profile): void {
    updateProfile(next); setPresetId(undefined); setPlan(null); setStage("edit");
    if (!next.branches.some((branch) => branch.id === pickingBranchId)) setPickingBranchId(undefined);
  }
  function editBrands(text: string): void { setBrandsText(text); setPresetId(undefined); setPlan(null); setStage("edit"); }
  function selectPreset(preset: Preset): void {
    updateProfile(ProfileSchema.parse({ ...preset.profile, branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })) }));
    setBrandsText(preset.brandsText); setPresetId(preset.id); setPlan(null); setStage("edit"); setErrorMessage(""); setPickingBranchId(undefined);
  }
  function pickLocation(point: { lat: number; lon: number }): void {
    editProfile({ ...profile, branches: profile.branches.map((branch) => branch.id === pickingBranchId ? { ...branch, ...point, locationSource: "map" } : branch) });
    setPickingBranchId(undefined);
  }
  async function startPlan(): Promise<void> {
    setStage("planning"); setErrorMessage(""); setPickingBranchId(undefined);
    try {
      const response = await postPlan(buildPlanRequest(profile, brandsText, presetId));
      setPlan(response); setStage("confirm");
      updateProfile({ ...profile, branches: profile.branches.map((branch) => response.branches.find((located) => located.id === branch.id) ?? branch) });
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Planning failed. Please try again."); setStage("edit"); }
  }
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
        {plan && <PlannedCategories plan={plan} />}
      </div>
      <aside className="min-w-0 lg:sticky lg:top-6">
        <MerchantMap center={center} branches={profile.branches} merchants={[]} onSelectMerchant={() => undefined}
          onPickLocation={pickingBranchId ? pickLocation : undefined} />
        <p className="mt-3 text-xs leading-5 text-slate-500">Circles show each branch’s trade area. Address matches may be approximate; use “Pick on map” to refine a location.</p>
      </aside>
    </div>
  </main>;
}
