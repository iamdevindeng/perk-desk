// Checks accessible tooltip interactions and independent filter controls without a browser or network.
// Called by: npm test using the offline component harness and invented merchant results
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { MerchantResults } from "@/components/MerchantCard";
import { INFO_TOOLTIP_Z_INDEX, TOP_BAR_Z_INDEX } from "@/lib/config";
import { FAKE_PROFILE, FAKE_RUN_RESULT } from "../fixtures/fake-plan";
import { componentText, findComponents, renderComponents, resetComponents, type TestElement } from "../fixtures/component-harness";
import { invoke } from "../fixtures/page-harness";

const identifiers = vi.hoisted(() => ({ next: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/component-harness");
  return { ...actual, useState: fake.componentState, useRef: fake.componentRef, useEffect: fake.componentEffect,
    useId: () => fake.componentState(() => `fake-tooltip-${++identifiers.next}`)[0] };
});

type Listener = (event: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
const inside = {};
const outside = {};
const addEventListener = vi.fn((name: string, listener: Listener) => {
  const registered = listeners.get(name) ?? new Set<Listener>();
  registered.add(listener); listeners.set(name, registered);
});
const removeEventListener = vi.fn((name: string, listener: Listener) => { listeners.get(name)?.delete(listener); });
const onIndependentsOnlyChange = vi.fn();
const LABEL = "What does Independents only mean?";
const TEXT = "Hides local brands with 2+ locations nearby. National chains are already excluded.";
let tree: TestElement;
let results = false;

function render(): void {
  tree = renderComponents(results ? createElement(MerchantResults, {
    result: FAKE_RUN_RESULT, profile: FAKE_PROFILE, independentsOnly: true,
    onIndependentsOnlyChange, onSelectMerchant: () => {}, onStatusChange: () => {},
  }) : createElement(InfoTooltip, { label: LABEL, text: TEXT }));
  const reference = wrapper().props.ref as { current: unknown };
  reference.current = { contains: (target: unknown) => target === inside };
}
function button(): TestElement { return findComponents(tree, (element) => element.props["aria-label"] === LABEL)[0]; }
function tooltip(): TestElement { return findComponents(tree, (element) => element.props.role === "tooltip")[0]; }
function wrapper(): TestElement { return findComponents(tree, (element) => typeof element.props.onMouseEnter === "function")[0]; }
function event(name: string, value: unknown): void {
  for (const listener of [...(listeners.get(name) ?? [])]) listener(value);
  render();
}
function interact(element: TestElement, handler: string, value?: unknown): void {
  invoke(element.props[handler], value); render();
}

beforeEach(() => {
  resetComponents(); vi.clearAllMocks(); listeners.clear(); identifiers.next = 0; results = false;
  vi.stubGlobal("Node", { [Symbol.hasInstance]: (target: unknown) => target === inside || target === outside });
  vi.stubGlobal("document", { addEventListener, removeEventListener }); render();
});
afterEach(() => { resetComponents(); vi.unstubAllGlobals(); });

it("renders a labeled non-submit icon and a stable description that is hidden by default", () => {
  expect(button().type).toBe("button"); expect(button().props.type).toBe("button");
  expect(button().props["aria-label"]).toBe(LABEL); expect(componentText(button())).toBe("i");
  expect(button().props["aria-describedby"]).toBe(tooltip().props.id);
  expect(tooltip().props.id).toBeTruthy(); expect(componentText(tooltip())).toBe(TEXT);
  expect(tooltip().props.hidden).toBe(true); expect(tooltip().props.tabIndex).toBeUndefined();
  const identifier = tooltip().props.id;
  interact(button(), "onFocus"); interact(button(), "onBlur");
  expect(tooltip().props.id).toBe(identifier); expect(button().props["aria-describedby"]).toBe(identifier);
  expect(button().props.className).toContain("focus-visible:");
  expect(tooltip().props.style).toMatchObject({ zIndex: INFO_TOOLTIP_Z_INDEX });
  expect(INFO_TOOLTIP_Z_INDEX).toBeLessThan(TOP_BAR_Z_INDEX); expect(INFO_TOOLTIP_Z_INDEX).toBeGreaterThan(1000);
});

it("shows on keyboard focus and hides on blur without moving focus into the popup", () => {
  interact(button(), "onFocus"); expect(tooltip().props.hidden).toBe(false);
  interact(button(), "onBlur"); expect(tooltip().props.hidden).toBe(true);
  expect(findComponents(tooltip(), (element) => element.props.tabIndex !== undefined)).toHaveLength(0);
});

it("shows on mouse hover and hides on mouse leave", () => {
  interact(wrapper(), "onMouseEnter"); expect(tooltip().props.hidden).toBe(false);
  interact(wrapper(), "onMouseLeave"); expect(tooltip().props.hidden).toBe(true);
});

it("toggles on repeated clicks", () => {
  interact(button(), "onClick"); expect(tooltip().props.hidden).toBe(false);
  interact(button(), "onClick"); expect(tooltip().props.hidden).toBe(true);
});

it("keeps the first touch click open when pointerdown is followed by focus", () => {
  interact(button(), "onPointerDown"); interact(button(), "onFocus"); interact(button(), "onClick");
  expect(tooltip().props.hidden).toBe(false);
  interact(button(), "onPointerDown"); interact(button(), "onClick");
  expect(tooltip().props.hidden).toBe(true);
});

it("clears a cancelled pointer interaction before the next keyboard click", () => {
  interact(button(), "onPointerDown"); interact(button(), "onFocus"); interact(button(), "onPointerCancel");
  interact(button(), "onClick"); expect(tooltip().props.hidden).toBe(true);
});

it("closes with Escape even when only hovered and ignores other keys", () => {
  interact(wrapper(), "onMouseEnter");
  event("keydown", { key: "Enter" }); expect(tooltip().props.hidden).toBe(false);
  event("keydown", { key: "Escape" }); expect(tooltip().props.hidden).toBe(true);
});

it("ignores inside pointer events and closes on an outside pointer event", () => {
  interact(button(), "onClick");
  event("pointerdown", { target: inside }); expect(tooltip().props.hidden).toBe(false);
  event("pointerdown", { target: outside }); expect(tooltip().props.hidden).toBe(true);
});

it("registers dismissal listeners only while open and removes them on close and unmount", () => {
  expect(addEventListener).not.toHaveBeenCalled();
  interact(button(), "onClick");
  expect(listeners.get("pointerdown")?.size).toBe(1); expect(listeners.get("keydown")?.size).toBe(1);
  interact(button(), "onClick");
  expect(listeners.get("pointerdown")?.size).toBe(0); expect(listeners.get("keydown")?.size).toBe(0);
  interact(button(), "onClick"); resetComponents();
  expect(listeners.get("pointerdown")?.size).toBe(0); expect(listeners.get("keydown")?.size).toBe(0);
  expect(removeEventListener).toHaveBeenCalledTimes(4);
});

it("opens the merchant explanation without changing the Independents only switch", () => {
  results = true; render();
  const switches = () => findComponents(tree, (element) => element.props.role === "switch");
  expect(switches()).toHaveLength(1); expect(switches()[0].props.checked).toBe(true);
  const labels = findComponents(tree, (element) => element.type === "label");
  expect(labels.some((label) => findComponents(label, (element) => element.props["aria-label"] === LABEL).length > 0)).toBe(false);
  interact(button(), "onPointerDown"); interact(button(), "onFocus"); interact(button(), "onClick");
  expect(tooltip().props.hidden).toBe(false); expect(componentText(tooltip())).toBe(TEXT);
  expect(switches()[0].props.checked).toBe(true); expect(onIndependentsOnlyChange).not.toHaveBeenCalled();
  interact(button(), "onPointerDown"); interact(button(), "onClick");
  expect(tooltip().props.hidden).toBe(true); expect(switches()[0].props.checked).toBe(true);
  expect(onIndependentsOnlyChange).not.toHaveBeenCalled();
});
