// Exercises committed page transitions and heading focus without a browser or live transport.
// Called by: npm test; real page hooks and component headings use the offline page harness
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import Home from "@/app/page";
import { FAKE_PLAN_RESPONSE, FAKE_PRESET, FAKE_PROFILE, FAKE_RUN_RESULT } from "../fixtures/fake-plan";
import { elementProps, findElement, flushPage, invoke, pageHarness, renderPage, resetPage, unmountPage } from "../fixtures/page-harness";

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
vi.mock("@/lib/profile-storage", async () => {
  const { FAKE_PROFILE } = await import("../fixtures/fake-plan");
  return { loadProfile: () => structuredClone(FAKE_PROFILE), saveProfile: vi.fn() };
});
vi.mock("@/lib/run-client", async () => {
  const fake = await import("../fixtures/page-harness");
  return { postPlan: fake.fakePlan, streamRun: fake.fakeRun };
});

type TestElement = ReactElement<Record<string, unknown>>;
let currentTree: TestElement;
let focusedId = "";
let reducedMotion = false;
const targets = new Map<string, { component: string; tree: ReactElement }>();
const nodes = new Map<string, ReturnType<typeof makeNode>>();

function makeNode(id: string) {
  return { scrollIntoView: vi.fn(), focus: vi.fn(() => { focusedId = id; }) };
}

function findId(root: unknown, id: string): TestElement | undefined {
  if (Array.isArray(root)) {
    for (const child of root) { const found = findId(child, id); if (found) return found; }
    return;
  }
  if (!root || typeof root !== "object" || !("props" in root)) return;
  const element = root as TestElement;
  return element.props.id === id ? element : findId(element.props.children, id);
}

function visibleNode(id: string): ReturnType<typeof makeNode> | null {
  const target = targets.get(id);
  const element = ["plan-categories-button", "merchant-map-card"].includes(id) ? findId(currentTree, id)
    : target && findElement(currentTree, target.component) ? findId(target.tree, id) : undefined;
  if (!element) return null;
  if (id !== "plan-categories-button") expect(element.props.tabIndex).toBe(-1);
  const node = nodes.get(id) ?? makeNode(id);
  nodes.set(id, node);
  return node;
}

function render(): TestElement {
  return renderPage(() => { currentTree = Home() as TestElement; return currentTree; });
}
function props(type: string): Record<string, unknown> { return elementProps(render(), type); }
function clearNavigation(): void {
  for (const node of nodes.values()) { node.scrollIntoView.mockClear(); node.focus.mockClear(); }
  focusedId = "";
}
function expectNavigation(id: string): void {
  render(); render();
  expect(focusedId).toBe(id);
  expect(nodes.get(id)?.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  expect(nodes.get(id)?.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  for (const [otherId, node] of nodes) if (otherId !== id) expect(node.scrollIntoView).not.toHaveBeenCalled();
  clearNavigation();
}

async function loadTargets(): Promise<void> {
  const [categories, trace, merchants] = await Promise.all([
    vi.importActual<typeof import("@/components/CategoryConfirm")>("@/components/CategoryConfirm"),
    vi.importActual<typeof import("@/components/AgentTrace")>("@/components/AgentTrace"),
    vi.importActual<typeof import("@/components/MerchantCard")>("@/components/MerchantCard"),
  ]);
  targets.set("category-confirm-heading", { component: "CategoryConfirm", tree: categories.default({
    plan: FAKE_PLAN_RESPONSE, confirmedCategories: FAKE_PLAN_RESPONSE.categories, brandOverrides: {},
    onChange: vi.fn(), onBrandOverride: vi.fn(), onReplan: vi.fn(), onConfirm: vi.fn(),
  }) });
  targets.set("research-progress-heading", { component: "AgentTrace", tree: trace.default({ events: [], onRetry: vi.fn() }) });
  targets.set("merchant-results-heading", { component: "MerchantResults", tree: merchants.MerchantResults({
    result: FAKE_RUN_RESULT, profile: FAKE_PROFILE, independentsOnly: false,
    onIndependentsOnlyChange: vi.fn(), onSelectMerchant: vi.fn(), onStatusChange: vi.fn(),
  }) });
}

beforeEach(async () => {
  resetPage(); vi.clearAllMocks(); targets.clear(); nodes.clear(); focusedId = ""; reducedMotion = false;
  vi.stubGlobal("document", { getElementById: vi.fn(visibleNode) });
  vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: reducedMotion })) });
  await loadTargets(); render(); await flushPage(); render();
});
afterEach(() => { unmountPage(); vi.unstubAllGlobals(); });

it.each([false, true])("moves once through each rendered step with reduced motion=%s", async (reduced) => {
  reducedMotion = reduced;
  invoke(props("PresetPicker").onSelect, FAKE_PRESET);
  expect(focusedId).toBe("");
  expectNavigation("plan-categories-button");
  invoke(props("Button").onClick);
  pageHarness.plans[0].resolve(structuredClone(FAKE_PLAN_RESPONSE));
  await flushPage();
  expect(focusedId).toBe("");
  expectNavigation("category-confirm-heading");
  invoke(props("CategoryConfirm").onConfirm);
  expect(focusedId).toBe("");
  expectNavigation("research-progress-heading");
  expect(props("AgentTrace").events).toEqual([]);
  pageHarness.runs[0].emit({ type: "result", at: 1, result: FAKE_RUN_RESULT });
  expect(focusedId).toBe("");
  expectNavigation("merchant-results-heading");
  pageHarness.runs[0].emit({ type: "done", at: 2 }); pageHarness.runs[0].resolve();
  await flushPage(); render();
  expect(focusedId).toBe("");
  expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
});

it("cancels a queued successful-plan navigation when the profile changes before render", async () => {
  invoke(props("PresetPicker").onSelect, FAKE_PRESET); expectNavigation("plan-categories-button");
  invoke(props("Button").onClick);
  const edit = props("ProfileForm").onChange;
  pageHarness.plans[0].resolve(structuredClone(FAKE_PLAN_RESPONSE)); await flushPage();
  invoke(edit, { ...FAKE_PROFILE, institutionName: "Fake Updated CU" });
  render(); render();
  expect(findElement(currentTree, "CategoryConfirm")).toBeUndefined();
  expect(document.getElementById).not.toHaveBeenCalledWith("category-confirm-heading");
  expect(focusedId).toBe("");
});

it("jumps to the stable map wrapper before the dynamic map has loaded", () => {
  const tree = targets.get("merchant-results-heading")!.tree;
  const link = findElement(tree, "a")!;
  expect(link.props.href).toBe("#merchant-map-card");
  expect(link.props.className).toContain("lg:hidden");
  expect(link.props.children).toBe("View map");
  expect(findId(currentTree, "merchant-map-heading")).toBeUndefined();
  const wrapper = findId(currentTree, "merchant-map-card")!;
  expect(wrapper.type).toBe("aside");
  expect(wrapper.props.tabIndex).toBe(-1);
  expect(wrapper.props["aria-label"]).toBe("Your local area map");
  const preventDefault = vi.fn();
  invoke(link.props.onClick, { preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expectNavigation("merchant-map-card");
});
