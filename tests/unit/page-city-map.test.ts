// Checks typed-city map centers and guidance through the real page and profile form.
// Called by: npm test; fake transports and map components keep all interactions offline
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { postBranchLookup } from "@/lib/branch-lookup-client";
import { MAP_DEFAULT_ZOOM, MAP_US_CENTER, MAP_US_ZOOM } from "@/lib/config";
import { getCities } from "@/lib/data";
import { loadProfile } from "@/lib/profile-storage";
import type { Profile } from "@/lib/types";
import { FAKE_BRANCH, FAKE_PLAN_RESPONSE, FAKE_PROFILE } from "../fixtures/fake-plan";
import { componentText, findComponents, renderComponents, resetComponents, type TestElement } from "../fixtures/component-harness";
import { flushPage, invoke, pageHarness, resetPage } from "../fixtures/page-harness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/component-harness");
  return { ...actual, useState: (initial: unknown) => {
    const [value, setter] = fake.componentState(initial);
    const stable = fake.componentRef(setter) as { current: typeof setter };
    return [value, stable.current];
  }, useRef: fake.componentRef, useEffect: fake.componentEffect, useMemo: (calculate: () => unknown) => calculate() };
});
vi.mock("next/dynamic", () => ({ default: () => "MerchantMap" }));
vi.mock("@/lib/profile-storage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/profile-storage")>(), loadProfile: vi.fn(), saveProfile: vi.fn(),
}));
vi.mock("@/lib/branch-lookup-client", () => ({ postBranchLookup: vi.fn() }));
vi.mock("@/lib/run-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/run-client")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, postPlan: fake.fakePlan, streamRun: fake.fakeRun };
});

const EMPTY_HINT = "Enter your city to move the map.";
const UNKNOWN_HINT = "Map can’t find Xyzville, ZZ yet. Use Find branches or enter an address to move it.";
const UNLOCATED_BRANCH = { ...FAKE_BRANCH, address: "", lat: undefined, lon: undefined, locationSource: undefined };
const fetchMock = vi.fn();
let tree: TestElement;
function render(): void { tree = renderComponents(createElement(Home)); }
function field(id: string): TestElement { return findComponents(tree, (element) => element.props.id === id)[0]; }
function button(label: string): TestElement {
  return findComponents(tree, (element) => element.type === "button" && componentText(element) === label)[0];
}
function map(): TestElement { return findComponents(tree, (element) => element.type === "MerchantMap")[0]; }
function hint(): TestElement | undefined {
  return findComponents(tree, (element) => element.props.role === "status"
    && /^(Enter your city|Map can’t find)/.test(componentText(element)))[0];
}
function edit(id: string, value: string): void { invoke(field(id).props.onChange, { target: { value } }); render(); render(); }
async function load(city: string, branches: Profile["branches"] = [UNLOCATED_BRANCH]): Promise<void> {
  resetComponents();
  vi.mocked(loadProfile).mockReturnValue(structuredClone({ ...FAKE_PROFILE, city, branches }));
  render(); await flushPage(); render(); render();
}
beforeEach(() => {
  resetComponents(); resetPage(); vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("document", { getElementById: vi.fn(() => null) });
  vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: true })) });
});
afterEach(() => { expect(fetchMock).not.toHaveBeenCalled(); resetComponents(); resetPage(); vi.unstubAllGlobals(); });

it.each(["", "   "])("shows the whole-US view and entry hint for an empty Other city %j", async (city) => {
  await load(city);
  expect(componentText(hint())).toBe(EMPTY_HINT);
  expect(hint()?.props.className).toContain("text-sm text-teal-800");
  expect(map().props.center).toEqual({ ...MAP_US_CENTER, zoom: MAP_US_ZOOM });
  expect(field("profile-city").props.value).toBe("other");
});

it("shows the exact unknown-city hint with the trimmed city name", async () => {
  await load("  Xyzville, ZZ  ");
  expect(componentText(hint())).toBe(UNKNOWN_HINT);
  expect(map().props.center).toEqual({ ...MAP_US_CENTER, zoom: MAP_US_ZOOM });
});

it.each(["Portland, OR", "Denver, CO", "Austin, TX"])("hides city guidance for %s", async (city) => {
  await load(city);
  expect(hint()).toBeUndefined();
  const preset = getCities().find((entry) => entry.label === city);
  if (preset) expect(map().props.center).toEqual(preset);
  else expect(map().props.center).toMatchObject({ label: city, lat: 45.537, lon: -122.65, zoom: MAP_DEFAULT_ZOOM });
});

