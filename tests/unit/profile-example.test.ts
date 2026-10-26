// Checks selectable credit union examples and controlled name updates in the real profile form.
// Called by: npm test; the component harness and forbidden fetch keep every interaction offline
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProfileForm from "@/components/ProfileForm";
import type { Profile } from "@/lib/types";
import { FAKE_PROFILE } from "../fixtures/fake-plan";
import { componentText, findComponents, renderComponents, resetComponents, type TestElement } from "../fixtures/component-harness";
import { invoke } from "../fixtures/page-harness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/component-harness");
  return { ...actual, useState: fake.componentState, useRef: fake.componentRef, useEffect: fake.componentEffect };
});

const EXAMPLES = [
  { city: "Denver, CO", name: "Bellco Credit Union" },
  { city: "Austin, TX", name: "University Federal Credit Union" },
];
const fetchMock = vi.fn();
const onChange = vi.fn<(updated: Profile) => void>((updated) => { profile = updated; });
const onPickBranch = vi.fn();
let profile: Profile;
let disabled: boolean;
let tree: TestElement;
function render(): void {
  tree = renderComponents(createElement(ProfileForm, { profile, disabled, onChange, onPickBranch }));
}
function field(id: string): TestElement { return findComponents(tree, (element) => element.props.id === id)[0]; }
function exampleLine(): TestElement | undefined {
  return findComponents(tree, (element) => element.type === "p" && componentText(element).startsWith("Not sure? Try "))[0];
}
function exampleButton(): TestElement {
  return findComponents(exampleLine(), (element) => element.type === "button")[0];
}
function edit(id: string, value: string): void { invoke(field(id).props.onChange, { target: { value } }); render(); }
beforeEach(() => {
  resetComponents(); vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  profile = { ...structuredClone(FAKE_PROFILE), institutionName: "" }; disabled = false;
});
afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled(); expect(onPickBranch).not.toHaveBeenCalled();
  resetComponents(); vi.unstubAllGlobals();
});

it.each(EXAMPLES)("shows the exact $city example below an empty input with its unchanged placeholder", ({ city, name }) => {
  profile.city = city; render();
  const input = field("institution-name");
  expect(input.props.value).toBe("");
  expect(input.props.placeholder).toBe(`e.g. ${name}`);
  expect(componentText(exampleLine())).toBe(`Not sure? Try ${name}`);
  expect(exampleLine()?.props.className).toContain("text-xs text-slate-500");
  expect(exampleButton().props).toMatchObject({ type: "button", "aria-label": `Use ${name} as the credit union name` });
  expect(componentText(exampleButton())).toBe(name);
  expect(exampleButton().props.className).toContain("text-teal-");
  expect(exampleButton().props.className).toContain("underline");
  const container = findComponents(tree, (element) => element.type === "div"
    && Array.isArray(element.props.children) && element.props.children.includes(input))[0];
  const children = container.props.children as unknown[];
  expect(children[children.indexOf(input) + 1]).toBe(exampleLine());
  expect(onChange).not.toHaveBeenCalled();
});

it.each(EXAMPLES)("fills $name through onChange and hides its line until the input changes", ({ city, name }) => {
  profile.city = city; render();
  const original = structuredClone(profile);
  invoke(exampleButton().props.onClick);
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...original, institutionName: name });
  render();
  expect(field("institution-name").props.value).toBe(name);
  expect(field("branch-search-name").props.value).toBe(name);
  expect(exampleLine()).toBeUndefined();
  edit("institution-name", "Fake Different CU");
  expect(componentText(exampleLine())).toBe(`Not sure? Try ${name}`);
  expect(onChange).toHaveBeenLastCalledWith({ ...original, institutionName: "Fake Different CU" });
});

it.each(EXAMPLES)("hides the $city line for trimmed, case-insensitive matches", ({ city, name }) => {
  profile.city = city;
  for (const value of [name, `  ${name.toLowerCase()}  `, `\t${name.toUpperCase()}\t`]) {
    profile.institutionName = value; render();
    expect(field("institution-name").props.value).toBe(value);
    expect(exampleLine()).toBeUndefined();
  }
  expect(onChange).not.toHaveBeenCalled();
});

it.each(["", "   ", "Portland, OR", "Xyzville, ZZ"])("shows no example for Other city %j", (city) => {
  profile.city = city; render();
  expect(field("profile-city").props.value).toBe("other");
  expect(field("institution-name").props.placeholder).toBe("e.g. Your credit union's full name");
  expect(field("institution-name").props.value).toBe("");
  expect(exampleLine()).toBeUndefined();
  expect(onChange).not.toHaveBeenCalled();
});

it.each(EXAMPLES)("disables the $city example button with the form", ({ city }) => {
  profile.city = city; disabled = true; render();
  expect(exampleButton().props.disabled).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
  disabled = false; render();
  expect(exampleButton().props.disabled).toBe(false);
});

it("updates the example on city changes while preserving the institution value", () => {
  render(); invoke(exampleButton().props.onClick); render();
  edit("profile-city", "Austin, TX");
  expect(field("institution-name").props.value).toBe("Bellco Credit Union");
  expect(componentText(exampleLine())).toBe("Not sure? Try University Federal Credit Union");
  edit("profile-city", "other");
  expect(field("institution-name").props.value).toBe("Bellco Credit Union");
  expect(exampleLine()).toBeUndefined();
});
