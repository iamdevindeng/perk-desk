// Checks planning feedback, elapsed time, and cleanup across actual page stage transitions.
// Called by: npm test using fake timers, invented responses, and offline page transports
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { FAKE_PLAN_RESPONSE, FAKE_PROFILE } from "../fixtures/fake-plan";
import { componentText, findComponents, renderComponents, resetComponents, type TestElement } from "../fixtures/component-harness";
import { flushPage, invoke, pageHarness, resetPage } from "../fixtures/page-harness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/component-harness");
  return { ...actual, useState: fake.componentState, useRef: fake.componentRef,
    useEffect: fake.componentEffect, useMemo: (calculate: () => unknown) => calculate() };
});
vi.mock("next/dynamic", () => ({ default: () => "MerchantMap" }));
vi.mock("@/components/PresetPicker", () => ({ default: "PresetPicker" }));
vi.mock("@/components/ProfileForm", () => ({ default: "ProfileForm" }));
vi.mock("@/components/TasteInput", () => ({ default: "TasteInput" }));
vi.mock("@/components/CategoryConfirm", () => ({ default: "CategoryConfirm" }));
vi.mock("@/components/AgentTrace", () => ({ default: "AgentTrace" }));
vi.mock("@/components/MerchantCard", () => ({ MerchantResults: "MerchantResults" }));
vi.mock("@/lib/profile-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profile-storage")>();
  const { FAKE_PROFILE } = await import("../fixtures/fake-plan");
  return { ...actual, loadProfile: () => structuredClone(FAKE_PROFILE), saveProfile: vi.fn() };
});
vi.mock("@/lib/run-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/run-client")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, postPlan: fake.fakePlan, streamRun: fake.fakeRun };
});
let tree: TestElement;
function render(): void { tree = renderComponents(createElement(Home)); }
function find(predicate: (element: TestElement) => boolean): TestElement { return findComponents(tree, predicate)[0]; }
function button(): TestElement { return find((element) => element.props.id === "plan-categories-button"); }
function status(): TestElement {
  return find((element) => element.props.role === "status" && componentText(element).startsWith("Resolving brands"));
}
function seconds(): TestElement { return findComponents(status(), (element) => /^\d+s$/.test(componentText(element)))[0]; }
function start(): void { invoke(button().props.onClick); render(); }
beforeEach(async () => {
  resetComponents(); resetPage(); vi.clearAllMocks(); vi.useFakeTimers();
  render(); await flushPage(); render();
  invoke(find((element) => element.type === "TasteInput").props.onChange, "Fake Coffee Co"); render();
});
afterEach(() => { resetComponents(); resetPage(); vi.useRealTimers(); });

it("shows 0s then 3s with matching hidden spinners and a silent seconds span", () => {
  expect(vi.getTimerCount()).toBe(0); start();
  expect(componentText(status())).toBe("Resolving brands and finding supported categories… 0s");
  expect(status().props["aria-hidden"]).toBe(false);
  expect(status().props.className).toContain("text-sm text-teal-800");
  const spinner = findComponents(button(), (element) => String(element.props.className).includes("animate-spin"))[0];
  expect(spinner.props["aria-hidden"]).toBe("true"); expect(componentText(button())).toBe("Planning…");
  const statusSpinner = findComponents(status(), (element) => String(element.props.className).includes("animate-spin"))[0];
  expect(statusSpinner.props.className).toBe(spinner.props.className);
  expect(statusSpinner.props["aria-hidden"]).toBe("true");
  expect(seconds().props["aria-hidden"]).toBe("true");
  vi.advanceTimersByTime(3000); render();
  expect(componentText(status())).toBe("Resolving brands and finding supported categories… 3s");
});

it.each(["success", "failure", "cancel"])("clears and resets the timer after %s", async (ending) => {
  start(); vi.advanceTimersByTime(3000); render();
  if (ending === "success") pageHarness.plans[0].resolve(structuredClone(FAKE_PLAN_RESPONSE));
  else if (ending === "failure") pageHarness.plans[0].reject(new Error("Fake planning failure"));
  else invoke(find((element) => element.type === "ProfileForm").props.onChange, { ...FAKE_PROFILE, institutionName: "Fake Changed CU" });
  await flushPage(); render();
  expect(vi.getTimerCount()).toBe(0);
  expect(status().props["aria-hidden"]).toBe(true); expect(status().props.className).toContain("invisible");
  expect(componentText(seconds())).toBe("0s");
  expect(findComponents(button(), (element) => String(element.props.className).includes("animate-spin"))).toHaveLength(0);
  vi.advanceTimersByTime(5000); start();
  expect(componentText(seconds())).toBe("0s"); expect(vi.getTimerCount()).toBe(1);
});

it("reserves the wrapped status content while idle without a timer", () => {
  expect(status().props.className).toContain("invisible");
  expect(status().props["aria-hidden"]).toBe(true);
  const reservedText = componentText(status());
  start(); expect(componentText(status())).toBe(reservedText);
});

it("cleans up immediately after an instant replay before the first tick", async () => {
  start(); expect(componentText(seconds())).toBe("0s");
  pageHarness.plans[0].resolve(structuredClone(FAKE_PLAN_RESPONSE)); await flushPage(); render();
  expect(vi.getTimerCount()).toBe(0); vi.advanceTimersByTime(3000); render();
  expect(status().props["aria-hidden"]).toBe(true); expect(componentText(seconds())).toBe("0s");
});

it("clears the timer when the page unmounts during planning", () => {
  start(); expect(vi.getTimerCount()).toBe(1);
  resetComponents(); expect(vi.getTimerCount()).toBe(0);
});
