// Replays blank branch drafts across real profile storage, page reloads, city changes, and reset.
// Called by: npm test; fake React hooks and invented inputs keep every interaction offline
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { emptyProfile, loadProfile, saveProfile } from "@/lib/profile-storage";
import { FAKE_BRANCH, FAKE_PROFILE } from "../fixtures/fake-plan";
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
const values = new Map<string, string>();
const fetchMock = vi.fn(() => { throw new Error("No network allowed"); });
const confirm = vi.fn(() => true);
let tree: TestElement;
function render(): void { tree = renderComponents(createElement(Home)); }
function field(id: string): TestElement | undefined { return findComponents(tree, (element) => element.props.id === id)[0]; }
function button(label: string, index = 0): TestElement {
  return findComponents(tree, (element) => element.type === "button" && componentText(element) === label)[index];
}
function edit(id: string, value: string): void { invoke(field(id)!.props.onChange, { target: { value } }); render(); }
function click(label: string, index = 0): void {
  const target = button(label, index);
  expect(target.props.disabled).not.toBe(true);
  invoke(target.props.onClick); render();
}
function names(): TestElement[] {
  return findComponents(tree, (element) => typeof element.props.id === "string"
    && element.props.id !== "branch-search-name" && /^branch-.+-name$/.test(element.props.id));
}
function expectVisible(id: string, name: string): void {
  expect(names()).toHaveLength(1);
  expect(field(`branch-${id}-name`)!.props.value).toBe(name);
  expect(field(`branch-${id}-address`)!.props.value).toBe("");
  expect(componentText(tree)).not.toContain(EMPTY_MESSAGE);
  expect(componentText(tree)).toContain("1 / 5");
}
async function reload(): Promise<void> { resetComponents(); render(); await flushPage(); render(); }

