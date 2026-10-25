// Checks planning requires an address or a complete map point for every branch.
// Called by: npm test; fake hooks and transports keep all page interactions offline
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import Home from "@/app/page";
import { getPresets } from "@/lib/data";
import { saveProfile } from "@/lib/profile-storage";
import type { Branch, Profile } from "@/lib/types";
import { FAKE_BRANCH, FAKE_BRAND, FAKE_PLAN_RESPONSE, FAKE_PROFILE } from "../fixtures/fake-plan";
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
  const { FAKE_PROFILE } = await import("../fixtures/fake-plan");
  return { ...actual, loadProfile: () => structuredClone(FAKE_PROFILE), saveProfile: vi.fn() };
});
vi.mock("@/lib/run-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/run-client")>();
  const fake = await import("../fixtures/page-harness");
  return { ...actual, postPlan: fake.fakePlan, streamRun: fake.fakeRun };
});

const HINT = "Add an address or pick a map location for every branch.";
const BLANK_BRANCH: Branch = { ...FAKE_BRANCH, address: "", lat: undefined, lon: undefined, locationSource: undefined };
function render(): ReturnType<typeof renderPage> { return renderPage(Home); }
function props(type: string): Record<string, unknown> { return elementProps(render(), type); }
function textContent(root: unknown): string {
  if (typeof root === "string") return root;
  if (Array.isArray(root)) return root.map(textContent).join(" ");
  if (!root || typeof root !== "object" || !("props" in root)) return "";
  return textContent((root as ReactElement<Record<string, unknown>>).props.children);
}
function editBranches(branches: Branch[]): void {
  const profile = props("ProfileForm").profile as Profile;
  invoke(props("ProfileForm").onChange, { ...profile, branches });
}

beforeEach(async () => {
  resetPage(); vi.clearAllMocks(); render(); await flushPage();
  invoke(props("TasteInput").onChange, FAKE_BRAND.name);
});
afterEach(unmountPage);

it.each(["", "   ", "\n\t"])("disables planning and shows the location hint for an unlocated address %j", (address) => {
  editBranches([{ ...BLANK_BRANCH, address }]);
  expect(props("Button").disabled).toBe(true);
  expect(textContent(render())).toContain(HINT);
  expect(pageHarness.plans).toHaveLength(0);
});

it("enables planning for an address-only branch and removes the hint", () => {
  editBranches([BLANK_BRANCH]);
  expect(props("Button").disabled).toBe(true);
  editBranches([{ ...BLANK_BRANCH, address: "  1 Example Lane  " }]);
  expect(props("Button").disabled).toBe(false);
  expect(textContent(render())).not.toContain(HINT);
});

it.each([{ lat: 39.75, lon: -104.99 }, { lat: 0, lon: 0 }])("enables planning after a map pick at $lat, $lon", (point) => {
  editBranches([BLANK_BRANCH]);
  expect(props("Button").disabled).toBe(true);
  invoke(props("ProfileForm").onPickBranch, BLANK_BRANCH.id);
  invoke(props("MerchantMap").onPickLocation, point);
  const profile = props("ProfileForm").profile as Profile;
  expect(profile.branches[0]).toMatchObject({ ...point, address: "", locationSource: "map" });
  expect(props("Button").disabled).toBe(false);
  expect(textContent(render())).not.toContain(HINT);
});

it.each([{ lat: 39.75 }, { lon: -104.99 }])("rejects an incomplete map point %j without an address", (point) => {
  editBranches([{ ...BLANK_BRANCH, ...point }]);
  expect(props("Button").disabled).toBe(true);
  expect(textContent(render())).toContain(HINT);
});

