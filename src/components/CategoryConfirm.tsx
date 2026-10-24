"use client";
// Presents brand choices and category evidence for explicit confirmation before merchant research.
// Called by: the main page after planning and before Confirm & find merchants.
import type { ReactElement } from "react";
import { CATEGORY_EVIDENCE_VISIBLE, RUN_MAX_CATEGORIES } from "@/lib/config";
import { getCategoryDefaults } from "@/lib/data";
import type { CategoryTag, PlannedCategory, PlanResponse, ResolvedBrand } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type CategoryConfirmProps = {
  plan: PlanResponse; confirmedCategories: CategoryTag[]; onChange: (categories: CategoryTag[]) => void;
  brandOverrides: Record<string, string>; onBrandOverride: (inputName: string, entityId: string) => void;
  onReplan: () => void; onConfirm: () => void; disabled?: boolean; needsReplan?: boolean; liveResearchChanges?: boolean;
};
type BrandChoiceProps = {
  brand: ResolvedBrand; selectedId: string; disabled: boolean; onChange: (entityId: string) => void;
};
type CategoryChoiceProps = {
  category: CategoryTag; planned?: PlannedCategory; selected: boolean; disabled: boolean; onToggle: () => void;
};

function BrandChoice({ brand, selectedId, disabled, onChange }: BrandChoiceProps): ReactElement {
  const canSwitch = ["agent", "fallback", "user"].includes(brand.matchKind) && brand.candidates.length > 0;
  return <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium text-slate-800">{brand.name}</span>
      <Badge variant="outline">{brand.matchKind === "user" ? "Your choice" : `${brand.matchKind} match`}</Badge>
    </div>
    {brand.inputName !== brand.name && <p className="text-xs text-slate-500">You entered: {brand.inputName}</p>}
    {canSwitch && <Label className="space-y-1.5 text-xs text-slate-600">
      <span>Choose the brand you meant</span>
      <Select value={selectedId} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {brand.candidates.map((candidate) => <option key={candidate.entityId} value={candidate.entityId}>{candidate.name}</option>)}
      </Select>
    </Label>}
  </div>;
}

function CategoryEvidence({ planned }: { planned?: PlannedCategory }): ReactElement {
  if (!planned) return <p className="text-xs leading-relaxed text-slate-500">Added by you. Research will check local options in this category.</p>;
  const extraCount = planned.evidence.length - CATEGORY_EVIDENCE_VISIBLE;
  return <div className="space-y-2">
    <EvidenceList evidence={planned.evidence.slice(0, CATEGORY_EVIDENCE_VISIBLE)} label={planned.label} />
    {extraCount > 0 && <details>
      <summary className="cursor-pointer text-xs font-medium text-teal-800">+{extraCount} more</summary>
      <div className="mt-2"><EvidenceList evidence={planned.evidence.slice(CATEGORY_EVIDENCE_VISIBLE)} label={planned.label} /></div>
    </details>}
  </div>;
}

function EvidenceList({ evidence, label }: { evidence: PlannedCategory["evidence"]; label: string }): ReactElement {
  return <ul className="space-y-2 text-xs leading-relaxed text-slate-600">
    {evidence.map((item, index) => <li key={index} className="break-words">
      {"brandEntityId" in item ? <><span className="font-medium">{item.brandName}</span> → {item.brandTagName} → {label}: {item.reason}</>
        : <><span className="font-medium">{item.kind === "preference" ? "Saved preference" : "Default suggestion"}</span>: {item.reason}</>}
    </li>)}
  </ul>;
}

function CategoryChoice({ category, planned, selected, disabled, onToggle }: CategoryChoiceProps): ReactElement {
  const source = !planned ? "You added" : planned.evidence.some((item) => item.kind === "agent") ? "Brand evidence"
    : planned.evidence.some((item) => item.kind === "rule") ? "Rule"
      : planned.evidence.some((item) => item.kind === "preference") ? "Saved preference" : "Default suggestion";
  return <div className={`space-y-3 rounded-xl border p-4 ${selected ? "border-teal-200 bg-teal-50/40" : "border-slate-200 bg-white"}`}>
    <div className="flex items-start justify-between gap-3">
      <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-slate-900">
        <input type="checkbox" checked={selected} disabled={disabled} onChange={onToggle}
          className="mt-0.5 size-4 shrink-0 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2" />
        <span>{category.label}</span>
      </label>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="outline" className="text-slate-600">{source}</Badge>
        {selected && <Button variant="ghost" disabled={disabled} onClick={onToggle} className="-my-1 px-2 py-1"
          aria-label={`Remove ${category.label}`}><span aria-hidden="true">×</span></Button>}
      </div>
    </div>
    <CategoryEvidence planned={planned} />
  </div>;
}

function categoryOptions(plan: PlanResponse, confirmedCategories: CategoryTag[]): CategoryTag[] {
  const options = new Map(plan.candidateCategories.map((category) => [category.tagId, category]));
  for (const category of getCategoryDefaults().categories) {
    if (category.quickPick && !options.has(category.tagId)) options.set(category.tagId, { tagId: category.tagId, label: category.label });
  }
  return [...options.values()].filter((category) => !confirmedCategories.some((selected) => selected.tagId === category.tagId));
}

