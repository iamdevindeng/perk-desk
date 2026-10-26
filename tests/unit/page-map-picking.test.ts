// Checks mobile branch-picking navigation, cancellation, and responsive instructions without a browser.
// Called by: npm test; all coordinates and profiles are invented and requests are forbidden
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { saveProfile } from "@/lib/profile-storage";
import { FAKE_PROFILE } from "../fixtures/fake-plan";
import { componentText, findComponents, renderComponents, resetComponents, type TestElement } from "../fixtures/component-harness";
import { flushPage, invoke } from "../fixtures/page-harness";

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
vi.mock("@/lib/profile-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profile-storage")>();
  const { FAKE_PROFILE } = await import("../fixtures/fake-plan");
  return { ...actual, loadProfile: () => structuredClone(FAKE_PROFILE), saveProfile: vi.fn() };
});
let tree: TestElement;
let desktop = false;
let reducedMotion = false;
const fetchMock = vi.fn();
const mapNode = { scrollIntoView: vi.fn(), focus: vi.fn() };
const branchNode = { scrollIntoView: vi.fn(), focus: vi.fn() };
const branchId = FAKE_PROFILE.branches[0].id;
function render(): void { tree = renderComponents(createElement(Home)); }
function find(predicate: (element: TestElement) => boolean): TestElement { return findComponents(tree, predicate)[0]; }
function button(label: string): TestElement { return find((element) => element.type === "button" && componentText(element) === label); }
function map(): TestElement { return find((element) => element.type === "MerchantMap"); }
function startPicking(): void { invoke(button("Pick on map").props.onClick); render(); }
function banner(): TestElement {
  return find((element) => element.props.role === "status" && componentText(element).includes("the map to set the location for"));
}
beforeEach(async () => {
  resetComponents(); vi.clearAllMocks(); desktop = false; reducedMotion = false;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { matchMedia: vi.fn((query: string) => ({
    matches: query === "(min-width: 1024px)" ? desktop : reducedMotion,
  })) });
  vi.stubGlobal("document", { getElementById: vi.fn((id: string) => {
    if (id === "merchant-map-card") return mapNode;
    return id === `branch-${branchId}` ? branchNode : null;
  }) });
  render(); await flushPage(); render();
});
afterEach(() => { expect(fetchMock).not.toHaveBeenCalled(); resetComponents(); vi.unstubAllGlobals(); });

it.each([false, true])("scrolls to and focuses the map on mobile with reduced motion=%s", (reduced) => {
  reducedMotion = reduced; startPicking(); render();
  expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
  expect(mapNode.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: reduced ? "auto" : "smooth", block: "start" });
  expect(mapNode.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  expect(branchNode.scrollIntoView).not.toHaveBeenCalled();
});

it("scrolls back to the stable branch fieldset after a mobile map pick", () => {
  startPicking();
  invoke(map().props.onPickLocation, { lat: 39.7, lon: -104.9 }); render(); render();
  const fieldset = find((element) => element.type === "fieldset" && element.props.id === `branch-${branchId}`);
  expect(fieldset.props.tabIndex).toBe(-1);
  expect(branchNode.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "smooth", block: "start" });
  expect(branchNode.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  expect(map().props.onPickLocation).toBeUndefined(); expect(banner()).toBeUndefined();
  expect(vi.mocked(saveProfile).mock.lastCall?.[0].branches[0]).toMatchObject({ lat: 39.7, lon: -104.9, locationSource: "map" });
});

it.each(["Cancel", "Cancel map pick"])("turns picking off and returns to the branch through mobile %s", (label) => {
  startPicking();
  const aside = find((element) => element.type === "aside");
  expect(findComponents(aside, (element) => element === banner())).toHaveLength(1);
  expect(componentText(banner())).toContain(`the map to set the location for ${FAKE_PROFILE.branches[0].name}.`);
  invoke(button(label).props.onClick); render(); render();
  expect(map().props.onPickLocation).toBeUndefined(); expect(banner()).toBeUndefined();
  expect(button("Pick on map").props["aria-pressed"]).toBe(false);
  expect(branchNode.scrollIntoView).toHaveBeenCalledOnce(); expect(branchNode.focus).toHaveBeenCalledOnce();
  expect(saveProfile).not.toHaveBeenCalled();
});

it.each(["pick", "cancel"])("does not scroll or move focus on desktop when starting and finishing by %s", (action) => {
  desktop = true; startPicking();
  expect(banner()).toBeDefined();
  if (action === "pick") invoke(map().props.onPickLocation, { lat: 39.7, lon: -104.9 });
  else invoke(button("Cancel").props.onClick);
  render(); render();
  expect(mapNode.scrollIntoView).not.toHaveBeenCalled(); expect(branchNode.scrollIntoView).not.toHaveBeenCalled();
  expect(mapNode.focus).not.toHaveBeenCalled(); expect(branchNode.focus).not.toHaveBeenCalled();
  expect(map().props.onPickLocation).toBeUndefined();
});

it("shows the correct responsive banner and in-form instructions with a blank-name fallback", () => {
  const name = find((element) => element.props.id === `branch-${branchId}-name`);
  invoke(name.props.onChange, { target: { value: "   " } }); render(); startPicking();
  expect(componentText(banner())).toContain("the map to set the location for Branch 1.");
  const spans = findComponents(banner(), (element) => element.type === "span");
  expect(spans.map((span) => [componentText(span), span.props.className])).toEqual([["Tap", "lg:hidden"], ["Click", "hidden lg:inline"]]);
  const mobile = find((element) => element.type === "span" && componentText(element) === "Tap the map to set this branch's location.");
  const wide = find((element) => element.type === "span" && componentText(element) === "Click the branch location on the map.");
  expect(mobile.props.className).toBe("lg:hidden"); expect(wide.props.className).toBe("hidden lg:inline");
});
