// Checks desktop and touch map controls while preserving explicit branch location picking.
// Called by: npm test; mocked Leaflet components keep all rendering offline
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MerchantMap from "@/components/MerchantMap";
import { MAP_BRANCH_MARKER_RADIUS, MAP_MERCHANT_MARKER_RADIUS } from "@/lib/config";
import type { Branch } from "@/lib/types";
import { FAKE_BRANCH, FAKE_MERCHANT } from "../fixtures/fake-plan";

type MapClick = { latlng: { lat: number; lng: number } };
type LayerProps = {
  center: [number, number]; radius: number; interactive?: boolean; children?: ReactNode;
  eventHandlers?: { click: () => void };
};
type RenderedLayer = LayerProps & { kind: "area" | "marker" };
const mapState = vi.hoisted(() => ({
  mobile: false, containers: [] as Record<string, unknown>[], layers: [] as RenderedLayer[],
  click: undefined as ((event: MapClick) => void) | undefined,
  effects: [] as (() => void)[], fitBounds: vi.fn(),
  references: [] as { current: unknown }[], referenceIndex: 0,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useEffect: (effect: () => void) => { mapState.effects.push(effect); },
    useRef: (initial: unknown) => {
      const index = mapState.referenceIndex++;
      return mapState.references[index] ??= { current: initial };
    },
  };
});
vi.mock("leaflet", () => ({ default: { Browser: { get mobile() { return mapState.mobile; } } } }));
vi.mock("react-leaflet", () => ({
  MapContainer: (props: { children?: ReactNode }) => {
    mapState.containers.push(props);
    return createElement("div", null, props.children);
  },
  Circle: (props: LayerProps) => { mapState.layers.push({ kind: "area", ...props }); return null; },
  CircleMarker: (props: LayerProps) => {
    mapState.layers.push({ kind: "marker", ...props });
    return createElement("div", null, props.children);
  },
  Popup: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Pane: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  TileLayer: () => null,
  useMap: () => ({ fitBounds: mapState.fitBounds }),
  useMapEvents: (handlers: { click: (event: MapClick) => void }) => {
    mapState.click = handlers.click;
    return { setView: vi.fn() };
  },
}));

function renderMap(onPickLocation?: (point: { lat: number; lon: number }) => void): string {
  return renderToStaticMarkup(createElement(MerchantMap, {
    center: { lat: 39.75, lon: -104.99 }, branches: [FAKE_BRANCH], merchants: [FAKE_MERCHANT],
    onSelectMerchant: () => {}, onPickLocation,
  }));
}

beforeEach(() => {
  mapState.mobile = false; mapState.containers = []; mapState.layers = []; mapState.click = undefined;
  mapState.effects = []; mapState.fitBounds.mockClear();
  mapState.references = []; mapState.referenceIndex = 0;
});

describe.each([false, true])("map controls with mobile=%s", (mobile) => {
  it("allows page scrolling and keeps zoom controls with the appropriate touch hint", () => {
    mapState.mobile = mobile;
    const markup = renderMap();
    expect(mapState.containers.at(-1)).toMatchObject({ scrollWheelZoom: false, dragging: !mobile, touchZoom: mobile });
    expect(mapState.containers.at(-1)!.zoomControl).not.toBe(false);
    expect(markup.includes("Pinch to zoom. Use the list below to browse merchants.")).toBe(mobile);
  });

  it("passes clicked coordinates only while branch location picking is enabled", () => {
    mapState.mobile = mobile;
    const onPickLocation = vi.fn();
    expect(renderMap(onPickLocation)).toContain("Click the map to set the selected branch location.");
    mapState.click!({ latlng: { lat: 40.25, lng: -105.25 } });
    expect(onPickLocation).toHaveBeenCalledExactlyOnceWith({ lat: 40.25, lon: -105.25 });
    expect(renderMap()).toContain("Map location picking is off.");
    expect(() => mapState.click!({ latlng: { lat: 40.5, lng: -105.5 } })).not.toThrow();
    expect(onPickLocation).toHaveBeenCalledTimes(1);
  });
});

