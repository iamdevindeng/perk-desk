"use client";
// Displays branch trade areas and selectable merchant markers, and supports branch map picking.
// Called by: src/app/page.tsx through a client-only dynamic import
import { useEffect, useRef, type ReactElement } from "react";
import L from "leaflet";
import type { CircleMarker as LeafletCircleMarker, LatLngTuple, LeafletMouseEvent } from "leaflet";
import { Circle, CircleMarker, MapContainer, Pane, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  DEFAULT_RADIUS_M, MAP_BOUNDS_PADDING, MAP_BRANCH_AREA_OPACITY, MAP_BRANCH_MARKER_RADIUS,
  MAP_CANDIDATE_DASH_ARRAY, MAP_CANDIDATE_PANE_Z_INDEX, MAP_DEFAULT_ZOOM,
  MAP_MAX_ZOOM, MAP_MERCHANT_MARKER_RADIUS, MAP_RESULTS_MAX_ZOOM, MAP_SELECTED_MARKER_RADIUS, OSM_TILE_URL,
} from "@/lib/config";
import type { Branch, BranchLookupResponse, MerchantResult } from "@/lib/types";
import "leaflet/dist/leaflet.css";

type MapCenter = { lat: number; lon: number; zoom?: number };
type MapPoint = { lat: number; lon: number };
type MerchantMapProps = {
  center: MapCenter; branches: Branch[]; merchants: MerchantResult[]; selectedMerchantId?: string;
  candidates?: BranchLookupResponse["places"];
  onSelectMerchant: (entityId: string) => void; onPickLocation?: (point: MapPoint) => void;
};

function MapBehavior({ center, onPickLocation }: { center: MapCenter; onPickLocation?: (point: MapPoint) => void }): null {
  const map = useMapEvents({
    click(event: LeafletMouseEvent) {
      if (onPickLocation) onPickLocation({ lat: event.latlng.lat, lon: event.latlng.lng });
    },
  });
  useEffect(() => {
    // MapContainer reads its initial center only; city changes need the Leaflet instance.
    map.setView([center.lat, center.lon], center.zoom ?? MAP_DEFAULT_ZOOM);
  }, [map, center.lat, center.lon, center.zoom]);
  return null;
}

function BranchTradeArea({ branch }: { branch: Branch }): ReactElement | null {
  if (branch.lat === undefined || branch.lon === undefined) return null;
  return <Circle center={[branch.lat, branch.lon]} radius={branch.radiusMeters} interactive={false}
    pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: MAP_BRANCH_AREA_OPACITY }} />;
}

function BranchMarker({ branch }: { branch: Branch }): ReactElement | null {
  if (branch.lat === undefined || branch.lon === undefined) return null;
  const position: [number, number] = [branch.lat, branch.lon];
  const source = branch.locationSource === "qloo_locality" ? "Approximate location" : "Branch location";
  return <CircleMarker center={position} radius={MAP_BRANCH_MARKER_RADIUS}
    pathOptions={{ color: "#ffffff", fillColor: "#0f766e", fillOpacity: 1 }}>
    <Popup><div className="space-y-1 text-slate-800">
      <strong>{branch.name}</strong>
      {branch.address && <p>{branch.address}</p>}
      <p>{source}</p>
    </div></Popup>
  </CircleMarker>;
}

function CandidateLocation({ candidate }: { candidate: BranchLookupResponse["places"][number] }): ReactElement {
  const position: LatLngTuple = [candidate.lat, candidate.lon];
  return <>
    <Circle center={position} radius={DEFAULT_RADIUS_M} interactive={false}
      pathOptions={{ color: "#0f766e", fill: false, dashArray: MAP_CANDIDATE_DASH_ARRAY }} />
    <CircleMarker center={position} radius={MAP_BRANCH_MARKER_RADIUS}
      pathOptions={{ color: "#0f766e", fillColor: "#ffffff", fillOpacity: 1 }}>
      <Popup><div className="space-y-1 text-slate-800"><strong>{candidate.name}</strong>
        <p>{candidate.address}</p><p>Candidate, not added yet</p>
      </div></Popup>
    </CircleMarker>
  </>;
}

function ResultBounds({ center, branches, merchants, candidates }: {
  center: MapCenter; branches: Branch[]; merchants: MerchantResult[]; candidates: BranchLookupResponse["places"];
}): null {
  const map = useMap();
  const lastBounds = useRef({ results: "", candidates: "" });
  useEffect(() => {
    const positions: LatLngTuple[] = branches.flatMap((branch) =>
      branch.lat === undefined || branch.lon === undefined ? [] : [[branch.lat, branch.lon]]);
    positions.push(...merchants.map((merchant): LatLngTuple => [merchant.place.lat, merchant.place.lon]));
    const sortedCandidates = [...candidates].sort((first, second) => first.entityId.localeCompare(second.entityId));
    const hasResults = merchants.length > 0 || branches.some((branch) => branch.locationSource === "qloo_place");
    const signature = {
      results: hasResults ? JSON.stringify([center.lat, center.lon, center.zoom, positions]) : "",
      candidates: candidates.length ? JSON.stringify(sortedCandidates.map((place) => [place.entityId, place.lat, place.lon])) : "",
    };
    const previous = lastBounds.current;
    lastBounds.current = signature;
    if (candidates.length) {
      if (previous.candidates === signature.candidates) return;
      map.fitBounds(candidates.map((place): LatLngTuple => [place.lat, place.lon]),
        { padding: [MAP_BOUNDS_PADDING, MAP_BOUNDS_PADDING], maxZoom: MAP_RESULTS_MAX_ZOOM });
      return;
    }
    // Clearing a preview keeps its view; later real-result changes may fit normally (R42).
    if (previous.candidates || previous.results === signature.results || !positions.length) return;
    if (!hasResults) return;
    map.fitBounds(positions, { padding: [MAP_BOUNDS_PADDING, MAP_BOUNDS_PADDING], maxZoom: MAP_RESULTS_MAX_ZOOM });
  }, [map, branches, merchants, candidates, center.lat, center.lon, center.zoom]);
  return null;
}

