// Checks the complete blank reset, persistence, confirmation, and focus without live transports.
// Called by: npm test; real storage helpers use an in-memory browser-storage substitute
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { getPresets } from "@/lib/data";
import { emptyProfile, loadProfile, saveProfile } from "@/lib/profile-storage";
import type { Profile } from "@/lib/types";
import { FAKE_BRAND, FAKE_PLAN_RESPONSE, FAKE_PROFILE, FAKE_RUN_RESULT } from "../fixtures/fake-plan";
import { elementProps, findElement, flushPage, invoke, pageHarness, renderPage, resetPage, unmountPage } from "../fixtures/page-harness";
import { componentText } from "../fixtures/component-harness";

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
vi.mock("@/lib/run-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/run-client")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, postPlan: fake.fakePlan, streamRun: fake.fakeRun };
});

const values = new Map<string, string>();
const confirm = vi.fn<() => boolean>();
const input = { focus: vi.fn(), scrollIntoView: vi.fn() };
const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
function render(): ReturnType<typeof renderPage> { return renderPage(Home); }
function props(type: string): Record<string, unknown> { return elementProps(render(), type); }
function reset(): void { invoke(props("PresetPicker").onStartBlank); render(); }
async function finishPlan(): Promise<void> {
  invoke(props("Button").onClick);
  pageHarness.plans.at(-1)!.resolve(structuredClone(FAKE_PLAN_RESPONSE)); await flushPage(); render();
}
async function finishRun(): Promise<void> {
  invoke(props("CategoryConfirm").onConfirm);
  const run = pageHarness.runs.at(-1)!;
  run.emit({ type: "result", at: 1, result: FAKE_RUN_RESULT }); run.emit({ type: "done", at: 2 }); run.resolve();
  await flushPage(); render();
}
function addPreview(): void {
  invoke(props("ProfileForm").onPreviewChange, [{ entityId: "00000000-0000-4000-8000-000000000001",
    name: "Fake Preview CU", address: "1 Example Lane", lat: 39, lon: -104, distanceMeters: 100 }]);
}
beforeEach(async () => {
  resetPage(); vi.clearAllMocks(); values.clear(); confirm.mockReturnValue(true);
  vi.stubGlobal("window", { confirm, matchMedia: () => ({ matches: false }), localStorage: {
    getItem: (key: string) => values.get(key) ?? null, setItem,
  } });
  vi.stubGlobal("document", { getElementById: vi.fn((id: string) => id === "institution-name" ? input : null) });
  saveProfile({ ...FAKE_PROFILE, signedMerchantsText: "Fake Signed Shop", businessMembersText: "Fake Member Shop",
    branchesByCity: { "Austin, TX": FAKE_PROFILE.branches }, merchantStatus: {
      "00000000-0000-4000-8000-000000000002": { name: "Fake Corner Cafe", status: "contacted", updatedAt: "2026-10-25" },
    } });
  render(); await flushPage(); render(); invoke(props("TasteInput").onChange, FAKE_BRAND.name);
});
afterEach(() => { unmountPage(); vi.unstubAllGlobals(); });

it("leaves the profile, brands, plan, results, preview, selections, keys, and storage unchanged after cancel", async () => {
  await finishPlan(); await finishRun(); addPreview();
  invoke(props("ProfileForm").onPickBranch, FAKE_PROFILE.branches[0].id);
  invoke(props("MerchantResults").onSelectMerchant, FAKE_RUN_RESULT.merchants[0].place.entityId);
  invoke(props("MerchantResults").onIndependentsOnlyChange, true);
  const before = render(); const stored = [...values]; const writes = setItem.mock.calls.length;
  confirm.mockReturnValue(false); reset();
  const after = render();
  for (const type of ["ProfileForm", "TasteInput", "CategoryConfirm", "MerchantResults", "MerchantMap"]) {
    const previous = elementProps(before, type); const current = elementProps(after, type);
    for (const field of Object.keys(previous).filter((key) => typeof previous[key] !== "function")) expect(current[field]).toEqual(previous[field]);
    expect(findElement(after, type)?.key).toBe(findElement(before, type)?.key);
  }
  expect([...values]).toEqual(stored); expect(setItem).toHaveBeenCalledTimes(writes);
  expect(input.focus).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledExactlyOnceWith("Start blank? This clears your profile, branches, member brands and results in this browser.");
});