it("renders non-interactive trade areas before every branch marker and then merchant markers", () => {
  const secondBranch = { ...FAKE_BRANCH, id: "fake-second", name: "Fake Second Branch", address: "3 Example Lane",
    lat: 39.76, lon: -104.98, radiusMeters: 8000, locationSource: "qloo_locality" as const };
  const onSelectMerchant = vi.fn();
  const markup = renderToStaticMarkup(createElement(MerchantMap, {
    center: { lat: FAKE_BRANCH.lat, lon: FAKE_BRANCH.lon },
    branches: [FAKE_BRANCH, { ...FAKE_BRANCH, id: "fake-unlocated", lat: undefined, lon: undefined }, secondBranch],
    merchants: [FAKE_MERCHANT], onSelectMerchant,
  }));
  expect(mapState.layers).toMatchObject([
    { kind: "area", center: [FAKE_BRANCH.lat, FAKE_BRANCH.lon], radius: FAKE_BRANCH.radiusMeters, interactive: false },
    { kind: "area", center: [secondBranch.lat, secondBranch.lon], radius: secondBranch.radiusMeters, interactive: false },
    { kind: "marker", center: [FAKE_BRANCH.lat, FAKE_BRANCH.lon], radius: MAP_BRANCH_MARKER_RADIUS },
    { kind: "marker", center: [secondBranch.lat, secondBranch.lon], radius: MAP_BRANCH_MARKER_RADIUS },
    { kind: "marker", center: [FAKE_MERCHANT.place.lat, FAKE_MERCHANT.place.lon], radius: MAP_MERCHANT_MARKER_RADIUS },
  ]);
  for (const marker of mapState.layers.slice(2)) expect(marker.interactive).not.toBe(false);
  for (const branch of [FAKE_BRANCH, secondBranch]) {
    expect(markup).toContain(`<strong>${branch.name}</strong>`);
    expect(markup).toContain(branch.address);
  }
  expect(markup).toContain("Branch location");
  expect(markup).toContain("Approximate location");
  mapState.layers.at(-1)!.eventHandlers!.click();
  expect(onSelectMerchant).toHaveBeenCalledExactlyOnceWith(FAKE_MERCHANT.place.entityId);
});

it("shows a Qloo branch at its exact point with the Branch location popup", () => {
  const branch = { ...FAKE_BRANCH, locationSource: "qloo_place" as const };
  const markup = renderToStaticMarkup(createElement(MerchantMap, {
    center: { lat: branch.lat, lon: branch.lon }, branches: [branch], merchants: [], onSelectMerchant: () => {},
  }));
  expect(mapState.layers).toMatchObject([
    { kind: "area", center: [branch.lat, branch.lon] },
    { kind: "marker", center: [branch.lat, branch.lon] },
  ]);
  expect(markup).toContain("Branch location");
  expect(markup).toContain(branch.address);
  expect(markup).not.toContain("Approximate");
});

function renderBranchBounds(branches: Branch[], center = { lat: 39.75, lon: -104.99 }): void {
  mapState.referenceIndex = 0; mapState.effects = [];
  renderToStaticMarkup(createElement(MerchantMap, {
    center, branches, merchants: [], onSelectMerchant: () => {},
  }));
  for (const effect of mapState.effects) effect();
}

it("fits every selected Qloo branch before research even outside the initial city view", () => {
  const branches: Branch[] = [
    { ...FAKE_BRANCH, lat: 12.3, lon: 45.6, locationSource: "qloo_place" },
    { ...FAKE_BRANCH, id: "fake-second", lat: 12.5, lon: 45.8, locationSource: "qloo_place" },
  ];
  renderBranchBounds(branches);
  expect(mapState.fitBounds).toHaveBeenCalledExactlyOnceWith([[12.3, 45.6], [12.5, 45.8]], expect.any(Object));
  renderBranchBounds(branches);
  expect(mapState.fitBounds).toHaveBeenCalledTimes(1);
  renderBranchBounds(branches, { lat: 12.4, lon: 45.7 });
  expect(mapState.fitBounds).toHaveBeenCalledTimes(2);
});

it.each(["preset", "map", "qloo_locality"] as const)("preserves the initial map view for ordinary %s branches", (locationSource) => {
  renderBranchBounds([{ ...FAKE_BRANCH, locationSource }]);
  expect(mapState.fitBounds).not.toHaveBeenCalled();
});

it("does not try to fit an empty set of listed coordinates", () => {
  renderBranchBounds([{ ...FAKE_BRANCH, locationSource: "qloo_place", lat: undefined, lon: undefined }]);
  expect(mapState.fitBounds).not.toHaveBeenCalled();
});

it("fits a listed branch even when its coordinates match an earlier ordinary branch", () => {
  renderBranchBounds([{ ...FAKE_BRANCH, locationSource: "map" }]);
  renderBranchBounds([{ ...FAKE_BRANCH, locationSource: "qloo_place" }]);
  expect(mapState.fitBounds).toHaveBeenCalledExactlyOnceWith([[FAKE_BRANCH.lat, FAKE_BRANCH.lon]], expect.any(Object));
});
