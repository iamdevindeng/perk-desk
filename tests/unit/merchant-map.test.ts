// Checks desktop and touch map controls while preserving explicit branch location picking.
// Called by: npm test; mocked Leaflet components keep all rendering offline
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MerchantMap from "@/components/MerchantMap";
import { FAKE_BRANCH, FAKE_MERCHANT } from "../fixtures/fake-plan";

type MapClick = { latlng: { lat: number; lng: number } };
const mapState = vi.hoisted(() => ({
  mobile: false, containers: [] as Record<string, unknown>[],
  click: undefined as ((event: MapClick) => void) | undefined,
}));

vi.mock("leaflet", () => ({ default: { Browser: { get mobile() { return mapState.mobile; } } } }));
vi.mock("react-leaflet", () => ({
  MapContainer: (props: { children?: ReactNode }) => {
    mapState.containers.push(props);
    return createElement("div", null, props.children);
  },
  Circle: () => null,
  CircleMarker: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Popup: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  TileLayer: () => null,
  useMap: () => ({ fitBounds: vi.fn() }),
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

beforeEach(() => { mapState.mobile = false; mapState.containers = []; mapState.click = undefined; });

describe.each([false, true])("map controls with mobile=%s", (mobile) => {
  it("allows page scrolling and keeps zoom controls with the appropriate touch hint", () => {
    mapState.mobile = mobile;
    const markup = renderMap();
    expect(mapState.containers.at(-1)).toMatchObject({ scrollWheelZoom: false, dragging: !mobile, touchZoom: mobile });
    expect(mapState.containers.at(-1)!.zoomControl).not.toBe(false);
    expect(markup.includes("Use two fingers to move the map")).toBe(mobile);
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