it("requires a location on every branch, including one added after located branches", () => {
  const addressBranch = { ...BLANK_BRANCH, id: "fake-address", address: "2 Example Lane" };
  const emptyBranch = { ...BLANK_BRANCH, id: "fake-empty" };
  editBranches([FAKE_BRANCH, addressBranch, emptyBranch]);
  expect(props("Button").disabled).toBe(true);
  expect(textContent(render())).toContain(HINT);
  editBranches([FAKE_BRANCH, addressBranch, { ...emptyBranch, address: "3 Example Lane" }]);
  expect(props("Button").disabled).toBe(false);
  expect(textContent(render())).not.toContain(HINT);
});

it.each(getPresets())("allows $label to start planning", async (preset) => {
  invoke(props("PresetPicker").onSelect, preset);
  expect(props("Button").disabled).toBe(false);
  expect(textContent(render())).not.toContain(HINT);
  invoke(props("Button").onClick);
  expect(pageHarness.plans).toHaveLength(1);
  pageHarness.plans[0].resolve({ ...FAKE_PLAN_RESPONSE, branches: preset.profile.branches });
  await flushPage();
});

it.each(["institution", "brands"])("omits the location hint when only the %s is incomplete", (field) => {
  if (field === "institution") invoke(props("ProfileForm").onChange, { ...FAKE_PROFILE, institutionName: "" });
  else invoke(props("TasteInput").onChange, "");
  expect(props("Button").disabled).toBe(true);
  expect(textContent(render())).not.toContain(HINT);
});

it("allows planning after exact branch search locations replace the blank branch", async () => {
  editBranches([BLANK_BRANCH]); expect(props("Button").disabled).toBe(true);
  const branches: Branch[] = [{ ...FAKE_BRANCH, address: "", locationSource: "qloo_place" }];
  editBranches(branches);
  expect(props("Button").disabled).toBe(false);
  expect(textContent(render())).not.toContain(HINT);
  expect(props("MerchantMap").branches).toEqual(branches);
  invoke(props("Button").onClick);
  expect(pageHarness.plans).toHaveLength(1);
  pageHarness.plans[0].resolve({ ...FAKE_PLAN_RESPONSE, branches }); await flushPage();
});

it("resets branch lookup for every preset selection, including repeated same-city presets", () => {
  const preset = getPresets()[0];
  const original = props("ProfileForm").branchLookupVersion;
  invoke(props("PresetPicker").onSelect, preset);
  const first = props("ProfileForm").branchLookupVersion;
  expect(first).not.toBe(original);
  invoke(props("PresetPicker").onSelect, preset);
  expect(props("ProfileForm").branchLookupVersion).not.toBe(first);
});

it("passes branch previews to the map without saving or changing the real branches", () => {
  const profile = props("ProfileForm").profile;
  vi.mocked(saveProfile).mockClear();
  const candidates = [{ entityId: "00000000-0000-4000-8000-000000000001", name: "Fake CU", address: "1 Example Lane", lat: 39, lon: -104, distanceMeters: 100 }];
  invoke(props("ProfileForm").onPreviewChange, candidates);
  expect(props("MerchantMap").candidates).toEqual(candidates);
  expect(props("ProfileForm").profile).toEqual(profile);
  expect(props("MerchantMap").branches).toEqual(FAKE_PROFILE.branches);
  expect(saveProfile).not.toHaveBeenCalled();
  invoke(props("ProfileForm").onChange, { ...FAKE_PROFILE, institutionName: "Fake Edited CU" });
  expect(saveProfile).toHaveBeenLastCalledWith({ ...FAKE_PROFILE, institutionName: "Fake Edited CU" });
});

it.each(["city", "preset"])("clears preview state on a %s change", (change) => {
  invoke(props("ProfileForm").onPreviewChange, [{ entityId: "00000000-0000-4000-8000-000000000001", name: "Fake CU", address: "", lat: 39, lon: -104, distanceMeters: 100 }]);
  if (change === "city") invoke(props("ProfileForm").onChange, { ...FAKE_PROFILE, city: "Austin, TX" });
  else invoke(props("PresetPicker").onSelect, getPresets()[0]);
  expect(props("MerchantMap").candidates).toEqual([]);
});
