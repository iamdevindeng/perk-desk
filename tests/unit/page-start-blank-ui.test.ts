// Verifies primary credit union setup and demo selection preserve complete reset and preset behavior.
// Called by: npm test; invented responses and the keyed component harness keep the flow offline
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { getPresets } from "@/lib/data";
import { emptyProfile, saveProfile } from "@/lib/profile-storage";
import type { BranchLookupResponse } from "@/lib/types";
import { FAKE_PROFILE } from "../fixtures/fake-plan";
import { componentText, findComponents, renderComponents, resetComponents, type TestElement } from "../fixtures/component-harness";
import { flushPage, invoke } from "../fixtures/page-harness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/component-harness");
  return { ...actual, useState: (initial: unknown) => {
    const [value, setter] = fake.componentState(initial);
    // React setters stay stable, including the page's preview callback passed to its children.
    const stable = fake.componentRef(setter) as { current: typeof setter };
    return [value, stable.current];
  }, useRef: fake.componentRef, useEffect: fake.componentEffect, useMemo: (calculate: () => unknown) => calculate() };
});
vi.mock("next/dynamic", () => ({ default: () => "MerchantMap" }));
const values = new Map<string, string>();
const fetchMock = vi.fn<typeof fetch>();
const confirm = vi.fn<() => boolean>();
const START_LABEL = "Start with my credit union";
let tree: TestElement;
function render(): void { tree = renderComponents(createElement(Home)); }
function field(id: string): TestElement { return findComponents(tree, (element) => element.props.id === id)[0]; }
function button(label: string): TestElement {
  return findComponents(tree, (element) => element.type === "button" && componentText(element) === label)[0];
}
function edit(id: string, value: string): void { invoke(field(id).props.onChange, { target: { value } }); render(); }
function response(): BranchLookupResponse {
  return { status: "found", query: "Fake Community CU", cityLabel: "Austin, TX", suggestions: [], places: [
    { entityId: "00000000-0000-4000-8000-000000000001", name: "Fake Community CU East", address: "1 Example Lane", lat: 30, lon: -97, distanceMeters: 100 },
  ] };
}
beforeEach(async () => {
  resetComponents(); vi.clearAllMocks(); values.clear(); confirm.mockReturnValue(true);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { confirm, localStorage: {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
  } });
  saveProfile(FAKE_PROFILE); render(); await flushPage(); render();
});
afterEach(() => { resetComponents(); vi.unstubAllGlobals(); });

it("places full-width primary credit union setup before smaller, mobile-stacked demo buttons", () => {
  const text = componentText(tree);
  expect(text).toContain("Set up your credit union");
  expect(text).toContain("Find local merchants your members already love. Your profile stays in this browser.");
  const demoDescription = findComponents(tree, (element) => element.type === "p" && componentText(element).startsWith("Or explore a demo"))[0];
  expect(componentText(demoDescription)).toBe("Or explore a demo with a fictional credit union:");
  expect(text).not.toContain("Clear this browser's profile and results.");
  expect(button("Start blank")).toBeUndefined();
  const buttons = findComponents(tree, (element) => element.type === "button");
  const main = button(START_LABEL);
  for (const token of ["w-full", "bg-teal-800", "hover:bg-teal-900", "py-3"]) expect(main.props.className).toContain(token);
  expect(main.props.className).not.toContain("bg-slate-100");
  const demos = buttons.filter((element) => /^Try (Denver|Austin) demo/.test(componentText(element)));
  expect(demos).toHaveLength(2);
  for (const demo of demos) {
    expect(buttons.indexOf(main)).toBeLessThan(buttons.indexOf(demo));
    for (const token of ["border", "bg-white", "px-3", "py-2", "text-xs"]) expect(demo.props.className).toContain(token);
    expect(componentText(demo)).toMatch(/\d branches · Ready to explore/);
  }
  const grid = findComponents(tree, (element) => String(element.props.className).split(/\s+/).includes("grid")
    && demos.every((demo) => findComponents(element, (child) => child === demo).length > 0)).at(-1)!;
  expect(String(grid.props.className).split(/\s+/)).toEqual(expect.arrayContaining(["grid", "sm:grid-cols-2"]));
  expect(String(grid.props.className).split(/\s+/)).not.toContain("grid-cols-2");
});

