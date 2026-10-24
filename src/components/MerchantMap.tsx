"use client";
// Displays branch trade areas and selectable merchant markers, and supports branch map picking.
// Called by: src/app/page.tsx through a client-only dynamic import
import { useEffect, useRef, type ReactElement } from "react";
import L from "leaflet";
import type { CircleMarker as LeafletCircleMarker, LatLngTuple, LeafletMouseEvent } from "leaflet";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  MAP_BOUNDS_PADDING, MAP_BRANCH_AREA_OPACITY, MAP_BRANCH_MARKER_RADIUS, MAP_DEFAULT_ZOOM,
  MAP_MAX_ZOOM, MAP_MERCHANT_MARKER_RADIUS, MAP_RESULTS_MAX_ZOOM, MAP_SELECTED_MARKER_RADIUS, OSM_TILE_URL,
} from "@/lib/config";
import type { Branch, MerchantResult } from "@/lib/types";
import "leaflet/dist/leaflet.css";

type MapCenter = { lat: number; lon: number; zoom?: number };
type MapPoint = { lat: number; lon: number };
type MerchantMapProps = {
  center: MapCenter; branches: Branch[]; merchants: MerchantResult[]; selectedMerchantId?: string;
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

function BranchLocation({ branch }: { branch: Branch }): ReactElement | null {
  if (branch.lat === undefined || branch.lon === undefined) return null;
  const position: [number, number] = [branch.lat, branch.lon];
  const source = branch.locationSource === "qloo_locality" ? "Approximate location" : "Branch location";
  return <>
    <Circle center={position} radius={branch.radiusMeters}
      pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: MAP_BRANCH_AREA_OPACITY }} />
    <CircleMarker center={position} radius={MAP_BRANCH_MARKER_RADIUS}
      pathOptions={{ color: "#ffffff", fillColor: "#0f766e", fillOpacity: 1 }}>
      <Popup><div className="space-y-1 text-slate-800">
        <strong>{branch.name}</strong>
        {branch.address && <p>{branch.address}</p>}
        <p>{source}</p>
      </div></Popup>
    </CircleMarker>
  </>;
}

function ResultBounds({ branches, merchants }: { branches: Branch[]; merchants: MerchantResult[] }): null {
  const map = useMap();
  const lastBounds = useRef("");
  useEffect(() => {
    if (!merchants.length) { lastBounds.current = ""; return; }
    const positions: LatLngTuple[] = branches.flatMap((branch) =>
      branch.lat === undefined || branch.lon === undefined ? [] : [[branch.lat, branch.lon]]);
    positions.push(...merchants.map((merchant): LatLngTuple => [merchant.place.lat, merchant.place.lon]));
    const signature = JSON.stringify(positions);
    // Cards can update selection on every hover; refit only when actual locations change.
    if (lastBounds.current === signature) return;
    lastBounds.current = signature;
    map.fitBounds(positions, { padding: [MAP_BOUNDS_PADDING, MAP_BOUNDS_PADDING], maxZoom: MAP_RESULTS_MAX_ZOOM });
  }, [map, branches, merchants]);
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

export default function MerchantMap({ center, branches, merchants, selectedMerchantId, onSelectMerchant, onPickLocation }: MerchantMapProps): ReactElement {
  const locatedCount = branches.filter((branch) => branch.lat !== undefined && branch.lon !== undefined).length;
  return <section aria-label="Branch trade areas map" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div><h2 id="merchant-map-heading" tabIndex={-1} className="scroll-mt-6 font-semibold text-slate-900">Your local area</h2>
        <p className="mt-1 text-sm text-slate-500">{locatedCount} branch {locatedCount === 1 ? "location" : "locations"}
          {merchants.length > 0 && ` · ${merchants.length} merchants`}</p></div>
      <div className="space-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-teal-700" />Trade area</span>
        {merchants.length > 0 && <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-slate-700" />Merchant</span>}
      </div>
    </div>
    <p role="status" className={onPickLocation ? "bg-teal-50 px-5 py-3 text-sm font-medium text-teal-800" : "sr-only"}>
      {onPickLocation ? "Click the map to set the selected branch location." : "Map location picking is off."}
    </p>
    {L.Browser.mobile && <p className="px-5 py-2 text-xs text-slate-500">Use two fingers to move the map</p>}
    <MapContainer center={[center.lat, center.lon]} zoom={center.zoom ?? MAP_DEFAULT_ZOOM}
      scrollWheelZoom={false} dragging={!L.Browser.mobile} touchZoom={L.Browser.mobile} zoomControl={true}
      className="z-0 w-full" style={{ height: "min(540px, 70vh)", cursor: onPickLocation ? "crosshair" : undefined }}>
      <TileLayer url={OSM_TILE_URL} maxZoom={MAP_MAX_ZOOM}
        attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} />
      <MapBehavior center={center} onPickLocation={onPickLocation} />
      <ResultBounds branches={branches} merchants={merchants} />
      {branches.map((branch) => <BranchLocation key={branch.id} branch={branch} />)}
      {merchants.map((merchant) => <MerchantLocation key={merchant.place.entityId} merchant={merchant}
        selected={selectedMerchantId === merchant.place.entityId} onSelect={onSelectMerchant} />)}
    </MapContainer>
  </section>;
}
