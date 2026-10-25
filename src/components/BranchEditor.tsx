"use client";
// Edits branch names, addresses, trade-area radii, and map-pick selection.
// Called by: ProfileForm; the main page applies selected map coordinates.
import type { ReactElement } from "react";
import {
  BRANCH_RADIUS_MAX_KM, BRANCH_RADIUS_MIN_KM, COORDINATE_DECIMALS,
  DEFAULT_RADIUS_M, METERS_PER_KILOMETER, PROFILE_MAX_BRANCHES,
} from "@/lib/config";
import type { Branch } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BranchEditorProps = {
  branches: Branch[]; onChange: (branches: Branch[]) => void;
  pickingBranchId?: string; onPickBranch: (id: string) => void; disabled?: boolean;
};
type BranchFieldsProps = {
  branch: Branch; index: number; onChange: (branch: Branch) => void;
  onRemove: () => void; canRemove: boolean; picking: boolean; onPick: () => void; disabled: boolean;
};

function BranchLocation({ branch }: { branch: Branch }): ReactElement {
  if (branch.lat === undefined || branch.lon === undefined) {
    return <p className="text-xs leading-relaxed text-slate-500">Enter an address or pick the branch on the map.</p>;
  }
  const source = branch.locationSource === "qloo_locality" ? "Approximate address location"
    : branch.locationSource === "map" ? "Picked on map" : branch.locationSource === "preset" ? "Demo location" : "Saved location";
  return <div className="space-y-1 text-xs text-slate-500">
    <p><span className="font-medium text-slate-600">{source}</span> · {branch.lat.toFixed(COORDINATE_DECIMALS)}, {branch.lon.toFixed(COORDINATE_DECIMALS)}</p>
    {branch.locationSource === "qloo_locality" && <p className="text-amber-800">This point is approximate. Pick on the map to refine it.</p>}
  </div>;
}

function BranchFields({ branch, index, onChange, onRemove, canRemove, picking, onPick, disabled }: BranchFieldsProps): ReactElement {
  const fieldPrefix = `branch-${branch.id}`;
  const addressPlaceholder = branch.locationSource === "map" && branch.address === ""
    ? "Location set on map. Address optional." : "Street address, city, state";
  return <fieldset disabled={disabled} className={`space-y-4 rounded-xl border p-4 ${picking ? "border-teal-400 bg-teal-50/50" : "border-slate-200 bg-slate-50/60"}`}>
    <legend className="px-1 text-sm font-semibold text-slate-700">Branch {index + 1}</legend>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor={`${fieldPrefix}-name`}>Branch name</Label>
        <Input id={`${fieldPrefix}-name`} value={branch.name} placeholder="Downtown branch" required
          onChange={(event) => onChange({ ...branch, name: event.target.value })} />
      </div>
      <Button variant="ghost" className="mt-7 px-2 text-xs text-slate-500" disabled={!canRemove}
        aria-label={`Remove ${branch.name || `branch ${index + 1}`}`} onClick={onRemove}>Remove</Button>
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${fieldPrefix}-address`}>Street address</Label>
      <Input id={`${fieldPrefix}-address`} value={branch.address} placeholder={addressPlaceholder} autoComplete="street-address"
        onChange={(event) => onChange({ ...branch, address: event.target.value, lat: undefined, lon: undefined, locationSource: undefined })} />
    </div>
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${fieldPrefix}-radius`}>Trade-area radius</Label>
        <output htmlFor={`${fieldPrefix}-radius`} className="text-sm font-semibold text-teal-800">{branch.radiusMeters / METERS_PER_KILOMETER} km</output>
      </div>
      <Input id={`${fieldPrefix}-radius`} type="range" min={BRANCH_RADIUS_MIN_KM} max={BRANCH_RADIUS_MAX_KM}
        value={branch.radiusMeters / METERS_PER_KILOMETER} className="h-2 border-0 px-0 accent-teal-700"
        onChange={(event) => onChange({ ...branch, radiusMeters: Number(event.target.value) * METERS_PER_KILOMETER })} />
      <div className="flex justify-between text-xs text-slate-400"><span>{BRANCH_RADIUS_MIN_KM} km</span><span>{BRANCH_RADIUS_MAX_KM} km</span></div>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" aria-pressed={picking} onClick={onPick} className={picking ? "border-teal-500 text-teal-800" : ""}>
        {picking ? "Cancel map pick" : "Pick on map"}
      </Button>
      {picking && <span role="status" className="text-sm text-teal-800">Click the branch location on the map.</span>}
    </div>
    <BranchLocation branch={branch} />
  </fieldset>;
}

export default function BranchEditor({ branches, onChange, pickingBranchId, onPickBranch, disabled = false }: BranchEditorProps): ReactElement {
  function addBranch(): void {
    if (branches.length >= PROFILE_MAX_BRANCHES) return;
    onChange([...branches, { id: crypto.randomUUID(), name: `Branch ${branches.length + 1}`, address: "", radiusMeters: DEFAULT_RADIUS_M }]);
  }
  return <section aria-labelledby="branches-heading" className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h3 id="branches-heading" className="font-semibold text-slate-900">Your branches</h3>
      <Badge variant="outline">{branches.length} / {PROFILE_MAX_BRANCHES}</Badge>
    </div>
    {branches.map((branch, index) => <BranchFields key={branch.id} branch={branch} index={index} disabled={disabled}
      onChange={(updated) => onChange(branches.map((existing) => existing.id === branch.id ? updated : existing))}
      canRemove={branches.length > 1} onRemove={() => onChange(branches.filter((existing) => existing.id !== branch.id))}
      picking={pickingBranchId === branch.id} onPick={() => onPickBranch(branch.id)} />)}
    <Button variant="outline" disabled={disabled || branches.length >= PROFILE_MAX_BRANCHES} onClick={addBranch}>+ Add branch</Button>
  </section>;
}
