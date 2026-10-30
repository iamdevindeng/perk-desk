// Checks branch edits across city changes and reloads using real browser-profile persistence.
// Called by: npm test; fake React hooks and local storage keep all component interactions offline
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { getPresets } from "@/lib/data";
import { loadProfile, saveProfile } from "@/lib/profile-storage";
import { buildPlanRequest } from "@/lib/request-builders";
import { FAKE_PROFILE, FAKE_BRANCH } from "../fixtures/fake-plan";
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
const fetchMock = vi.fn(() => { throw new Error("No network allowed"); });
let tree: TestElement;
function render(): void { tree = renderComponents(createElement(Home)); }
function field(id: string): TestElement | undefined { return findComponents(tree, (element) => element.props.id === id)[0]; }
function buttons(label: string): TestElement[] {
  return findComponents(tree, (element) => element.type === "button" && componentText(element).startsWith(label));
}
function edit(id: string, value: string): void { invoke(field(id)!.props.onChange, { target: { value } }); render(); }
function click(label: string, index = 0): void {
  const button = buttons(label)[index];
  expect(button.props.disabled).not.toBe(true);
  invoke(button.props.onClick); render();
}
function branchNameFields(): TestElement[] {
  return findComponents(tree, (element) => typeof element.props.id === "string"
    && element.props.id !== "branch-search-name" && /^branch-.+-name$/.test(element.props.id));
}
async function reload(): Promise<void> { resetComponents(); render(); await flushPage(); render(); }

beforeEach(async () => {
  resetComponents(); values.clear(); fetchMock.mockClear();
  vi.stubGlobal("document", { getElementById: () => null });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
  saveProfile({ ...FAKE_PROFILE, branches: [
    { ...FAKE_BRANCH, id: "fake-a", name: "Fake A" }, { ...FAKE_BRANCH, id: "fake-b", name: "Fake B" },
  ] });
  await reload();
});
afterEach(() => { expect(fetchMock).not.toHaveBeenCalled(); resetComponents(); vi.unstubAllGlobals(); });

it("persists additions and removals in a valid city while retaining another city's unfinished name", async () => {
  edit("branch-fake-a-name", "");
  edit("profile-city", "Austin, TX");
  click("Add manually"); click("+ Add branch");
  const names = branchNameFields();
  expect(names).toHaveLength(2);
  const firstId = String(names[0].props.id).replace(/-name$/, "");
  const secondId = String(names[1].props.id).replace(/-name$/, "");
  edit(`${firstId}-address`, "1 Example Lane"); edit(`${secondId}-address`, "2 Example Lane");
  const added = loadProfile()!;
  expect(added.city).toBe("Austin, TX"); expect(added.branches).toHaveLength(2);
  expect(added.branchesByCity["Denver, CO"][0].name).toBe("");
  expect(buildPlanRequest(added, "Fake Coffee Co")).not.toHaveProperty("branchesByCity");
  await reload();
  expect(branchNameFields()).toHaveLength(2);
  expect(field(`${secondId}-address`)!.props.value).toBe("2 Example Lane");
  click("Remove", 1);
  const removed = loadProfile()!;
  expect(removed.branches.map((branch) => branch.id)).toEqual([firstId.replace(/^branch-/, "")]);
  await reload();
  expect(field("profile-city")!.props.value).toBe("Austin, TX");
  expect(branchNameFields()).toHaveLength(1); expect(field(`${secondId}-name`)).toBeUndefined();
  edit("profile-city", "Denver, CO");
  expect(field("branch-fake-a-name")!.props.value).toBe("");
  expect(field("branch-fake-b-name")!.props.value).toBe("Fake B");
  edit("branch-fake-a-name", "Fake Completed A");
  await reload();
  expect(field("profile-city")!.props.value).toBe("Denver, CO");
  expect(field("branch-fake-a-name")!.props.value).toBe("Fake Completed A");
});

it.each(getPresets())("persists $label even when another city has an unfinished branch draft", async (preset) => {
  edit("branch-fake-a-name", "");
  click(`Try ${preset.profile.city.split(",")[0]} demo`);
  const saved = loadProfile()!;
  expect(saved.city).toBe(preset.profile.city);
  expect(saved.branches).toEqual(preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })));
  expect(saved.branchesByCity["Denver, CO"][0].name).toBe("");
  await reload();
  expect(field("institution-name")!.props.value).toBe(preset.profile.institutionName);
  expect(branchNameFields()).toHaveLength(preset.profile.branches.length);
});
