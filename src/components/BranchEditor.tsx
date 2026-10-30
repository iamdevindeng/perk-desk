"use client";
// Edits branch names, addresses, trade-area radii, and map-pick selection.
// Called by: ProfileForm; the main page applies selected map coordinates.
import { useEffect, useState, type ReactElement } from "react";
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

function isBlankPlaceholder(branches: Branch[]): boolean {
  if (branches.length !== 1) return false;
  const branch = branches[0];
  return branch.address.trim() === "" && branch.lat === undefined && branch.lon === undefined && branch.locationSource === undefined;
}

function nextBranchName(branches: Branch[]): string {
  const names = new Set(branches.map((branch) => branch.name.trim().toLowerCase()));
  let number = branches.length + 1;
  while (names.has(`branch ${number}`)) number += 1;
  return `Branch ${number}`;
}

function BranchLocation({ branch }: { branch: Branch }): ReactElement {
  if (branch.lat === undefined || branch.lon === undefined) {
    return <p className="text-xs leading-relaxed text-slate-500">Enter an address or pick the branch on the map.</p>;
  }
  const source = branch.locationSource === "qloo_locality" ? "Approximate address location"
    : branch.locationSource === "qloo_place" ? "Qloo listed location"
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
  return <fieldset id={fieldPrefix} tabIndex={-1} disabled={disabled} className={`space-y-4 rounded-xl border p-4 ${picking ? "border-teal-400 bg-teal-50/50" : "border-slate-200 bg-slate-50/60"}`}>
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
      {picking && <span role="status" className="text-sm text-teal-800">
        <span className="lg:hidden">Tap the map to set this branch&apos;s location.</span>
        <span className="hidden lg:inline">Click the branch location on the map.</span>
      </span>}
    </div>
    <BranchLocation branch={branch} />
  </fieldset>;
}

export function BranchPickBanner({ branches, pickingBranchId, onCancel }: {
  branches: Branch[]; pickingBranchId?: string; onCancel: () => void;
}): ReactElement | null {
  const index = branches.findIndex((branch) => branch.id === pickingBranchId);
  if (index < 0) return null;
  const name = branches[index].name.trim() || `Branch ${index + 1}`;
  return <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">
    <p><span className="lg:hidden">Tap</span><span className="hidden lg:inline">Click</span> the map to set the location for {name}.</p>
    <Button variant="outline" onClick={onCancel}>Cancel</Button>
  </div>;
}

export default function BranchEditor({ branches, onChange, pickingBranchId, onPickBranch, disabled = false }: BranchEditorProps): ReactElement {
  const [manualBranchId, setManualBranchId] = useState<string>();
  const [expandedBranchIds, setExpandedBranchIds] = useState<string[]>([]);
  const showEmpty = isBlankPlaceholder(branches) && manualBranchId !== branches[0].id && !expandedBranchIds.includes(branches[0].id);
  useEffect(() => {
    // Focus after the hidden placeholder form mounts; later edits must not steal focus.
    if (manualBranchId) document.getElementById(`branch-${manualBranchId}-name`)?.focus();
  }, [manualBranchId]);
  function addBranch(): void {
    if (disabled || branches.length >= PROFILE_MAX_BRANCHES) return;
    const added = { id: crypto.randomUUID(), name: nextBranchName(branches), address: "", radiusMeters: DEFAULT_RADIUS_M };
    setExpandedBranchIds([...branches.map((branch) => branch.id), added.id]);
    onChange([...branches, added]);
  }
  function editBranch(updated: Branch): void {
    if (disabled) return;
    // Clearing an existing location must keep its form open without triggering manual-entry focus.
    setExpandedBranchIds(branches.map((branch) => branch.id));
    onChange(branches.map((branch) => branch.id === updated.id ? updated : branch));
  }
  function removeBranch(id: string): void {
    if (disabled || branches.length <= 1) return;
    const remaining = branches.filter((branch) => branch.id !== id);
    // A visible blank branch is still a user's draft after its sibling is removed.
    setExpandedBranchIds(remaining.map((branch) => branch.id));
    onChange(remaining);
  }
  return <section aria-labelledby="branches-heading" className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h3 id="branches-heading" className="font-semibold text-slate-900">Your branches</h3>
      <Badge variant="outline">{showEmpty ? 0 : branches.length} / {PROFILE_MAX_BRANCHES}</Badge>
    </div>
    {showEmpty ? <div className="space-y-3">
      <p className="text-sm text-slate-500">No branches yet. Use Find branches above, or add one manually.</p>
      <Button variant="outline" disabled={disabled} onClick={() => { if (!disabled) setManualBranchId(branches[0].id); }}>Add manually</Button>
    </div> : <>{branches.map((branch, index) => <BranchFields key={branch.id} branch={branch} index={index} disabled={disabled}
      onChange={editBranch}
      canRemove={branches.length > 1} onRemove={() => removeBranch(branch.id)}
      picking={pickingBranchId === branch.id} onPick={() => onPickBranch(branch.id)} />)}
    <Button variant="outline" disabled={disabled || branches.length >= PROFILE_MAX_BRANCHES} onClick={addBranch}>+ Add branch</Button></>}
  </section>;
}
