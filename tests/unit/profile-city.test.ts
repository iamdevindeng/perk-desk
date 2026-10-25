// Exercises saved city branches and change notices through real form and page callbacks.
// Called by: npm test; fake hooks and transports keep every interaction offline
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import Home from "@/app/page";
import { DEFAULT_RADIUS_M } from "@/lib/config";
import { getPresets } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { FAKE_PLAN_RESPONSE } from "../fixtures/fake-plan";
import { elementProps, flushPage, invoke, pageHarness, renderPage, resetPage, unmountPage } from "../fixtures/page-harness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, useState: fake.fakeState, useRef: fake.fakeRef, useEffect: fake.fakeEffect, useMemo: (calculate: () => unknown) => calculate() };
});
vi.mock("next/dynamic", () => ({ default: () => "MerchantMap" }));
vi.mock("@/components/PresetPicker", () => ({ default: "PresetPicker" }));
vi.mock("@/components/ProfileForm", () => ({ default: "ProfileForm" }));
vi.mock("@/components/TasteInput", () => ({ default: "TasteInput" }));
vi.mock("@/components/CategoryConfirm", () => ({ default: "CategoryConfirm" }));
vi.mock("@/components/AgentTrace", () => ({ default: "AgentTrace" }));
vi.mock("@/components/MerchantCard", () => ({ MerchantResults: "MerchantResults" }));
vi.mock("@/components/ui/button", () => ({ Button: "Button" }));
vi.mock("@/lib/profile-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profile-storage")>();
  const { FAKE_PROFILE, FAKE_BRANCH, FAKE_PLACE_ID, FAKE_CATEGORY_ID } = await import("../fixtures/fake-plan");
  return { ...actual, saveProfile: vi.fn(), loadProfile: () => structuredClone({ ...FAKE_PROFILE, city: "Portland, OR",
    branches: [FAKE_BRANCH, { ...FAKE_BRANCH, id: "fake-second", name: "Fake Second Branch" }],
    signedMerchantsText: "Fake Signed Shop", businessMembersText: "Fake Business Shop",
    categoryPreferences: { removed: [FAKE_CATEGORY_ID], added: [] },
    merchantStatus: { [FAKE_PLACE_ID]: { name: "Fake Shop", status: "contacted", updatedAt: "2026-10-25" } },
  }) };
});
vi.mock("@/lib/run-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/run-client")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, postPlan: fake.fakePlan, streamRun: fake.fakeRun };
});

type TestElement = ReactElement<Record<string, unknown>>;
let formModule: typeof import("@/components/ProfileForm");
let pageTree: TestElement;
let formTree: TestElement;
let cityTree: TestElement;
let branchTree: TestElement;

function find(root: unknown, predicate: (element: TestElement) => boolean): TestElement | undefined {
  if (Array.isArray(root)) {
    for (const child of root) { const found = find(child, predicate); if (found) return found; }
    return;
  }
  if (!root || typeof root !== "object" || !("props" in root)) return;
  const element = root as TestElement;
  return predicate(element) ? element : find(element.props.children, predicate);
}

function expand(root: TestElement, name: string): TestElement {
  const element = find(root, (child) => typeof child.type === "function" && child.type.name === name);
  if (!element) throw new Error(`Expected ${name}`);
  return (element.type as (props: Record<string, unknown>) => ReactElement)(element.props) as TestElement;
}

function render(): void {
  renderPage(() => {
    pageTree = Home() as TestElement;
    formTree = formModule.default(elementProps(pageTree, "ProfileForm") as Parameters<typeof formModule.default>[0]) as TestElement;
    cityTree = expand(formTree, "CityField");
    branchTree = expand(expand(formTree, "BranchEditor"), "BranchFields");
    return pageTree;
  });
}

function profile(): Profile { render(); return elementProps(pageTree, "ProfileForm").profile as Profile; }
function changeField(id: string, value: string): void {
  render();
  const field = find([formTree, cityTree, branchTree], (element) => element.props.id === id);
  if (!field) throw new Error(`Expected field ${id}`);
  invoke(field.props.onChange, { target: { value } });
  render();
}
function textContent(root: unknown): string {
  if (typeof root === "string") return root;
  if (Array.isArray(root)) return root.map(textContent).join("");
  if (!root || typeof root !== "object" || !("props" in root)) return "";
  return textContent((root as TestElement).props.children);
}
function notice(): string | undefined {
  render();
  const status = find(cityTree, (element) => element.props.role === "status");
  return status ? textContent(status) : undefined;
}

beforeEach(async () => {
  resetPage(); vi.clearAllMocks();
  formModule = await vi.importActual<typeof import("@/components/ProfileForm")>("@/components/ProfileForm");
  render(); await flushPage(); render();
});
afterEach(unmountPage);

it.each(["Denver, CO", "Austin, TX", "other"])("remembers current branches and resets unsaved %s", (selected) => {
  const previous = profile();
  expect(notice()).toBeUndefined();
  changeField("profile-city", selected);
  const updated = profile();
  expect(updated.branches).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: "Branch 1", address: "", radiusMeters: DEFAULT_RADIUS_M }]);
  expect(previous.branches.some((branch) => branch.id === updated.branches[0].id)).toBe(false);
  expect(updated).toEqual({ ...previous, city: selected === "other" ? "" : selected, branches: updated.branches,
    branchesByCity: { "Portland, OR": previous.branches } });
  expect(notice()).toBe(`City changed, so branches were reset. Add your branches in ${selected === "other" ? "the new city" : selected}.`);
});