function PlanNotes({ plan }: { plan: PlanResponse }): ReactElement | null {
  if (!plan.unresolved.length && !plan.warnings.length && !plan.message) return null;
  return <div className="space-y-2 rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-amber-950" role="status">
    {plan.message && <p>{plan.message}</p>}
    {plan.unresolved.length > 0 && <p>Needs your review: {plan.unresolved.join(", ")}. Choose a matching candidate below or edit the brand names and plan again.</p>}
    {plan.warnings.length > 0 && <ul className="list-disc space-y-1 pl-4">{plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
  </div>;
}

export default function CategoryConfirm({
  plan, confirmedCategories, onChange, brandOverrides, onBrandOverride, onReplan, onConfirm, disabled = false, needsReplan = false, liveResearchChanges = false,
}: CategoryConfirmProps): ReactElement {
  const options = categoryOptions(plan, confirmedCategories);
  const visibleCategories = [...plan.categories, ...confirmedCategories.filter((category) => !plan.categories.some((planned) => planned.tagId === category.tagId))];
  const atLimit = confirmedCategories.length >= RUN_MAX_CATEGORIES;
  const missingContext = !plan.brands.length || !plan.branches.length || plan.limited;
  const editsDisabled = disabled || needsReplan || missingContext;
  function toggleCategory(category: CategoryTag): void {
    if (editsDisabled) return;
    const selected = confirmedCategories.some((existing) => existing.tagId === category.tagId);
    if (selected) onChange(confirmedCategories.filter((existing) => existing.tagId !== category.tagId));
    else if (!atLimit) onChange([...confirmedCategories, { tagId: category.tagId, label: category.label }]);
  }
  return <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="category-confirm-heading" tabIndex={-1} className="scroll-mt-6">Choose your merchant categories</CardTitle>
        <Badge variant="outline" className="border-teal-200 text-teal-800">Review before research</Badge>
      </div>
      <CardDescription>Check the brand matches and evidence, then select up to {RUN_MAX_CATEGORIES} categories.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <PlanNotes plan={plan} />
      <section aria-label="Recognized member brands" className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Recognized brands</h3>
        <div className="grid gap-2 sm:grid-cols-2">{plan.brands.map((brand) => <BrandChoice key={brand.inputName} brand={brand}
          selectedId={brandOverrides[brand.inputName] ?? brand.entityId} disabled={disabled}
          onChange={(entityId) => onBrandOverride(brand.inputName, entityId)} />)}</div>
        {(plan.ambiguousBrands ?? []).map((brand) => <Label key={brand.inputName} className="block space-y-2 text-sm">
          <span>Choose the brand you meant by {brand.inputName}</span>
          <Select value={brandOverrides[brand.inputName] ?? ""} disabled={disabled}
            onChange={(event) => onBrandOverride(brand.inputName, event.target.value)}>
            <option value="" disabled>No matching name — choose a brand</option>
            {brand.candidates.map((candidate) => <option key={candidate.entityId} value={candidate.entityId}>{candidate.name}</option>)}
          </Select>
        </Label>)}
        {needsReplan && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-teal-50 p-3">
          <p className="text-sm text-teal-900">Update the plan to refresh evidence for your new brand choice.</p>
          <Button variant="outline" disabled={disabled} onClick={onReplan}>Re-plan with this brand</Button>
        </div>}
      </section>
      <section aria-labelledby="confirmed-categories-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id="confirmed-categories-heading" className="text-sm font-semibold text-slate-900">Categories to research</h3>
          <span className="text-sm text-slate-500" aria-live="polite">{confirmedCategories.length} / {RUN_MAX_CATEGORIES} selected</span>
        </div>
        {visibleCategories.map((category) => {
          const selected = confirmedCategories.some((existing) => existing.tagId === category.tagId);
          return <CategoryChoice key={category.tagId} category={category} planned={plan.categories.find((planned) => planned.tagId === category.tagId)}
            selected={selected} disabled={editsDisabled || (!selected && atLimit)} onToggle={() => toggleCategory(category)} />;
        })}
        {!visibleCategories.length && <p className="text-sm text-slate-500">{missingContext
          ? "No categories are ready. Check the member brands and branch locations, then plan again."
          : "No categories are ready. Adjust the member brands or choose a category below."}</p>}
        <div className="space-y-2 pt-2">
          <Label htmlFor="add-category">Add category</Label>
          <Select id="add-category" value="" disabled={editsDisabled || atLimit || !options.length}
            onChange={(event) => { const category = options.find((option) => option.tagId === event.target.value); if (category) toggleCategory(category); }}>
            <option value="">{atLimit ? `Maximum ${RUN_MAX_CATEGORIES} categories selected` : "Choose another category…"}</option>
            {options.map((category) => <option key={category.tagId} value={category.tagId}>{category.label}</option>)}
          </Select>
        </div>
      </section>
      <div className="space-y-2 border-t border-slate-100 pt-5">
        <Button onClick={onConfirm} disabled={editsDisabled || !confirmedCategories.length || confirmedCategories.length > RUN_MAX_CATEGORIES}
          className="w-full bg-teal-800 py-3 hover:bg-teal-900">Confirm &amp; find merchants</Button>
        <p className="text-center text-xs text-slate-500">Merchant research starts only after you confirm.</p>
        {liveResearchChanges && <p className="text-xs text-slate-500">Changes run live research and count toward today&apos;s limit.</p>}
      </div>
    </CardContent>
  </Card>;
}