function MerchantLocation({ merchant, selected, onSelect }: {
  merchant: MerchantResult; selected: boolean; onSelect: (entityId: string) => void;
}): ReactElement {
  const marker = useRef<LeafletCircleMarker | null>(null);
  const { entityId, name, lat, lon } = merchant.place;
  useEffect(() => {
    const element = marker.current?.getElement();
    if (!element) return;
    element.setAttribute("tabindex", "0");
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", `${name}, ${merchant.categoryLabel}, near ${merchant.branchName}`);
    element.setAttribute("aria-pressed", String(selected));
    const activate = (event: Event): void => {
      if (!(event instanceof KeyboardEvent) || !["Enter", " "].includes(event.key)) return;
      event.preventDefault(); onSelect(entityId); marker.current?.openPopup();
    };
    element.addEventListener("keydown", activate);
    if (selected) marker.current?.bringToFront();
    return () => { element.removeEventListener("keydown", activate); };
  }, [entityId, name, merchant.categoryLabel, merchant.branchName, onSelect, selected]);
  return <CircleMarker ref={marker} center={[lat, lon]}
    radius={selected ? MAP_SELECTED_MARKER_RADIUS : MAP_MERCHANT_MARKER_RADIUS}
    pathOptions={{ color: "#ffffff", fillColor: selected ? "#d97706" : "#334155", fillOpacity: 1 }}
    eventHandlers={{ click: () => onSelect(entityId) }}>
    <Popup><div className="space-y-1 text-slate-800"><strong>{name}</strong>
      <p>{merchant.categoryLabel}</p><p>Near {merchant.branchName}</p>
    </div></Popup>
  </CircleMarker>;
}

export default function MerchantMap({ center, branches, merchants, candidates = [], selectedMerchantId, onSelectMerchant, onPickLocation }: MerchantMapProps): ReactElement {
  const locatedCount = branches.filter((branch) => branch.lat !== undefined && branch.lon !== undefined).length;
  return <section aria-label="Branch trade areas map" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div><h2 id="merchant-map-heading" tabIndex={-1} className="scroll-mt-6 font-semibold text-slate-900">Your local area</h2>
        <p className="mt-1 text-sm text-slate-500">{locatedCount} branch {locatedCount === 1 ? "location" : "locations"}
          {merchants.length > 0 && ` · ${merchants.length} merchants`}</p></div>
      <div className="space-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-teal-700" />Trade area</span>
        {candidates.length > 0 && <span className="flex items-center gap-2"><span className="size-2.5 rounded-full border border-teal-700 bg-white" />Candidate</span>}
        {merchants.length > 0 && <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-slate-700" />Merchant</span>}
      </div>
    </div>
    <p role="status" className={onPickLocation ? "bg-teal-50 px-5 py-3 text-sm font-medium text-teal-800" : "sr-only"}>
      {onPickLocation ? "Click the map to set the selected branch location." : "Map location picking is off."}
    </p>
    {L.Browser.mobile && <p className="px-5 py-2 text-xs text-slate-500">Pinch to zoom. Use the list below to browse merchants.</p>}
    <MapContainer center={[center.lat, center.lon]} zoom={center.zoom ?? MAP_DEFAULT_ZOOM}
      scrollWheelZoom={false} dragging={!L.Browser.mobile} touchZoom={L.Browser.mobile} zoomControl={true}
      className="z-0 w-full" style={{ height: "min(540px, 70vh)", cursor: onPickLocation ? "crosshair" : undefined }}>
      <TileLayer url={OSM_TILE_URL} maxZoom={MAP_MAX_ZOOM}
        attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} />
      <MapBehavior center={center} onPickLocation={onPickLocation} />
      <ResultBounds center={center} branches={branches} merchants={merchants} candidates={candidates} />
      {/* A lower pane keeps dynamically added previews beneath existing real branch markers. */}
      <Pane name="branch-candidates" style={{ zIndex: MAP_CANDIDATE_PANE_Z_INDEX }}>
        {candidates.map((candidate) => <CandidateLocation key={candidate.entityId} candidate={candidate} />)}
      </Pane>
      {/* Keep every branch marker above every trade area so overlapping circles cannot cover it. */}
      {branches.map((branch) => <BranchTradeArea key={branch.id} branch={branch} />)}
      {branches.map((branch) => <BranchMarker key={branch.id} branch={branch} />)}
      {merchants.map((merchant) => <MerchantLocation key={merchant.place.entityId} merchant={merchant}
        selected={selectedMerchantId === merchant.place.entityId} onSelect={onSelectMerchant} />)}
    </MapContainer>
  </section>;
}
