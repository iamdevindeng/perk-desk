// Checks temporary branch markers, independent branch counts, and stable candidate map bounds.
// Called by: npm test; fake Leaflet layers and invented locations keep every check offline
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import MerchantMap from "@/components/MerchantMap";
import { DEFAULT_RADIUS_M, MAP_BOUNDS_PADDING, MAP_BRANCH_MARKER_RADIUS, MAP_CANDIDATE_DASH_ARRAY,
  MAP_CANDIDATE_PANE_Z_INDEX, MAP_RESULTS_MAX_ZOOM } from "@/lib/config";
import type { Branch, BranchLookupResponse, MerchantResult } from "@/lib/types";
import { FAKE_BRANCH, FAKE_MERCHANT } from "../fixtures/fake-plan";

type LayerProps = {
  center: [number, number]; radius: number; interactive?: boolean; children?: ReactNode;
  pathOptions: { fill?: boolean; fillColor?: string; color?: string; dashArray?: string };
};
const state = vi.hoisted(() => ({
  effects: [] as (() => void)[], references: [] as { current: unknown }[], referenceIndex: 0,
  layers: [] as (LayerProps & { kind: string })[], fitBounds: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useEffect: (effect: () => void) => { state.effects.push(effect); },
    useRef: (initial: unknown) => state.references[state.referenceIndex++] ??= { current: initial } };
});
vi.mock("leaflet", () => ({ default: { Browser: { mobile: false } } }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Circle: (props: LayerProps) => { state.layers.push({ kind: "area", ...props }); return null; },
  CircleMarker: (props: LayerProps) => {
    state.layers.push({ kind: "marker", ...props }); return createElement("div", null, props.children);
  },
  Pane: ({ name, style, children }: { name: string; style: { zIndex: number }; children?: ReactNode }) =>
    createElement("div", { "data-pane": name, style }, children),
  Popup: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  TileLayer: () => null, useMap: () => ({ fitBounds: state.fitBounds }), useMapEvents: () => ({ setView: vi.fn() }),
}));

const CANDIDATES: BranchLookupResponse["places"] = [
  { entityId: "00000000-0000-4000-8000-000000000001", name: "Fake Preview CU", address: "1 Example Lane", lat: 12.3, lon: 45.6, distanceMeters: 1200 },
  { entityId: "00000000-0000-4000-8000-000000000002", name: "Fake Preview CU East", address: "2 Example Lane", lat: 12.5, lon: 45.8, distanceMeters: 2400 },
];
function render(candidates: BranchLookupResponse["places"], branches: Branch[] = [FAKE_BRANCH], merchants: MerchantResult[] = []): string {
  state.referenceIndex = 0; state.effects = []; state.layers = [];
  const markup = renderToStaticMarkup(createElement(MerchantMap, {
    center: { lat: 39.75, lon: -104.99 }, branches, merchants, candidates, onSelectMerchant: vi.fn(),
  }));
  for (const effect of state.effects) effect();
  return markup;
}
beforeEach(() => { state.references = []; state.referenceIndex = 0; state.fitBounds.mockClear(); });

it("draws outlined candidates below real markers with exact popup text and an optional legend", () => {
  const markup = render(CANDIDATES);
  expect(markup).toContain(`data-pane="branch-candidates" style="z-index:${MAP_CANDIDATE_PANE_Z_INDEX}"`);
  expect(MAP_CANDIDATE_PANE_Z_INDEX).toBeLessThan(400); // Leaflet's ordinary overlay pane.
  expect(markup).toContain(">Candidate</span>");
  expect(markup).toContain("1 branch location");
  expect(markup).not.toContain("3 branch locations");
  for (const candidate of CANDIDATES) {
    expect(markup).toContain(`<strong>${candidate.name}</strong>`);
    expect(markup).toContain(candidate.address);
  }
  expect(markup.match(/Candidate, not added yet/g)).toHaveLength(2);
  expect(state.layers.slice(0, 2)).toMatchObject([
    { kind: "area", center: [12.3, 45.6], radius: DEFAULT_RADIUS_M, interactive: false,
      pathOptions: { fill: false, dashArray: MAP_CANDIDATE_DASH_ARRAY } },
    { kind: "marker", center: [12.3, 45.6], radius: MAP_BRANCH_MARKER_RADIUS,
      pathOptions: { color: "#0f766e", fillColor: "#ffffff" } },
  ]);
  expect(state.layers.at(-1)).toMatchObject({ kind: "marker", center: [FAKE_BRANCH.lat, FAKE_BRANCH.lon] });
  expect(render([])).not.toContain(">Candidate</span>");
});

it("fits checked candidate coordinates and ignores identical, reordered, or hovered rerenders", () => {
  render(CANDIDATES, [FAKE_BRANCH], [FAKE_MERCHANT]);
  expect(state.fitBounds).toHaveBeenCalledExactlyOnceWith([[12.3, 45.6], [12.5, 45.8]],
    { padding: [MAP_BOUNDS_PADDING, MAP_BOUNDS_PADDING], maxZoom: MAP_RESULTS_MAX_ZOOM });
  render(CANDIDATES.map((candidate) => ({ ...candidate })), [FAKE_BRANCH], [FAKE_MERCHANT]);
  render([...CANDIDATES].reverse(), [FAKE_BRANCH], [{ ...FAKE_MERCHANT }]);
  expect(state.fitBounds).toHaveBeenCalledTimes(1);
  render(CANDIDATES.slice(0, 1));
  expect(state.fitBounds).toHaveBeenLastCalledWith([[12.3, 45.6]], expect.any(Object));
  expect(state.fitBounds).toHaveBeenCalledTimes(2);
});

it("does not jump when previews clear, but fits a later candidate set and later real results", () => {
  const branch = { ...FAKE_BRANCH, locationSource: "qloo_place" as const };
  render([], [branch]); render(CANDIDATES, [branch]);
  expect(state.fitBounds).toHaveBeenCalledTimes(2);
  render([], [branch]); render([], [{ ...branch }]);
  expect(state.fitBounds).toHaveBeenCalledTimes(2);
  render(CANDIDATES, [branch]);
  expect(state.fitBounds).toHaveBeenCalledTimes(3);
  render([], [branch]);
  render([], [{ ...branch, lat: branch.lat + 1 }]);
  expect(state.fitBounds).toHaveBeenCalledTimes(4);
});

it("does not move on an initially empty candidate set or on clearing the last preview", () => {
  render([]); expect(state.fitBounds).not.toHaveBeenCalled();
  render(CANDIDATES); render([]); render([]);
  expect(state.fitBounds).toHaveBeenCalledTimes(1);
});
