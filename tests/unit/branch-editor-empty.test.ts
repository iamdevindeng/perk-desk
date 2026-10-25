// Checks empty branch display, manual entry focus, and page planning readiness without changing profile data.
// Called by: npm test; fake hooks, browser storage, and invented lookup responses keep all checks offline
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
import BranchEditor from "@/components/BranchEditor";
import { PROFILE_MAX_BRANCHES } from "@/lib/config";
import { emptyProfile, loadProfile, saveProfile } from "@/lib/profile-storage";
import type { Branch, BranchLookupResponse } from "@/lib/types";
import { FAKE_BRANCH } from "../fixtures/fake-plan";
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

const EMPTY_MESSAGE = "No branches yet. Use Find branches above, or add one manually.";
const BLANK_BRANCH: Branch = { ...FAKE_BRANCH, name: "Main branch", address: "", lat: undefined, lon: undefined, locationSource: undefined };
const focus = vi.fn();
const getElementById = vi.fn();
const fetchMock = vi.fn<typeof fetch>();
const values = new Map<string, string>();
const onChange = vi.fn<(updated: Branch[]) => void>((updated) => { branches = updated; });
let branches: Branch[];
let disabled: boolean;
let tree: TestElement;
function render(): void {
  tree = renderComponents(createElement(BranchEditor, { branches, disabled, onChange, onPickBranch: vi.fn() }));
}
function renderHome(): void { tree = renderComponents(createElement(Home)); }
function field(id: string): TestElement | undefined { return findComponents(tree, (element) => element.props.id === id)[0]; }
function button(label: string): TestElement {
  return findComponents(tree, (element) => element.type === "button" && componentText(element) === label)[0];
}
function editHome(id: string, value: string): void { invoke(field(id)!.props.onChange, { target: { value } }); renderHome(); }
beforeEach(() => {
  resetComponents(); vi.clearAllMocks(); values.clear(); branches = [structuredClone(BLANK_BRANCH)]; disabled = false;
  getElementById.mockReturnValue({ focus });
  vi.stubGlobal("document", { getElementById }); vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
  } });
});
afterEach(() => { resetComponents(); vi.unstubAllGlobals(); });

it.each(["Main branch", "Branch 1"])("shows a short empty state for a blank %s without altering its data", (name) => {
  branches = [{ ...BLANK_BRANCH, name }]; const original = structuredClone(branches); render();
  expect(componentText(tree)).toContain(EMPTY_MESSAGE);
  expect(componentText(tree)).toContain(`0 / ${PROFILE_MAX_BRANCHES}`);
  expect(findComponents(tree, (element) => element.type === "fieldset")).toHaveLength(0);
  expect(field(`branch-${BLANK_BRANCH.id}-name`)).toBeUndefined();
  expect(button("Add manually")).toBeDefined(); expect(button("+ Add branch")).toBeUndefined();
  expect(branches).toEqual(original); expect(onChange).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
});

it("reveals the same placeholder and focuses its name once without persisting UI state", () => {
  const original = structuredClone(branches); render();
  invoke(button("Add manually").props.onClick); render(); render();
  expect(componentText(tree)).not.toContain(EMPTY_MESSAGE);
  expect(field(`branch-${BLANK_BRANCH.id}-name`)!.props.value).toBe(BLANK_BRANCH.name);
  expect(getElementById).toHaveBeenCalledExactlyOnceWith(`branch-${BLANK_BRANCH.id}-name`);
  expect(focus).toHaveBeenCalledOnce(); expect(onChange).not.toHaveBeenCalled(); expect(branches).toEqual(original);
  invoke(field(`branch-${BLANK_BRANCH.id}-name`)!.props.onChange, { target: { value: "Fake Manual Branch" } }); render();
  expect(field(`branch-${BLANK_BRANCH.id}-name`)!.props.value).toBe("Fake Manual Branch");
  expect(focus).toHaveBeenCalledOnce(); expect(branches[0].id).toBe(BLANK_BRANCH.id);
});

