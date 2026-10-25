// Checks the back-to-top logo respects motion settings and preserves the current page data.
// Called by: npm test; actual page components use fake hooks and in-memory browser storage
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
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

it("uses an accessible non-submit button with the original eyebrow styling and visible keyboard focus", () => {
  expect(logo().type).toBe("button"); expect(logo().props.type).toBe("button");
  expect(componentText(logo())).toBe("Perk Desk"); expect(logo().props.href).toBeUndefined();
  const classes = String(logo().props.className);
  for (const token of ["mb-3", "text-sm", "font-bold", "uppercase", "tracking-[0.2em]", "text-teal-700", "cursor-pointer", "focus-visible:"]) {
    expect(classes).toContain(token);
  }
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
