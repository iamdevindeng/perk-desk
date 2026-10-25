// Exercises edited-preset warnings through real page transitions and the confirmation component.
// Called by: npm test; all plans and research responses are fictional and offline
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import Home from "@/app/page";
import { getPresets } from "@/lib/data";
import type { PlanResponse, Profile } from "@/lib/types";
import { FAKE_CATEGORY, FAKE_PLAN_RESPONSE, FAKE_RUN_RESULT } from "../fixtures/fake-plan";
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
  return { ...actual, loadProfile: () => null, saveProfile: vi.fn() };
});
vi.mock("@/lib/run-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/run-client")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, postPlan: fake.fakePlan, streamRun: fake.fakeRun };
});

const NOTICE = "Changes run live research and count toward today's limit.";
let confirmModule: typeof import("@/components/CategoryConfirm");
function render(): ReturnType<typeof renderPage> { return renderPage(Home); }
function props(type: string): Record<string, unknown> { return elementProps(render(), type); }
function textContent(root: unknown): string {
  if (typeof root === "string") return root;
  if (Array.isArray(root)) return root.map(textContent).join(" ");
  if (!root || typeof root !== "object" || !("props" in root)) return "";
  return textContent((root as ReactElement<Record<string, unknown>>).props.children);
}

async function completePlan(categories = [FAKE_CATEGORY]): Promise<PlanResponse> {
  const profile = props("ProfileForm").profile as Profile;
  invoke(props("Button").onClick);
  const plan = { ...FAKE_PLAN_RESPONSE, branches: profile.branches, categories };
  pageHarness.plans.at(-1)!.resolve(plan); await flushPage();
  return plan;
}

async function completeRun(): Promise<void> {
  invoke(props("CategoryConfirm").onConfirm);
  const run = pageHarness.runs.at(-1)!;
  run.emit({ type: "result", at: 1, result: FAKE_RUN_RESULT }); run.emit({ type: "done", at: 2 }); run.resolve();
  await flushPage();
}

function confirmText(): string {
  return textContent(confirmModule.default(props("CategoryConfirm") as Parameters<typeof confirmModule.default>[0]));
}

beforeEach(async () => {
  resetPage(); vi.clearAllMocks();
  confirmModule = await vi.importActual<typeof import("@/components/CategoryConfirm")>("@/components/CategoryConfirm");
  render(); await flushPage(); invoke(props("PresetPicker").onSelect, getPresets()[0]);
});
afterEach(unmountPage);

it("shows a confirmation notice only after changing the preset categories", async () => {
  const plan = await completePlan([FAKE_CATEGORY, { ...FAKE_CATEGORY, tagId: "urn:tag:category:place:bakery", label: "Bakery" }]);
  expect(props("CategoryConfirm").liveResearchChanges).toBe(false);
  expect(confirmText()).not.toContain(NOTICE);
  expect(textContent(render())).not.toContain(NOTICE);
  invoke(props("CategoryConfirm").onChange, plan.categories.slice(0, 1));
  expect(props("CategoryConfirm").liveResearchChanges).toBe(true);
  expect(confirmText().split(NOTICE)).toHaveLength(2);
  expect(textContent(render())).not.toContain(NOTICE);
  invoke(props("CategoryConfirm").onChange, plan.categories);
  expect(confirmText()).not.toContain(NOTICE);
});

it("warns for another research run after a status exclusion without warning for Plan", async () => {
  await completePlan(); await completeRun();
  invoke(props("MerchantResults").onStatusChange, FAKE_RUN_RESULT.merchants[0], "signed");
  expect(props("CategoryConfirm").liveResearchChanges).toBe(true);
  expect(confirmText()).toContain(NOTICE);
  expect(textContent(render())).not.toContain(NOTICE);
});

it("warns for a second Plan after saved preferences change and retains the original research baseline", async () => {
  const categories = ["coffee_shop", "bakery", "gym", "restaurant", "bookstore", "pet_store"].map((slug) => ({
    ...FAKE_CATEGORY, tagId: `urn:tag:category:place:${slug}`, label: slug,
  }));
  await completePlan(categories); await completeRun();
  expect(textContent(render())).toContain(NOTICE);
  expect(props("CategoryConfirm").liveResearchChanges).toBe(false);
  expect(confirmText()).not.toContain(NOTICE);
  await completePlan(categories.slice(0, 2));
  expect(props("CategoryConfirm").liveResearchChanges).toBe(true);
  expect(confirmText()).toContain(NOTICE);
});

it("refreshes the untouched baseline when a healthy retry replaces an earlier partial plan", async () => {
  const profile = props("ProfileForm").profile as Profile;
  invoke(props("Button").onClick);
  pageHarness.plans.at(-1)!.resolve({ ...FAKE_PLAN_RESPONSE, branches: profile.branches, mode: "fallback",
    categories: [FAKE_CATEGORY], warnings: ["Research stopped early; available categories were kept."],
  });
  await flushPage();
  expect(props("CategoryConfirm").liveResearchChanges).toBe(false);
  await completePlan([FAKE_CATEGORY, { ...FAKE_CATEGORY, tagId: "urn:tag:category:place:bakery", label: "Bakery" }]);
  expect(props("CategoryConfirm").liveResearchChanges).toBe(false);
  expect(confirmText()).not.toContain(NOTICE);
  expect(textContent(render())).not.toContain(NOTICE);
});
