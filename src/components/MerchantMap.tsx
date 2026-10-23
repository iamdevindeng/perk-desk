"use client";
// Displays branch locations and trade areas, and lets the user pick a branch point.
// Called by: src/app/page.tsx through a client-only dynamic import
import { useEffect, type ReactElement } from "react";
import type { LeafletMouseEvent } from "leaflet";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from "react-leaflet";
import { MAP_BRANCH_AREA_OPACITY, MAP_BRANCH_MARKER_RADIUS, MAP_DEFAULT_ZOOM, MAP_MAX_ZOOM, OSM_TILE_URL } from "@/lib/config";
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

export default function MerchantMap({ center, branches, onPickLocation }: MerchantMapProps): ReactElement {
  const locatedCount = branches.filter((branch) => branch.lat !== undefined && branch.lon !== undefined).length;
  return <section aria-label="Branch trade areas map" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div><h2 className="font-semibold text-slate-900">Your local area</h2>
        <p className="mt-1 text-sm text-slate-500">{locatedCount} branch {locatedCount === 1 ? "location" : "locations"}</p></div>
      <span className="flex items-center gap-2 text-xs text-slate-600"><span className="size-2.5 rounded-full bg-teal-700" />Trade area</span>
    </div>
    <p role="status" className={onPickLocation ? "bg-teal-50 px-5 py-3 text-sm font-medium text-teal-800" : "sr-only"}>
      {onPickLocation ? "Click the map to set the selected branch location." : "Map location picking is off."}
    </p>
    <MapContainer center={[center.lat, center.lon]} zoom={center.zoom ?? MAP_DEFAULT_ZOOM}
      className="z-0 w-full" style={{ height: "min(540px, 70vh)", cursor: onPickLocation ? "crosshair" : undefined }}>
      <TileLayer url={OSM_TILE_URL} maxZoom={MAP_MAX_ZOOM}
        attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} />
      <MapBehavior center={center} onPickLocation={onPickLocation} />
      {branches.map((branch) => <BranchLocation key={branch.id} branch={branch} />)}
    </MapContainer>
  </section>;
}
