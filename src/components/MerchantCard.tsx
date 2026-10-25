"use client";
// Shows merchant evidence, recruiting pitches, follow-up controls, and grouped research results.
// Called by: the main page after a run; map selection highlights the matching card.
import { useState, type ReactElement } from "react";
import { BRAND_SHARES_VISIBLE, DISTANCE_DECIMALS, METERS_PER_KILOMETER, RATING_DECIMALS } from "@/lib/config";
import { displayBrandName, displayHours } from "@/lib/merchant-display";
import { getCategoryLabel } from "@/lib/data";
import { scrollToElement } from "@/lib/page-navigation";
import { MerchantStatusSchema, type MerchantResult, type MerchantStatus, type Profile, type ResolvedBrand, type RunResult } from "@/lib/types";
import ExportButton from "@/components/ExportButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type MerchantCardProps = {
  merchant: MerchantResult; status: MerchantStatus; onStatusChange: (status: MerchantStatus) => void;
  selected: boolean; onSelect: () => void; brands?: ResolvedBrand[];
};
type MerchantResultsProps = {
  result: RunResult; profile: Profile; brands?: ResolvedBrand[]; selectedMerchantId?: string; independentsOnly: boolean;
  onIndependentsOnlyChange: (value: boolean) => void; onSelectMerchant: (id: string) => void;
  onStatusChange: (merchant: MerchantResult, status: MerchantStatus) => void;
};
const STATUS_LABELS: Record<MerchantStatus, string> = {
  to_contact: "To contact", contacted: "Contacted", signed: "Signed", not_a_fit: "Not a fit",
};

function safeWebLink(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

function rankDescription(merchant: MerchantResult): string {
  if (!merchant.tasteSignal) return "Category match (no taste signal)";
  if (merchant.rankLift === null) return "Qloo taste match";
  if (merchant.rankLift < 0) return `${Math.abs(merchant.rankLift)} places below baseline`;
  return merchant.rankLift === 0 ? "Same position as baseline" : `+${merchant.rankLift} places vs. baseline`;
}

function BrandShares({ merchant, brands }: { merchant: MerchantResult; brands: ResolvedBrand[] }): ReactElement | null {
  if (!merchant.tasteSignal || !merchant.brandShares.length) return null;
  const shares = merchant.brandShares.toSorted((first, second) => second.sharePercent - first.sharePercent)
    .map((share) => `${displayBrandName(share.brandName, brands)} ${share.sharePercent}%`);
  const hidden = shares.slice(BRAND_SHARES_VISIBLE);
  return <p>{shares.slice(0, BRAND_SHARES_VISIBLE).join(" · ")}
    {hidden.length > 0 && <> · <span title={hidden.join(" · ")}>+{hidden.length} more</span></>}
  </p>;
}

function MerchantFacts({ merchant, brands }: { merchant: MerchantResult; brands: ResolvedBrand[] }): ReactElement {
  const place = merchant.place;
  const website = safeWebLink(place.website);
  const maps = safeWebLink(merchant.googleMapsUrl);
  return <div className="space-y-3 text-sm leading-relaxed text-slate-600">
    <div className="space-y-1">
      {place.address && <p>{place.address}</p>}
      {place.phone && <p>Phone: {place.phone}</p>}
      {place.hoursText && <p><span className="font-medium text-slate-700">Hours:</span> {displayHours(place.hoursText)}</p>}
      <div className="flex flex-wrap gap-4 text-teal-800">
        {website && <a href={website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Website ↗</a>}
        {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Google Maps ↗</a>}
      </div>
    </div>
    <div className="space-y-1 rounded-lg bg-slate-50 p-3">
      <p className="font-medium text-slate-800">{rankDescription(merchant)}</p>
      <BrandShares merchant={merchant} brands={brands} />
      {place.businessRating !== undefined && <p>Business rating: {place.businessRating.toFixed(RATING_DECIMALS)} / 5</p>}
      {(place.tripadvisorRating !== undefined || place.tripadvisorCount !== undefined) && <p>Tripadvisor: {place.tripadvisorRating !== undefined ? `${place.tripadvisorRating.toFixed(RATING_DECIMALS)} / 5` : ""}{place.tripadvisorCount !== undefined ? ` ${place.tripadvisorRating !== undefined ? "· " : ""}${place.tripadvisorCount} reviews` : ""}</p>}
    </div>
    {place.description && <p>{place.description}</p>}
    {place.uniqueSellingPoint && <p><span className="font-medium text-slate-800">What stands out:</span> {place.uniqueSellingPoint}</p>}
  </div>;
}

function MerchantPitch({ merchant }: { merchant: MerchantResult }): ReactElement | null {
  const [copiedPitch, setCopiedPitch] = useState("");
  const [copyError, setCopyError] = useState(false);
  if (!merchant.pitch) return null;
  async function copyPitch(): Promise<void> {
    try {
      await navigator.clipboard.writeText(merchant.pitch);
      setCopiedPitch(merchant.pitch);
      setCopyError(false);
    }
    catch { setCopiedPitch(""); setCopyError(true); }
  }
  return <div className="space-y-3 rounded-lg border border-slate-200 p-4">
    <div className="flex items-center justify-between gap-3">
      <h4 className="text-sm font-semibold text-slate-800">Recruiting pitch</h4>
      <Button variant="ghost" onClick={copyPitch} className="px-2 py-1 text-xs">{copiedPitch === merchant.pitch ? "Copied" : "Copy pitch"}</Button>
    </div>
    <p className="select-text text-sm leading-relaxed text-slate-600">{merchant.pitch}</p>
    <p aria-live="polite" className={`text-xs ${copyError ? "text-amber-800" : "text-slate-400"}`}>
      {copyError ? "Copy unavailable. Select the pitch text to copy it." : merchant.pitchSource === "template" ? "Template pitch" : "Agent-written pitch"}
    </p>
  </div>;
}

export default function MerchantCard({ merchant, status, onStatusChange, selected, onSelect, brands = [] }: MerchantCardProps): ReactElement {
  return <Card id={`merchant-${merchant.place.entityId}`} tabIndex={0} role="article" aria-label={merchant.place.name}
    aria-current={selected ? "true" : undefined} onMouseEnter={onSelect} onFocus={onSelect} onClick={onSelect}
    onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === "Enter") onSelect(); }}
    className={`transition-shadow focus-visible:outline-2 focus-visible:outline-teal-600 ${selected ? "border-teal-400 ring-2 ring-teal-100" : "hover:border-slate-300"}`}>
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{merchant.place.name}</CardTitle>
        <div className="flex flex-wrap gap-2">
          {merchant.multiLocation && <Badge variant="outline">Multi-location brand</Badge>}
          {merchant.businessMember && <Badge variant="secondary">Already a business member</Badge>}
        </div>
      </div>
      <p className="text-sm font-medium text-teal-800">{merchant.categoryLabel}</p>
      <p className="text-xs text-slate-500">{(merchant.distanceMeters / METERS_PER_KILOMETER).toFixed(DISTANCE_DECIMALS)} km from {merchant.branchName}</p>
    </CardHeader>
    <CardContent className="space-y-5">
      <MerchantFacts merchant={merchant} brands={brands} />
      <MerchantPitch merchant={merchant} />
      <div className="space-y-2 border-t border-slate-100 pt-4">
        <Label htmlFor={`status-${merchant.place.entityId}`}>Follow-up status</Label>
        <Select id={`status-${merchant.place.entityId}`} value={status} onChange={(event) => onStatusChange(MerchantStatusSchema.parse(event.target.value))}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </div>
    </CardContent>
  </Card>;
}

