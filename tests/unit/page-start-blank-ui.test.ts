// Verifies Start blank clears real form notices, upload state, and branch lookup sessions.
// Called by: npm test; invented responses and the keyed component harness keep the flow offline
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
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

it("renders the secondary full-width reset button and clears lookup, city notice, upload errors, and candidates", async () => {
  expect(button("Start blank").props.disabled).toBe(false);
  expect(button("Start blank").props.className).toContain("w-full");
  expect(button("Start blank").props.className).toContain("bg-slate-100");
  expect(componentText(tree)).toContain("Clear this browser's profile and results.");
  edit("profile-city", "Austin, TX");
  expect(componentText(tree)).toContain("City changed, so branches were reset.");
  fetchMock.mockResolvedValueOnce(Response.json(response()));
  invoke(button("Find branches").props.onClick); await flushPage(); render(); render();
  expect(componentText(tree)).toContain("Found 1 locations.");
  expect(findComponents(tree, (element) => element.type === "MerchantMap")[0].props.candidates).toEqual(response().places);
  invoke(field("member-brands-file").props.onChange, { currentTarget: { value: "", files: [{ name: "fake.bad", size: 1 }] } });
  invoke(field("signed-merchants-upload").props.onChange, { target: { value: "", files: [{ name: "fake.bad", size: 1 }] } });
  render(); expect(componentText(tree).match(/Choose a CSV or text file\./g)).toHaveLength(2);
  invoke(button("Start blank").props.onClick); render(); render();
  expect(field("institution-name").props.value).toBe(""); expect(field("member-brands").props.value).toBe("");
  expect(field("profile-city").props.value).toBe(emptyProfile().city);
  expect(field("branch-search-name").props.value).toBe("");
  expect(componentText(tree)).not.toContain("Searched Qloo"); expect(componentText(tree)).not.toContain("City changed, so branches were reset.");
  expect(componentText(tree)).not.toContain("Choose a CSV or text file.");
  expect(findComponents(tree, (element) => element.type === "MerchantMap")[0].props.candidates).toEqual([]);
});

it("aborts a pending lookup and ignores its late response after Start blank", async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  invoke(button("Find branches").props.onClick); render();
  expect(button("Searching…").props.disabled).toBe(true);
  invoke(button("Start blank").props.onClick); render(); render();
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  finish(Response.json(response())); await flushPage(); render(); render();
  expect(componentText(tree)).not.toContain("Searched Qloo"); expect(field("institution-name").props.value).toBe("");
});

it("clears a pending merchant upload and prevents its completion from restoring the old profile", async () => {
  let finish!: (value: string) => void;
  const file = { name: "fake.csv", size: 10, text: () => new Promise<string>((resolve) => { finish = resolve; }) };
  invoke(field("signed-merchants-upload").props.onChange, { target: { value: "", files: [file] } });
  render(); expect(componentText(tree)).toContain("Reading file…");
  invoke(button("Start blank").props.onClick); render(); render();
  expect(componentText(tree)).not.toContain("Reading file…");
  finish("Fake Later Shop"); await flushPage(); render(); render();
  expect(field("institution-name").props.value).toBe(""); expect(field("signed-merchants").props.value).toBe("");
});
