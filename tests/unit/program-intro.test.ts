// Checks the back-to-top logo respects motion settings and preserves the current page data.
// Called by: npm test; actual page components use fake hooks and in-memory browser storage
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { PAGE_SCROLL_OFFSET_PX, TOP_BAR_HEIGHT_PX, TOP_BAR_Z_INDEX } from "@/lib/config";
import { loadProfile, saveProfile } from "@/lib/profile-storage";
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

const values = new Map<string, string>();
const scrollTo = vi.fn();
const matchMedia = vi.fn();
const reload = vi.fn();
const assign = vi.fn();
const replace = vi.fn();
const fetchMock = vi.fn();
const getElementById = vi.fn();
const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
let tree: TestElement;
function render(): void { tree = renderComponents(createElement(Home)); }
function field(id: string): TestElement { return findComponents(tree, (element) => element.props.id === id)[0]; }
function logo(): TestElement {
  return findComponents(tree, (element) => element.props["aria-label"] === "Perk Desk, back to top")[0];
}
beforeEach(async () => {
  resetComponents(); vi.clearAllMocks(); values.clear(); matchMedia.mockReturnValue({ matches: false });
  vi.stubGlobal("window", { scrollTo, matchMedia, location: { reload, assign, replace }, localStorage: {
    getItem: (key: string) => values.get(key) ?? null, setItem,
  } });
  vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("document", { getElementById });
  saveProfile({ ...FAKE_PROFILE, signedMerchantsText: "Fake Signed Shop", businessMembersText: "Fake Business Member" });
  render(); await flushPage(); render();
  invoke(field("member-brands").props.onChange, { target: { value: "Fake Coffee Co\nFake Hiking Brand" } }); render();
});
afterEach(() => { resetComponents(); vi.unstubAllGlobals(); });

it("uses an accessible non-submit logo button with visible keyboard focus", () => {
  expect(logo().type).toBe("button"); expect(logo().props.type).toBe("button");
  expect(componentText(logo())).toBe("Perk Desk"); expect(logo().props.href).toBeUndefined();
  const classes = String(logo().props.className);
  for (const token of ["text-sm", "font-bold", "uppercase", "tracking-[0.2em]", "text-teal-700", "cursor-pointer", "focus-visible:"]) {
    expect(classes).toContain(token);
  }
});

it("keeps the logo inside a full-width sticky bar while the introduction scrolls with the main content", () => {
  const bar = findComponents(tree, (element) => String(element.props.className).split(/\s+/).includes("sticky"))[0];
  expect(bar).toBeDefined();
  const classes = String(bar.props.className).split(/\s+/);
  expect(classes).toEqual(expect.arrayContaining(["sticky", "top-0", "w-full", "border-b"]));
  expect(classes.some((name) => ["bg-white", "bg-slate-50"].includes(name))).toBe(true);
  expect(bar.props.style).toMatchObject({ height: TOP_BAR_HEIGHT_PX, zIndex: TOP_BAR_Z_INDEX });
  expect(findComponents(bar, (element) => element.props["aria-label"] === "Perk Desk, back to top")).toHaveLength(1);
  expect(componentText(bar)).toBe("Perk Desk");
  const main = findComponents(tree, (element) => element.type === "main")[0];
  expect(findComponents(main, (element) => element === bar)).toHaveLength(0);
  expect(findComponents(main, (element) => element.type === "h1")).toHaveLength(1);
  expect(componentText(main)).toContain("Turn the brands your members love into a focused list of local merchants near your branches.");
});

it("keeps the sticky map below the same header and navigation gap", () => {
  const map = field("merchant-map-card");
  expect(map.type).toBe("aside");
  expect(map.props.className).toContain("lg:sticky");
  expect(map.props.className).toContain("lg:top-[var(--page-scroll-offset)]");
  expect(map.props.className).not.toContain("lg:top-6");
  expect(map.props.style).toMatchObject({ "--page-scroll-offset": `${PAGE_SCROLL_OFFSET_PX}px` });
});

it.each([false, true, undefined])("scrolls to top with reduced motion=%s without changing profile, brands, storage, or navigation", (reduced) => {
  if (reduced === undefined) vi.stubGlobal("window", { ...window, matchMedia: undefined });
  else matchMedia.mockReturnValue({ matches: reduced });
  const profile = loadProfile(); const brands = field("member-brands").props.value;
  const stored = [...values]; const writes = setItem.mock.calls.length;
  invoke(logo().props.onClick); render(); render();
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: reduced ? "auto" : "smooth" });
  if (reduced === undefined) expect(matchMedia).not.toHaveBeenCalled();
  else expect(matchMedia).toHaveBeenCalledExactlyOnceWith("(prefers-reduced-motion: reduce)");
  expect(loadProfile()).toEqual(profile); expect(field("institution-name").props.value).toBe(profile!.institutionName);
  expect(field("profile-city").props.value).toBe(profile!.city); expect(field("signed-merchants").props.value).toBe(profile!.signedMerchantsText);
  expect(field("member-brands").props.value).toBe(brands); expect([...values]).toEqual(stored);
  expect(setItem).toHaveBeenCalledTimes(writes);
  for (const action of [reload, assign, replace, fetchMock, getElementById]) expect(action).not.toHaveBeenCalled();
});