it.each(getPresets())("still loads $label through its secondary demo button without a request", (preset) => {
  const label = `Try ${preset.profile.city.split(",")[0]} demo`;
  const demo = findComponents(tree, (element) => element.type === "button" && componentText(element).startsWith(label))[0];
  invoke(demo.props.onClick); render(); render();
  expect(field("institution-name").props.value).toBe(preset.profile.institutionName);
  expect(field("profile-city").props.value).toBe(preset.profile.city);
  expect(field("member-brands").props.value).toBe(preset.brandsText);
  for (const branch of preset.profile.branches) {
    expect(field(`branch-${branch.id}-name`).props.value).toBe(branch.name);
    expect(field(`branch-${branch.id}-address`).props.value).toBe(branch.address);
  }
  expect(fetchMock).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
});

it("clears lookup, city notice, upload errors, and candidates from the primary setup button", async () => {
  expect(button(START_LABEL).props.disabled).toBe(false);
  edit("profile-city", "Austin, TX");
  expect(componentText(tree)).toContain("City changed, so branches were reset.");
  fetchMock.mockResolvedValueOnce(Response.json(response()));
  invoke(button("Find branches").props.onClick); await flushPage(); render(); render();
  expect(componentText(tree)).toContain("Found 1 locations.");
  expect(findComponents(tree, (element) => element.type === "MerchantMap")[0].props.candidates).toEqual(response().places);
  invoke(field("member-brands-file").props.onChange, { currentTarget: { value: "", files: [{ name: "fake.bad", size: 1 }] } });
  invoke(field("signed-merchants-upload").props.onChange, { target: { value: "", files: [{ name: "fake.bad", size: 1 }] } });
  render(); expect(componentText(tree).match(/Choose a CSV or text file\./g)).toHaveLength(2);
  invoke(button(START_LABEL).props.onClick); render(); render();
  expect(field("institution-name").props.value).toBe(""); expect(field("member-brands").props.value).toBe("");
  expect(field("profile-city").props.value).toBe(emptyProfile().city);
  expect(field("branch-search-name").props.value).toBe("");
  expect(componentText(tree)).not.toContain("Searched Qloo"); expect(componentText(tree)).not.toContain("City changed, so branches were reset.");
  expect(componentText(tree)).not.toContain("Choose a CSV or text file.");
  expect(findComponents(tree, (element) => element.type === "MerchantMap")[0].props.candidates).toEqual([]);
});

it("aborts a pending lookup and ignores its late response after starting with my credit union", async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  invoke(button("Find branches").props.onClick); render();
  expect(button("Searching…").props.disabled).toBe(true);
  invoke(button(START_LABEL).props.onClick); render(); render();
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  finish(Response.json(response())); await flushPage(); render(); render();
  expect(componentText(tree)).not.toContain("Searched Qloo"); expect(field("institution-name").props.value).toBe("");
});

it("clears a pending merchant upload and prevents its completion from restoring the old profile", async () => {
  let finish!: (value: string) => void;
  const file = { name: "fake.csv", size: 10, text: () => new Promise<string>((resolve) => { finish = resolve; }) };
  invoke(field("signed-merchants-upload").props.onChange, { target: { value: "", files: [file] } });
  render(); expect(componentText(tree)).toContain("Reading file…");
  invoke(button(START_LABEL).props.onClick); render(); render();
  expect(componentText(tree)).not.toContain("Reading file…");
  finish("Fake Later Shop"); await flushPage(); render(); render();
  expect(field("institution-name").props.value).toBe(""); expect(field("signed-merchants").props.value).toBe("");
});
