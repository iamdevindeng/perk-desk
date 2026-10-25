// Checks city-memory eviction and incomplete branch drafts through real page and form callbacks.
// Called by: npm test; fake hooks and transports keep every interaction offline
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import Home from "@/app/page";
import { getPresets } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { elementProps, flushPage, invoke, renderPage, resetPage, unmountPage } from "../fixtures/page-harness";

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
  const { FAKE_PROFILE, FAKE_BRANCH } = await import("../fixtures/fake-plan");
  const branchesByCity = {
    "Denver, CO": [{ ...FAKE_BRANCH, name: "Fake Saved Denver Branch" }],
    ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`Fake City ${index}, CO`, [FAKE_BRANCH]])),
  };
  return { ...actual, saveProfile: vi.fn(), loadProfile: () => structuredClone({ ...FAKE_PROFILE, city: "Portland, OR", branchesByCity }) };
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

beforeEach(async () => {
  resetPage(); vi.clearAllMocks();
  formModule = await vi.importActual<typeof import("@/components/ProfileForm")>("@/components/ProfileForm");
  render(); await flushPage(); render();
});
afterEach(unmountPage);

it("restores the oldest destination while saving the eleventh city evicts its memory entry", () => {
  const previous = profile();
  expect(Object.keys(previous.branchesByCity)[0]).toBe("Denver, CO");
  expect(Object.keys(previous.branchesByCity)).toHaveLength(10);
  changeField("profile-city", "Denver, CO");
  const updated = profile();
  expect(updated.branches).toEqual(previous.branchesByCity["Denver, CO"]);
  expect(Object.keys(updated.branchesByCity)).toHaveLength(10);
  expect(updated.branchesByCity).not.toHaveProperty("Denver, CO");
  expect(updated.branchesByCity["Portland, OR"]).toEqual(previous.branches);
  expect(find(cityTree, (element) => element.props.role === "status")?.props.children)
    .toBe("Restored your saved branches for Denver, CO.");
});

it.each(getPresets())("loads $label while preserving an incomplete branch draft in city memory", (preset) => {
  changeField(`branch-${profile().branches[0].id}-name`, "");
  const draft = profile();
  expect(draft.branches[0].name).toBe("");
  expect(() => invoke(elementProps(pageTree, "PresetPicker").onSelect, preset)).not.toThrow();
  const updated = profile();
  expect(updated.city).toBe(preset.profile.city);
  expect(updated.branches).toEqual(preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })));
  expect(updated.branchesByCity["Portland, OR"]).toEqual(draft.branches);
  expect(Object.keys(updated.branchesByCity)).toHaveLength(10);
  expect(elementProps(pageTree, "TasteInput").value).toBe(preset.brandsText);
});