function ResultNotes({ result, profile }: { result: RunResult; profile: Profile }): ReactElement {
  const counts = result.excludedCounts;
  const excludedByStatus = Object.values(profile.merchantStatus).filter((entry) => ["signed", "not_a_fit"].includes(entry.status)).length;
  return <div className="space-y-3 text-sm leading-relaxed text-slate-600">
    <ul className="space-y-1">{result.categories.map((category) => <li key={category.tagId}>
      <span className="font-medium text-slate-800">{category.label}:</span>{" "}
      {category.status === "incomplete" ? "Some lookups failed; availability is incomplete. Try this search again."
        : category.status === "replaced" ? `Not enough local shops in ${category.label}; tried ${getCategoryLabel(category.replacedBy ?? category.tagId)}.`
        : category.status === "thin" ? "Few independent shops in this category near your branches."
          : `${category.independentCount} independent shops found.`}
    </li>)}</ul>
    <p className="text-xs text-slate-500">Excluded candidate matches: {counts.nationalChain} national chains · {counts.noiseGenre} other business types · {counts.closed} closed · {counts.signedOrExcluded} already signed or excluded.</p>
    <p className="text-xs text-slate-500">{excludedByStatus} merchants excluded by your follow-up status on the next run.</p>
    {result.warnings.length > 0 && <ul className="list-disc space-y-1 rounded-lg bg-amber-50 py-3 pr-4 pl-8 text-amber-950">
      {result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
    </ul>}
  </div>;
}

export function MerchantResults({ result, profile, brands = [], selectedMerchantId, independentsOnly, onIndependentsOnlyChange, onSelectMerchant, onStatusChange }: MerchantResultsProps): ReactElement {
  const visible = result.merchants.filter((merchant) => !independentsOnly || !merchant.multiLocation);
  const groups = new Map<string, MerchantResult[]>();
  for (const merchant of visible) groups.set(merchant.branchId, [...(groups.get(merchant.branchId) ?? []), merchant]);
  return <section aria-labelledby="merchant-results-heading" className="space-y-6">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle id="merchant-results-heading" tabIndex={-1}>Your merchant shortlist</CardTitle>
          <Badge variant={result.mode === "fallback" ? "secondary" : "outline"}>{result.mode === "fallback" ? "Fallback mode" : "Agent mode"}</Badge>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">Showing {visible.length} of {result.merchants.length} merchants</p>
          <a href="#merchant-map-card" className="text-sm text-teal-800 underline underline-offset-2 lg:hidden"
            onClick={(event) => { event.preventDefault(); scrollToElement("merchant-map-card"); }}>View map</a>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Label className="flex items-center gap-2"><Switch checked={independentsOnly} onCheckedChange={onIndependentsOnlyChange} />Independents only</Label>
          <ExportButton merchants={visible} merchantStatus={profile.merchantStatus} brands={brands} />
        </div>
        <ResultNotes result={result} profile={profile} />
      </CardContent>
    </Card>
    {[...groups].map(([branchId, merchants]) => <section key={branchId} aria-label={merchants[0].branchName} className="space-y-4">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">{merchants[0].branchName}<Badge variant="secondary">{merchants.length}</Badge></h3>
      {merchants.map((merchant) => <MerchantCard key={merchant.place.entityId} merchant={merchant} brands={brands}
        status={profile.merchantStatus[merchant.place.entityId]?.status ?? "to_contact"} onStatusChange={(status) => onStatusChange(merchant, status)}
        selected={selectedMerchantId === merchant.place.entityId} onSelect={() => onSelectMerchant(merchant.place.entityId)} />)}
    </section>)}
    {!visible.length && <Card className="p-6 text-sm text-slate-600">{result.merchants.length
      ? "No independent merchants in this shortlist. Turn off the filter to see multi-location results."
      : "No merchants matched this search. Review the category notes and try another category or radius."}</Card>}
  </section>;
}