it("saves a blank profile, clears all page state, remounts forms, and focuses the name after acceptance", async () => {
  await finishPlan(); await finishRun(); addPreview();
  invoke(props("ProfileForm").onPickBranch, FAKE_PROFILE.branches[0].id);
  invoke(props("MerchantResults").onSelectMerchant, FAKE_RUN_RESULT.merchants[0].place.entityId);
  invoke(props("MerchantResults").onIndependentsOnlyChange, true);
  const before = render(); values.set("unrelated-browser-key", "keep"); reset();
  expect(props("ProfileForm").profile).toEqual(emptyProfile()); expect(loadProfile()).toEqual(emptyProfile());
  expect(props("TasteInput").value).toBe(""); expect(props("MerchantMap").candidates).toEqual([]);
  expect(props("MerchantMap").merchants).toEqual([]); expect(props("MerchantMap").selectedMerchantId).toBeUndefined();
  expect(props("ProfileForm").pickingBranchId).toBeUndefined(); expect(props("MerchantMap").onPickLocation).toBeUndefined();
  for (const type of ["CategoryConfirm", "AgentTrace", "MerchantResults"]) expect(findElement(render(), type)).toBeUndefined();
  for (const type of ["ProfileForm", "TasteInput"]) expect(findElement(render(), type)?.key).not.toBe(findElement(before, type)?.key);
  expect(props("ProfileForm").branchLookupVersion).not.toBe(elementProps(before, "ProfileForm").branchLookupVersion);
  expect(props("Button").children).toBe("Plan merchant categories"); expect(props("Button").disabled).toBe(true);
  expect(input.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "smooth", block: "start" });
  expect(input.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  expect(values.get("unrelated-browser-key")).toBe("keep");
  expect(setItem.mock.calls.every(([key]) => key === "perkdesk:v1:profile")).toBe(true);
  invoke(props("ProfileForm").onChange, FAKE_PROFILE); invoke(props("TasteInput").onChange, FAKE_BRAND.name);
  await finishPlan(); await finishRun();
  expect(props("MerchantResults").independentsOnly).toBe(false); expect(props("MerchantResults").selectedMerchantId).toBeUndefined();
});

it("clears failed research errors and trace events", async () => {
  await finishPlan(); invoke(props("CategoryConfirm").onConfirm);
  pageHarness.runs[0].reject(new Error("Fake research failed")); await flushPage(); render();
  expect(componentText(render())).toContain("Fake research failed"); expect(findElement(render(), "AgentTrace")).toBeDefined();
  reset(); expect(componentText(render())).not.toContain("Fake research failed");
  expect(findElement(render(), "AgentTrace")).toBeUndefined(); expect(findElement(render(), "CategoryConfirm")).toBeUndefined();
});

it("resets an already blank profile without confirm, including a different branch id", () => {
  reset(); confirm.mockClear();
  const blank = emptyProfile(); blank.branches[0].id = "fake-another-blank-id";
  invoke(props("ProfileForm").onChange, blank); reset();
  expect(confirm).not.toHaveBeenCalled(); expect(loadProfile()).toEqual(emptyProfile());
});

it("still asks when member brand text alone differs from blank", () => {
  reset(); confirm.mockClear(); invoke(props("TasteInput").onChange, " "); reset();
  expect(confirm).toHaveBeenCalledOnce();
});

it.each(["not ready", "planning", "running"])("disables Start blank while %s", async (state) => {
  if (state === "not ready") { resetPage(); render(); }
  else if (state === "planning") invoke(props("Button").onClick);
  else { await finishPlan(); invoke(props("CategoryConfirm").onConfirm); }
  expect(props("PresetPicker").disabled).toBe(true);
  const profile = props("ProfileForm").profile as Profile;
  confirm.mockClear(); reset();
  expect(confirm).not.toHaveBeenCalled(); expect(props("ProfileForm").profile).toEqual(profile);
  await flushPage();
});

it("clears demo identity so later ordinary inputs are not treated as an edited demo", () => {
  invoke(props("PresetPicker").onSelect, getPresets()[0]); reset();
  expect(componentText(render())).not.toContain("Changes run live research and count toward today's limit.");
});