it("keeps branches while typing Other city, both before and after a select reset", () => {
  const original = profile().branches;
  changeField("profile-other-city", "Salem, OR");
  expect(profile().branches).toBe(original);
  expect(notice()).toBeUndefined();
  changeField("profile-city", "Austin, TX");
  changeField("profile-city", "other");
  const resetBranches = profile().branches;
  for (const city of ["P", "Portland", "Portland, OR"]) {
    changeField("profile-other-city", city);
    expect(profile().branches).toBe(resetBranches);
    expect(profile().city).toBe(city);
    expect(notice()).toBe("City changed, so branches were reset. Add your branches in the new city.");
  }
  changeField("profile-city", "Denver, CO");
  changeField("profile-city", "other");
  expect(profile().branches).not.toBe(resetBranches);
  expect(profile().branches[0]).toEqual({ id: expect.any(String), name: "Branch 1", address: "", radiusMeters: DEFAULT_RADIUS_M });
  changeField("profile-other-city", "Portland, OR");
  expect(profile().branches).not.toBe(profile().branchesByCity["Portland, OR"]);
});

it.each([["name", "Fake New Branch"], ["address", "3 Example Lane"], ["radius", "8"]])(
  "hides the reset notice after editing the branch %s", (field, value) => {
    changeField("profile-city", "Austin, TX");
    expect(notice()).toBeDefined();
    changeField(`branch-${profile().branches[0].id}-${field}`, value);
    expect(notice()).toBeUndefined();
  },
);

it("hides the reset notice after the real page map-pick callback", () => {
  changeField("profile-city", "Austin, TX");
  invoke(elementProps(pageTree, "ProfileForm").onPickBranch, profile().branches[0].id);
  render();
  expect(notice()).toBeDefined();
  invoke(elementProps(pageTree, "MerchantMap").onPickLocation, { lat: 30.27, lon: -97.74 });
  expect(profile().branches[0]).toMatchObject({ lat: 30.27, lon: -97.74, locationSource: "map" });
  expect(notice()).toBeUndefined();
});

it.each(getPresets())("hides the reset notice when selecting $label through the page", (preset) => {
  const original = profile();
  changeField("profile-city", "other");
  expect(notice()).toBeDefined();
  invoke(elementProps(pageTree, "PresetPicker").onSelect, preset);
  expect(profile()).toEqual({ ...preset.profile, categoryPreferences: { removed: [], added: [] }, merchantStatus: {},
    branchesByCity: { "Portland, OR": original.branches },
    branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })) });
  expect(elementProps(pageTree, "TasteInput").value).toBe(preset.brandsText);
  expect(notice()).toBeUndefined();
});

it("restores edited Denver branches after Austin and hides the restored notice on edits or presets", () => {
  const original = profile();
  invoke(elementProps(pageTree, "PresetPicker").onSelect, getPresets()[0]);
  expect(profile().branchesByCity["Portland, OR"]).toEqual(original.branches);
  changeField(`branch-${profile().branches[0].id}-address`, "3 Example Lane");
  const denverBranches = profile().branches;
  changeField("profile-city", "Austin, TX");
  expect(profile().branches).toHaveLength(1);
  changeField("profile-city", "Denver, CO");
  expect(profile().branches).toEqual(denverBranches);
  expect(notice()).toBe("Restored your saved branches for Denver, CO.");
  const restored = profile();
  invoke(elementProps(pageTree, "ProfileForm").onChange, { ...restored,
    branches: restored.branches.map((branch, index) => index === 1 ? { ...branch, name: "Fake Edited Branch" } : branch) });
  expect(notice()).toBeUndefined();
  changeField("profile-city", "Austin, TX");
  changeField("profile-city", "Denver, CO");
  expect(notice()).toBe("Restored your saved branches for Denver, CO.");
  const current = profile();
  invoke(elementProps(pageTree, "PresetPicker").onSelect, getPresets()[1]);
  expect(profile().branchesByCity).toEqual({ ...current.branchesByCity, "Denver, CO": current.branches });
  expect(notice()).toBeUndefined();
});

it("keeps the reset notice when another profile field changes", () => {
  changeField("profile-city", "Austin, TX");
  const message = notice();
  const branches = profile().branches;
  changeField("institution-name", "Fake Updated CU");
  expect(profile().institutionName).toBe("Fake Updated CU");
  expect(profile().branches).toBe(branches);
  expect(notice()).toBe(message);
});

it("keeps the reset notice after planning cannot locate the untouched blank branch", async () => {
  changeField("profile-city", "Austin, TX");
  const branches = profile().branches;
  const message = notice();
  invoke(elementProps(pageTree, "TasteInput").onChange, "Fake Coffee Co");
  render();
  expect(elementProps(pageTree, "Button").disabled).toBe(false);
  invoke(elementProps(pageTree, "Button").onClick);
  expect(pageHarness.plans).toHaveLength(1);
  pageHarness.plans[0].resolve({ ...FAKE_PLAN_RESPONSE, branches: [], categories: [], candidateCategories: [] });
  await flushPage();
  expect(profile().branches).not.toBe(branches);
  expect(profile().branches[0]).toBe(branches[0]);
  expect(notice()).toBe(message);
});