it.each([
  { lat: 0, lon: 0, visible: false }, { lat: 0, lon: undefined, visible: true },
  { lat: undefined, lon: 0, visible: true }, { lat: undefined, lon: undefined, visible: true },
])("requires both branch coordinates to hide the hint: $lat, $lon", async ({ lat, lon, visible }) => {
  await load("Xyzville, ZZ", [{ ...UNLOCATED_BRANCH, address: "1 Example Lane", lat, lon }]);
  expect(Boolean(hint())).toBe(visible);
});

it("keeps map picking enabled and shows the pick instruction before the city hint", async () => {
  await load("", [{ ...UNLOCATED_BRANCH, isPlaceholder: true }]);
  invoke(button("Add manually").props.onClick); render();
  expect(button("Pick on map").props.disabled).not.toBe(true);
  const fieldsets = findComponents(tree, (element) => element.type === "fieldset");
  expect(fieldsets.every((fieldset) => fieldset.props.disabled !== true)).toBe(true);
  invoke(button("Pick on map").props.onClick); render();
  expect(typeof map().props.onPickLocation).toBe("function");
  const statuses = findComponents(field("merchant-map-card"), (element) => element.props.role === "status");
  expect(statuses).toHaveLength(2);
  expect(componentText(statuses[0])).toContain("the map to set the location for");
  expect(componentText(statuses[1])).toBe(EMPTY_HINT);
  invoke(map().props.onPickLocation, { lat: 0, lon: 0 }); render();
  expect(hint()).toBeUndefined();
});

it("uses a plan city and hides the hint even without located branches", async () => {
  await load("Xyzville, ZZ", [{ ...UNLOCATED_BRANCH, address: "1 Example Lane" }]);
  edit("member-brands", "Fake Coffee Co");
  invoke(button("Plan merchant categories").props.onClick); render();
  const city = { label: "Fake City, ZZ", lat: 12.3, lon: 45.6 };
  pageHarness.plans[0].resolve({ ...structuredClone(FAKE_PLAN_RESPONSE), city, branches: [] });
  await flushPage(); render(); render();
  expect(hint()).toBeUndefined();
  expect(map().props.center).toEqual(city);
});

it("hides the hint while Find branches candidates are on the map and restores it when unchecked", async () => {
  await load("Xyzville, ZZ");
  const places = [{ entityId: "00000000-0000-4000-8000-000000000001", name: "Fake Preview CU",
    address: "1 Example Lane", lat: 12.3, lon: 45.6, distanceMeters: 100 }];
  vi.mocked(postBranchLookup).mockResolvedValueOnce({ status: "found", query: "Fake Community CU",
    cityLabel: "Xyzville, ZZ", suggestions: [], places });
  invoke(button("Find branches").props.onClick); await flushPage(); render(); render();
  expect(map().props.candidates).toEqual(places);
  expect(hint()).toBeUndefined();
  const checkbox = findComponents(tree, (element) => element.type === "input" && element.props.type === "checkbox")[0];
  invoke(checkbox.props.onChange, { target: { checked: false } }); render(); render();
  expect(map().props.candidates).toEqual([]);
  expect(componentText(hint())).toBe(UNKNOWN_HINT);
});

it("moves the map as Other city is typed without adding cities to the dropdown", async () => {
  await load("Denver, CO");
  const options = findComponents(field("profile-city"), (element) => element.type === "option");
  expect(options.map(componentText)).toEqual(["Denver, CO", "Austin, TX", "Other city"]);
  edit("profile-city", "other");
  expect(componentText(hint())).toBe(EMPTY_HINT);
  edit("profile-other-city", "Portland,OR");
  expect(hint()).toBeUndefined();
  expect(map().props.center).toMatchObject({ label: "Portland, OR", lat: 45.537, lon: -122.65, zoom: MAP_DEFAULT_ZOOM });
  edit("profile-other-city", "Xyzville, ZZ");
  expect(componentText(hint())).toBe(UNKNOWN_HINT);
  expect(map().props.center).toEqual({ ...MAP_US_CENTER, zoom: MAP_US_ZOOM });
  expect(postBranchLookup).not.toHaveBeenCalled();
  expect(pageHarness.plans).toHaveLength(0);
});
