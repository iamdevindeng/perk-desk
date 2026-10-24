// Exercises map locking and late plan/run success, failure, and unmount races against the real page.
// Called by: npm test; fake React hooks and deferred transports keep every scenario offline
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, RunResult } from "@/lib/types";
import Home from "@/app/page";
import { saveProfile } from "@/lib/profile-storage";
import { toCsv } from "@/lib/csv";
import { FAKE_BRAND, FAKE_PLAN_RESPONSE, FAKE_PROFILE, FAKE_RUN_RESULT } from "../fixtures/fake-plan";
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
vi.mock("@/lib/run-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/run-client")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, postPlan: fake.fakePlan, streamRun: fake.fakeRun };
});

function render(): ReturnType<typeof renderPage> { return renderPage(Home); }
function props(type: string): Record<string, unknown> { return elementProps(render(), type); }
async function confirmPlan(): Promise<void> {
  invoke(props("Button").onClick);
  pageHarness.plans.at(-1)!.resolve(structuredClone(FAKE_PLAN_RESPONSE));
  await flushPage();
}
function editProfile(): void {
  invoke(props("ProfileForm").onChange, { ...FAKE_PROFILE, institutionName: "Fake newer CU" });
}
function finishRun(index: number): void {
  pageHarness.runs[index].emit({ type: "result", at: 1, result: FAKE_RUN_RESULT });
  pageHarness.runs[index].emit({ type: "done", at: 2 });
  pageHarness.runs[index].resolve();
}

beforeEach(async () => {
  resetPage(); vi.clearAllMocks(); render(); await flushPage();
  invoke(props("TasteInput").onChange, FAKE_BRAND.name);
});
afterEach(unmountPage);

describe("map picking during research", () => {
  it.each(["confirm", "retry"])("clears the pending pick and blocks even a captured map handler on %s", async (action) => {
    await confirmPlan();
    if (action === "retry") {
      invoke(props("CategoryConfirm").onConfirm);
      pageHarness.runs[0].reject(new Error("Fake temporary failure")); await flushPage();
    }
    invoke(props("ProfileForm").onPickBranch, FAKE_PROFILE.branches[0].id);
    const oldPick = props("MerchantMap").onPickLocation;
    expect(typeof oldPick).toBe("function");
    invoke(action === "confirm" ? props("CategoryConfirm").onConfirm : props("AgentTrace").onRetry);
    invoke(oldPick, { lat: 40.5, lon: -105.5 });
    expect(props("ProfileForm").disabled).toBe(true);
    expect(props("ProfileForm").pickingBranchId).toBeUndefined();
    expect(props("MerchantMap").onPickLocation).toBeUndefined();
    expect((props("ProfileForm").profile as Profile).branches[0].lat).toBe(39.75);
    finishRun(pageHarness.runs.length - 1); await flushPage();
    expect(props("MerchantResults").result).toBe(FAKE_RUN_RESULT);
    expect(props("MerchantMap").onPickLocation).toBeUndefined();
  });
});

describe("invalidated requests", () => {
  it.each(["success", "failure"])("ignores late plan %s after an edit and a new plan", async (outcome) => {
    invoke(props("Button").onClick); const old = pageHarness.plans[0];
    editProfile(); invoke(props("Button").onClick);
    const writes = vi.mocked(saveProfile).mock.calls.length; const changes = pageHarness.changes;
    if (outcome === "success") old.resolve(FAKE_PLAN_RESPONSE); else old.reject(new Error("Stale plan failure"));
    await flushPage();
    expect(props("ProfileForm").disabled).toBe(true);
    expect(findElement(render(), "CategoryConfirm")).toBeUndefined();
    expect(pageHarness.changes).toBe(changes);
    expect(saveProfile).toHaveBeenCalledTimes(writes);
    pageHarness.plans[1].resolve(FAKE_PLAN_RESPONSE); await flushPage();
    expect((props("ProfileForm").profile as Profile).institutionName).toBe("Fake newer CU");
    expect(findElement(render(), "CategoryConfirm")).toBeDefined();
  });

  it.each(["success", "failure"])("ignores stale stream events and %s while a newer run stays active", async (outcome) => {
    await confirmPlan(); invoke(props("CategoryConfirm").onConfirm);
    const old = pageHarness.runs[0]; editProfile(); await confirmPlan();
    invoke(props("CategoryConfirm").onConfirm);
    const changes = pageHarness.changes;
    old.emit({ type: "result", at: 1, result: FAKE_RUN_RESULT });
    old.emit({ type: "error", at: 2, code: "upstream", message: "Stale error" });
    if (outcome === "success") old.resolve(); else old.reject(new Error("Stale run failure"));
    await flushPage();
    expect(pageHarness.changes).toBe(changes);
    expect(props("ProfileForm").disabled).toBe(true);
    expect(findElement(render(), "MerchantResults")).toBeUndefined();
    finishRun(1); await flushPage();
    expect(props("MerchantResults").result).toBe(FAKE_RUN_RESULT);
    expect((props("MerchantResults").profile as Profile).institutionName).toBe("Fake newer CU");
  });

  it.each(["plan", "run"])("ignores %s completion after unmount", async (operation) => {
    if (operation === "run") { await confirmPlan(); invoke(props("CategoryConfirm").onConfirm); }
    else invoke(props("Button").onClick);
    unmountPage(); const changes = pageHarness.changes;
    if (operation === "run") finishRun(0); else pageHarness.plans[0].resolve(FAKE_PLAN_RESPONSE);
    await flushPage(); expect(pageHarness.changes).toBe(changes);
  });
});

it("uses one deduplicated result for merchant cards, map markers, and the exported list", async () => {
  await confirmPlan(); invoke(props("CategoryConfirm").onConfirm);
  const first = FAKE_RUN_RESULT.merchants[0];
  const duplicate = { ...first, branchId: "fake-other", categoryTagId: "urn:tag:category:place:bakery",
    place: { ...first.place, entityId: "00000000-0000-4000-8000-000000000009", name: "The Fake Corner Cafe LLC" } };
  const different = { ...first, place: { ...first.place, entityId: "00000000-0000-4000-8000-000000000010", name: "Fake Bookshop" } };
  const replayed = { ...FAKE_RUN_RESULT, merchants: [first, duplicate, different] };
  pageHarness.runs[0].emit({ type: "result", at: 1, result: replayed });
  pageHarness.runs[0].emit({ type: "done", at: 2 }); pageHarness.runs[0].resolve(); await flushPage();
  const displayed = props("MerchantResults").result as RunResult;
  expect(props("MerchantResults").brands).toEqual(FAKE_PLAN_RESPONSE.brands);
  expect(displayed.merchants).toEqual([first, different]);
  expect(props("MerchantMap").merchants).toEqual(displayed.merchants);
  expect(toCsv(displayed.merchants, FAKE_PROFILE.merchantStatus).trim().split("\r\n")).toHaveLength(3);
  expect(replayed.merchants).toHaveLength(3);
});
