// Replays branch add/remove sequences to preserve visible drafts and distinct default names.
// Called by: npm test; fake hooks and invented branches keep every interaction offline
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BranchEditor from "@/components/BranchEditor";
import { PROFILE_MAX_BRANCHES } from "@/lib/config";
import type { ProfileBranch } from "@/lib/types";
import { FAKE_BRANCH } from "../fixtures/fake-plan";
import { componentText, findComponents, renderComponents, resetComponents, type TestElement } from "../fixtures/component-harness";
import { invoke } from "../fixtures/page-harness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/component-harness");
  return { ...actual, useState: fake.componentState, useRef: fake.componentRef, useEffect: fake.componentEffect };
});

let branches: ProfileBranch[];
let tree: TestElement;
let disabled: boolean;
const onChange = vi.fn<(next: ProfileBranch[]) => void>((next) => { branches = next; });
const focus = vi.fn();
function render(): void {
  tree = renderComponents(createElement(BranchEditor, { branches, disabled, onChange, onPickBranch: () => {} }));
}
function field(id: string): TestElement | undefined { return findComponents(tree, (element) => element.props.id === id)[0]; }
function button(label: string, index = 0): TestElement {
  return findComponents(tree, (element) => element.type === "button" && componentText(element) === label)[index];
}
function click(label: string, index = 0): void {
  const target = button(label, index);
  expect(target.props.disabled).not.toBe(true);
  invoke(target.props.onClick); render();
}
function edit(id: string, value: string): void { invoke(field(id)!.props.onChange, { target: { value } }); render(); }
function blankBranch(id: string): ProfileBranch {
  return { ...FAKE_BRANCH, id, address: "", lat: undefined, lon: undefined, locationSource: undefined };
}
beforeEach(() => {
  resetComponents(); vi.clearAllMocks(); disabled = false;
  branches = [{ ...FAKE_BRANCH, id: "fake-a", name: "Fake A" }];
  vi.stubGlobal("document", { getElementById: () => ({ focus }) }); render();
});
afterEach(() => { resetComponents(); vi.unstubAllGlobals(); });

it("keeps a newly added blank branch visible when the original branch is removed", () => {
  click("+ Add branch");
  const added = branches[1];
  click("Remove", 0);
  expect(branches).toEqual([added]);
  expect(field(`branch-${added.id}-name`)!.props.value).toBe(added.name);
  expect(componentText(tree)).toContain(`1 / ${PROFILE_MAX_BRANCHES}`);
  expect(componentText(tree)).not.toContain("No branches yet.");
  expect(focus).not.toHaveBeenCalled();
  edit(`branch-${added.id}-address`, "1 Example Lane");
  expect(branches[0].address).toBe("1 Example Lane");
});

it("remembers the first edited draft after editing and removing another branch", () => {
  edit("branch-fake-a-address", "");
  click("+ Add branch");
  edit(`branch-${branches[1].id}-name`, "Fake B");
  click("Remove", 1);
  expect(field("branch-fake-a-name")!.props.value).toBe("Fake A");
  expect(field("branch-fake-a-address")!.props.value).toBe("");
  expect(componentText(tree)).not.toContain("No branches yet.");
  expect(focus).not.toHaveBeenCalled();
});

it("keeps an untouched visible draft open when removing its sibling", () => {
  branches = [blankBranch("fake-a"), blankBranch("fake-b")]; render();
  click("Remove", 1);
  expect(field("branch-fake-a-address")).toBeDefined();
  expect(componentText(tree)).toContain(`1 / ${PROFILE_MAX_BRANCHES}`);
});

it("starts a different city's placeholder closed after add/remove operations", () => {
  click("+ Add branch"); click("Remove", 0);
  branches = [{ ...blankBranch("fake-new-city"), isPlaceholder: true }]; render();
  expect(componentText(tree)).toContain("No branches yet.");
  expect(field("branch-fake-new-city-name")).toBeUndefined();
  click("Add manually");
  expect(field("branch-fake-new-city-name")).toBeDefined();
  expect(focus).toHaveBeenCalledOnce();
});

it("avoids reusing a remaining default name after removing the middle branch", () => {
  click("+ Add branch"); click("+ Add branch");
  const retained = [branches[0], branches[2]];
  click("Remove", 1); click("+ Add branch");
  expect(branches.slice(0, 2)).toEqual(retained);
  expect(branches.map((branch) => branch.name)).toEqual(["Fake A", "Branch 3", "Branch 4"]);
  expect(new Set(branches.map((branch) => branch.id)).size).toBe(3);
});

it("skips default names already used with different case or surrounding spaces", () => {
  branches = [{ ...FAKE_BRANCH, name: " branch 2 " }]; render();
  click("+ Add branch");
  expect(branches.map((branch) => branch.name)).toEqual([" branch 2 ", "Branch 3"]);
});

it("enforces both count limits without changing the remaining branch", () => {
  const original = branches[0];
  expect(button("Remove").props.disabled).toBe(true);
  invoke(button("Remove").props.onClick); render();
  expect(onChange).not.toHaveBeenCalled();
  for (let index = 1; index < PROFILE_MAX_BRANCHES; index += 1) click("+ Add branch");
  expect(button("+ Add branch").props.disabled).toBe(true);
  invoke(button("+ Add branch").props.onClick); render();
  expect(branches).toHaveLength(PROFILE_MAX_BRANCHES);
  expect(branches[0]).toEqual(original);
});

it("ignores add, edit, and remove callbacks while the editor is disabled", () => {
  click("+ Add branch"); disabled = true; render();
  const original = structuredClone(branches); onChange.mockClear();
  invoke(button("+ Add branch").props.onClick);
  invoke(button("Remove").props.onClick);
  invoke(field("branch-fake-a-name")!.props.onChange, { target: { value: "Fake Changed" } }); render();
  expect(branches).toEqual(original); expect(onChange).not.toHaveBeenCalled();
});
