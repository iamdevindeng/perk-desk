"use client";
// Finds listed branches, explains search results, and applies selected exact locations.
// Called by: ProfileForm; lookup state stays in this component and never enters the saved profile
import { useEffect, useRef, useState, type ReactElement } from "react";
import { DEFAULT_RADIUS_M, METERS_PER_KILOMETER, PROFILE_MAX_BRANCHES } from "@/lib/config";
import { postBranchLookup } from "@/lib/branch-lookup-client";
import type { Branch, BranchLookupResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LookupProps = {
  institutionName: string; city: string; disabled: boolean; onUse: (branches: Branch[]) => void;
};
type SessionProps = Omit<LookupProps, "institutionName"> & { query: string; onQueryChange: (query: string) => void };
type Panel = { query: string; cityLabel: string; response?: BranchLookupResponse; error?: string; added?: number };
type ChoicesProps = {
  response: BranchLookupResponse; selected: string[]; disabled: boolean;
  onSelect: (entityId: string, checked: boolean) => void; onUse: () => void;
};

function BranchChoices({ response, selected, disabled, onSelect, onUse }: ChoicesProps): ReactElement {
  return <div className="space-y-3">
    <p>Found {response.places.length} locations. Select up to {PROFILE_MAX_BRANCHES}.</p>
    <div className="space-y-2">
      {response.places.map((place) => <label key={place.entityId} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <input type="checkbox" checked={selected.includes(place.entityId)}
          disabled={disabled || (!selected.includes(place.entityId) && selected.length >= PROFILE_MAX_BRANCHES)}
          onChange={(event) => onSelect(place.entityId, event.target.checked)} className="mt-1 accent-teal-700" />
        <span className="min-w-0"><span className="block font-medium text-slate-800">{place.name}</span>
          <span className="block">{place.address}</span>
          <span className="block text-xs text-slate-500">{(place.distanceMeters / METERS_PER_KILOMETER).toFixed(1)} km</span>
        </span>
      </label>)}
    </div>
    <Button variant="outline" disabled={disabled || selected.length === 0} onClick={onUse}>Use selected branches</Button>
  </div>;
}

function BranchSuggestions({ response, disabled, onSearch }: {
  response: BranchLookupResponse; disabled: boolean; onSearch: (name: string) => void;
}): ReactElement {
  return <div className="space-y-3">
    <p>No exact match. Qloo lists these credit unions and banks near {response.cityLabel}. Is yours under another name?</p>
    <div className="flex flex-wrap gap-2">
      {response.suggestions.map((suggestion) => <Button key={suggestion.name} variant="outline" disabled={disabled}
        onClick={() => onSearch(suggestion.name)}>{suggestion.name} ({suggestion.locations} locations)</Button>)}
    </div>
    <p>Tip: Qloo often lists the short name members use, such as an acronym.</p>
  </div>;
}

function LookupResult({ panel, selected, disabled, onSelect, onUse, onSearch }: Omit<ChoicesProps, "response"> & {
  panel: Panel; onSearch: (name: string) => void;
}): ReactElement {
  const response = panel.response;
  return <div aria-live="polite" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
    <p>Searched Qloo for &quot;{panel.query}&quot; within 50 km of {panel.cityLabel}.</p>
    {panel.added !== undefined ? <p>Added {panel.added} branches from Qloo. You can edit or remove them.</p> : <>
      {panel.error && <p>{panel.error}</p>}
      {response?.status === "found" && <BranchChoices response={response} selected={selected} disabled={disabled} onSelect={onSelect} onUse={onUse} />}
      {response?.status === "other_names" && <BranchSuggestions response={response} disabled={disabled} onSearch={onSearch} />}
      {response?.status === "none" && <p>Qloo has no matching credit unions or banks near {response.cityLabel}. Your institution may not be listed yet, so add branches manually.</p>}
      {response?.status === "city_not_found" && <p>We couldn&apos;t locate that city. Check the City, ST spelling.</p>}
      {response?.status === "limited" && <p>{response.message}</p>}
    </>}
  </div>;
}

function BranchLookupSession({ query, city, disabled, onQueryChange, onUse }: SessionProps): ReactElement {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const disabledRef = useRef(disabled);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  // City changes and preset selection remount this session, preventing late results from returning.
  useEffect(() => () => { controller.current?.abort(); }, []);
  async function search(name: string): Promise<void> {
    if (disabledRef.current || controller.current || !name.trim() || !city.trim()) return;
    const request = { name: name.trim(), city: city.trim() };
    const activeController = new AbortController();
    controller.current = activeController;
    setLoading(true); setPanel(null); setSelected([]);
    try {
      const result = await postBranchLookup(request, activeController.signal);
      if (activeController.signal.aborted) return;
      const response = { ...result, places: [...result.places].sort((first, second) => first.distanceMeters - second.distanceMeters) };
      setPanel({ query: response.query, cityLabel: response.cityLabel, response });
      setSelected(response.places.slice(0, PROFILE_MAX_BRANCHES).map((place) => place.entityId));
    } catch (error) {
      if (!activeController.signal.aborted) setPanel({ query: request.name, cityLabel: request.city,
        error: error instanceof Error ? error.message : "Branch search could not finish. Please try again." });
    } finally {
      if (!activeController.signal.aborted) { controller.current = null; setLoading(false); }
    }
  }
  function select(entityId: string, checked: boolean): void {
    if (disabledRef.current) return;
    setSelected((previous) => checked ? [...new Set([...previous, entityId])].slice(0, PROFILE_MAX_BRANCHES)
      : previous.filter((entry) => entry !== entityId));
  }
  function useSelected(): void {
    if (disabledRef.current || !panel?.response || !selected.length) return;
    const branches = panel.response.places.filter((place) => selected.includes(place.entityId)).map((place, index): Branch => ({
      id: crypto.randomUUID(), name: `Branch ${index + 1}`, address: place.address, lat: place.lat, lon: place.lon,
      radiusMeters: DEFAULT_RADIUS_M, locationSource: "qloo_place",
    }));
    onUse(branches); setPanel({ ...panel, added: branches.length });
  }
  return <section className="space-y-3" aria-label="Find your branches">
    <Label htmlFor="branch-search-name">Search Qloo by name</Label>
    <div className="flex flex-wrap gap-2">
      <Input id="branch-search-name" value={query} maxLength={100} disabled={disabled} className="min-w-0 flex-1"
        onChange={(event) => onQueryChange(event.target.value)} />
      <Button variant="outline" disabled={disabled || loading || !query.trim() || !city.trim()} onClick={() => { void search(query); }}>
        {loading ? "Searching…" : "Find branches"}
      </Button>
    </div>
    {panel && <LookupResult panel={panel} selected={selected} disabled={disabled || loading} onSelect={select} onUse={useSelected}
      onSearch={(name) => { onQueryChange(name); void search(name); }} />}
  </section>;
}

export default function BranchLookup({ institutionName, ...props }: LookupProps): ReactElement {
  const [editedName, setEditedName] = useState<string | null>(null);
  return <BranchLookupSession key={props.city} {...props} query={editedName ?? institutionName} onQueryChange={setEditedName} />;
}