it.each([
  { ...BLANK_BRANCH, address: "1 Example Lane" }, { ...BLANK_BRANCH, lat: 0 },
  { ...BLANK_BRANCH, lon: 0 }, { ...BLANK_BRANCH, lat: 0, lon: 0 },
  { ...BLANK_BRANCH, locationSource: "map" as const },
])("shows the form when any address or location information exists: %j", (branch) => {
  branches = [branch]; render();
  expect(field(`branch-${branch.id}-name`)).toBeDefined();
  expect(componentText(tree)).not.toContain(EMPTY_MESSAGE); expect(onChange).not.toHaveBeenCalled();
});

it("treats whitespace-only addresses as blank and shows both forms for two blank branches", () => {
  branches = [{ ...BLANK_BRANCH, address: " \t " }]; render();
  expect(componentText(tree)).toContain(EMPTY_MESSAGE);
  branches = [...branches, { ...BLANK_BRANCH, id: "fake-second", name: "Branch 2" }]; render();
  expect(findComponents(tree, (element) => element.type === "fieldset")).toHaveLength(2);
  expect(field("branch-fake-second-name")).toBeDefined(); expect(componentText(tree)).not.toContain(EMPTY_MESSAGE);
});

it("returns to the empty state for a different placeholder after manual entry", () => {
  render(); invoke(button("Add manually").props.onClick); render();
  branches = [{ ...BLANK_BRANCH, id: "fake-new-city" }]; render();
  expect(componentText(tree)).toContain(EMPTY_MESSAGE); expect(field("branch-fake-new-city-name")).toBeUndefined();
  expect(focus).toHaveBeenCalledOnce(); expect(onChange).not.toHaveBeenCalled();
});

it("does not open manual entry while disabled", () => {
  disabled = true; render(); expect(button("Add manually").props.disabled).toBe(true);
  invoke(button("Add manually").props.onClick); render();
  expect(componentText(tree)).toContain(EMPTY_MESSAGE);
  expect(onChange).not.toHaveBeenCalled(); expect(focus).not.toHaveBeenCalled();
});

it("keeps Plan disabled with its hint until selected lookup branches replace the empty placeholder", async () => {
  getElementById.mockReturnValue(null); saveProfile(emptyProfile()); renderHome(); await flushPage(); renderHome();
  editHome("institution-name", "Fake Community CU"); editHome("member-brands", "Fake Coffee Co");
  const placeholderId = loadProfile()!.branches[0].id;
  expect(componentText(tree)).toContain(EMPTY_MESSAGE);
  expect(button("Plan merchant categories").props.disabled).toBe(true);
  expect(button("Plan merchant categories").props["aria-describedby"]).toBe("branch-location-hint");
  expect(componentText(field("branch-location-hint"))).toBe("Add an address or pick a map location for every branch.");
  expect(fetchMock).not.toHaveBeenCalled();
  const response: BranchLookupResponse = { status: "found", query: "Fake Community CU", cityLabel: "Denver, CO", suggestions: [], places: [
    { entityId: "00000000-0000-4000-8000-000000000001", name: "Fake Community CU West", address: "1 Example Lane", lat: 39, lon: -104, distanceMeters: 100 },
  ] };
  fetchMock.mockResolvedValueOnce(Response.json(response));
  invoke(button("Find branches").props.onClick); await flushPage(); renderHome(); renderHome();
  invoke(button("Use selected branches").props.onClick); renderHome(); renderHome();
  const saved = loadProfile()!;
  expect(saved.branches).toHaveLength(1); expect(saved.branches[0].id).not.toBe(placeholderId);
  expect(saved.branches[0]).toMatchObject({ address: "1 Example Lane", lat: 39, lon: -104, locationSource: "qloo_place" });
  expect(field(`branch-${saved.branches[0].id}-name`)).toBeDefined(); expect(componentText(tree)).not.toContain(EMPTY_MESSAGE);
  expect(button("Plan merchant categories").props.disabled).toBe(false); expect(field("branch-location-hint")).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