beforeEach(async () => {
  resetComponents(); values.clear(); fetchMock.mockClear(); confirm.mockClear();
  vi.stubGlobal("document", { getElementById: () => null });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { confirm, localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
  saveProfile(emptyProfile()); await reload();
});
afterEach(() => { expect(fetchMock).not.toHaveBeenCalled(); resetComponents(); vi.unstubAllGlobals(); });

it("keeps a manually opened placeholder visible after reload without an address", async () => {
  edit("institution-name", "Fake Community CU"); edit("member-brands", "Fake Coffee Co");
  const original = loadProfile()!.branches[0];
  expect(componentText(tree)).toContain(EMPTY_MESSAGE);
  click("Add manually");
  await reload();
  expectVisible(original.id, original.name);
  edit("member-brands", "Fake Coffee Co");
  expect(button("Plan merchant categories").props.disabled).toBe(true);
  expect(field("branch-location-hint")).toBeDefined();
});

it("persists manual entry even before the institution or Other city is filled", async () => {
  edit("profile-city", "other");
  click("Add manually");
  const draft = loadProfile()!;
  expect(draft.institutionName).toBe(""); expect(draft.city).toBe("");
  await reload();
  expectVisible(draft.branches[0].id, draft.branches[0].name);
  expect(field("institution-name")!.props.value).toBe("");
  expect(field("profile-other-city")!.props.value).toBe("");
  expect(button("Plan merchant categories").props.disabled).toBe(true);
});

it("keeps the newly added blank survivor visible after removing the original and reloading", async () => {
  edit("institution-name", "Fake Community CU"); click("Add manually"); click("+ Add branch");
  const added = loadProfile()!.branches[1];
  click("Remove", 0); await reload();
  expectVisible(added.id, added.name);
  expect(loadProfile()!.branches).toHaveLength(1);
});

it("keeps the empty state after deleting all manual branches, reloading, and switching cities", async () => {
  edit("institution-name", "Fake Community CU"); click("Add manually"); click("+ Add branch");
  click("Remove", 0); click("Remove");
  const clearedBranches = loadProfile()!.branches;
  await reload();
  expect(componentText(tree)).toContain(EMPTY_MESSAGE); expect(names()).toHaveLength(0);
  expect(componentText(tree)).toContain("0 / 5");
  edit("profile-city", "Austin, TX"); edit("profile-city", "Denver, CO"); await reload();
  expect(componentText(tree)).toContain(EMPTY_MESSAGE); expect(names()).toHaveLength(0);
  expect(loadProfile()!.branches).toEqual(clearedBranches);
  expect(field("institution-name")!.props.value).toBe("Fake Community CU");
  click("Add manually");
  expectVisible(clearedBranches[0].id, "Main branch");
});

it("clears the last branch location and active map pick and blocks planning until a new location is entered", async () => {
  saveProfile(FAKE_PROFILE); await reload(); edit("member-brands", "Fake Coffee Co");
  expect(button("Plan merchant categories").props.disabled).toBe(false);
  click("Pick on map"); click("Remove");
  const map = findComponents(tree, (element) => element.type === "MerchantMap")[0];
  expect(map.props.onPickLocation).toBeUndefined();
  expect(componentText(tree)).not.toContain("set the location for");
  expect(button("Plan merchant categories").props.disabled).toBe(true);
  expect(loadProfile()!.branches[0]).toEqual({ id: expect.any(String), name: "Main branch", address: "", radiusMeters: 6000, isPlaceholder: true });
  expect(loadProfile()!.branches[0].id).not.toBe(FAKE_BRANCH.id);
  await reload(); edit("member-brands", "Fake Coffee Co");
  expect(componentText(tree)).toContain(EMPTY_MESSAGE);
  click("Add manually");
  expect(button("Plan merchant categories").props.disabled).toBe(true);
  edit(`branch-${loadProfile()!.branches[0].id}-address`, "2 Example Lane");
  expect(button("Plan merchant categories").props.disabled).toBe(false);
});

it("keeps an existing branch visible after its address and coordinates are cleared and reloaded", async () => {
  saveProfile(FAKE_PROFILE); await reload();
  edit(`branch-${FAKE_BRANCH.id}-address`, "");
  await reload();
  expectVisible(FAKE_BRANCH.id, FAKE_BRANCH.name);
  expect(loadProfile()!.branches[0]).toMatchObject({ address: "" });
  expect(loadProfile()!.branches[0].lat).toBeUndefined();
  expect(loadProfile()!.branches[0].lon).toBeUndefined();
});

it("restores a blank city draft while keeping a never-opened city placeholder empty", async () => {
  edit("institution-name", "Fake Community CU"); click("Add manually");
  const original = loadProfile()!.branches[0];
  edit(`branch-${original.id}-name`, "Fake Denver Draft");
  edit("profile-city", "Austin, TX"); await reload();
  expect(componentText(tree)).toContain(EMPTY_MESSAGE); expect(names()).toHaveLength(0);
  edit("profile-city", "Denver, CO"); await reload();
  expectVisible(original.id, "Fake Denver Draft");
  expect(field("profile-city")!.props.value).toBe("Denver, CO");
});

it("shows a legacy saved blank branch with no placeholder marker after reload", async () => {
  const branch = { id: "fake-legacy", name: "Main branch", address: "", radiusMeters: 6000 };
  values.set("perkdesk:v1:profile", JSON.stringify({ ...FAKE_PROFILE, branches: [branch] }));
  await reload();
  expectVisible(branch.id, branch.name);
  expect(loadProfile()!.branches[0].id).toBe(branch.id);
});

it("retains blank current names through add, remove, and reload instead of restoring an older list", async () => {
  click("Add manually");
  const original = loadProfile()!.branches[0];
  edit(`branch-${original.id}-name`, ""); click("+ Add branch");
  const addedId = loadProfile()!.branches[1].id;
  await reload();
  expect(names()).toHaveLength(2);
  expect(field(`branch-${original.id}-name`)!.props.value).toBe("");
  expect(field(`branch-${addedId}-name`)).toBeDefined();
  click("Remove", 1); await reload();
  expectVisible(original.id, "");
  expect(field(`branch-${addedId}-name`)).toBeUndefined();
});

it("resets an opened draft to a real empty placeholder and preserves that state after reload", async () => {
  click("Add manually");
  expect(names()).toHaveLength(1);
  click("Start with my credit union");
  expect(confirm).toHaveBeenCalledOnce();
  await reload();
  expect(componentText(tree)).toContain(EMPTY_MESSAGE); expect(names()).toHaveLength(0);
  expect(componentText(tree)).toContain("0 / 5");
  expect(button("Add manually")).toBeDefined();
});

it("does not ask to discard an otherwise empty profile after its only draft was removed", () => {
  click("Add manually"); click("Remove"); click("Start with my credit union");
  expect(confirm).not.toHaveBeenCalled();
  expect(componentText(tree)).toContain(EMPTY_MESSAGE);
});
