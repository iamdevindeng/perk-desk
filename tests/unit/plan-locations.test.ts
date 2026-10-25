// Checks that planning keeps branch locations within the selected city's area.
// Called by: npm test; locality, brand, model, and cache access stay offline
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPlan } from "@/lib/agent/plan-agent";
import { BRANCH_MAX_CITY_DISTANCE_M } from "@/lib/config";
import { getPresets } from "@/lib/data";
import { resolveLocality } from "@/lib/qloo/insights";
import { searchBrands } from "@/lib/qloo/search";
import { FAKE_BRANCH, FAKE_PLAN_REQUEST } from "../fixtures/fake-plan";

vi.mock("@/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env")>();
  return { ...original, hasDeepSeekKey: () => false, isAgentDisabled: () => true };
});
vi.mock("@/lib/qloo/insights", () => ({ resolveLocality: vi.fn() }));
vi.mock("@/lib/qloo/search", () => ({ searchBrands: vi.fn() }));
vi.mock("@/lib/qloo/tags", () => ({ searchPlaceCategories: vi.fn(async () => []) }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(async () => null), setJson: vi.fn() }));

const FAR_BRANCH = { ...FAKE_BRANCH, id: "fake-far", name: "Fake Far Branch", lat: 30.2672, lon: -97.7431 };
const FAR_WARNING = "Branch Fake Far Branch is more than 50 km from Denver, CO; pick its location on the map.";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveLocality).mockResolvedValue(null);
  vi.mocked(searchBrands).mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network access is forbidden in location tests."); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("branch distance from the selected city", () => {
  it("uses the requested 50 km city limit", () => {
    expect(BRANCH_MAX_CITY_DISTANCE_M).toBe(50000);
  });

  it("drops a far map location, warns, and keeps a near branch", async () => {
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, branches: [FAR_BRANCH, FAKE_BRANCH] });
    expect(result.branches).toEqual([FAKE_BRANCH]);
    expect(result.warnings).toContain(FAR_WARNING);
    expect(resolveLocality).not.toHaveBeenCalled();
  });

  it("uses Qloo-listed branch coordinates directly without resolving their street address", async () => {
    const branch = { ...FAKE_BRANCH, address: "9 Example Lane", locationSource: "qloo_place" as const };
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, branches: [branch] });
    expect(result.branches).toEqual([branch]);
    expect(resolveLocality).not.toHaveBeenCalled();
    expect(result.warnings).not.toContain("No branch locations were resolved; pick a location on the map.");
  });

  it("checks a branch after its address has been located", async () => {
    vi.mocked(resolveLocality).mockResolvedValue({ name: "Fake Far District", lat: FAR_BRANCH.lat, lon: FAR_BRANCH.lon });
    const addressBranch = { ...FAR_BRANCH, lat: undefined, lon: undefined, locationSource: undefined };
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, branches: [FAKE_BRANCH, addressBranch] });
    expect(result.branches).toEqual([FAKE_BRANCH]);
    expect(result.warnings).toContain(FAR_WARNING);
    expect(resolveLocality).toHaveBeenCalledWith(addressBranch.address, expect.any(Object));
  });

  it("keeps the existing empty-plan behavior when every branch is too far", async () => {
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, branches: [FAR_BRANCH] });
    expect(result.branches).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.warnings).toContain(FAR_WARNING);
    expect(result.warnings).toContain("No branch locations were resolved; pick a location on the map.");
    expect(searchBrands).not.toHaveBeenCalled();
  });

  it("skips the distance check when the city point cannot be resolved", async () => {
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, city: "Fake City, CO", branches: [FAKE_BRANCH, FAR_BRANCH] });
    expect(result.city).toBeUndefined();
    expect(result.branches).toEqual([FAKE_BRANCH, FAR_BRANCH]);
    expect(result.warnings.some((warning) => warning.includes("more than 50 km"))).toBe(false);
    expect(resolveLocality).toHaveBeenCalledWith("Fake City, CO", expect.any(Object));
  });

  it("also checks branches against a city point resolved by lookup", async () => {
    vi.mocked(resolveLocality).mockResolvedValue({ name: "Fake City", lat: FAKE_BRANCH.lat, lon: FAKE_BRANCH.lon });
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, city: "Fake City, CO", branches: [FAKE_BRANCH, FAR_BRANCH] });
    expect(result.branches).toEqual([FAKE_BRANCH]);
    expect(result.warnings).toContain("Branch Fake Far Branch is more than 50 km from Fake City, CO; pick its location on the map.");
  });

  it.each(getPresets())("retains every branch in the $id preset", async (preset) => {
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, presetId: preset.id });
    expect(result.branches).toEqual(preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })));
    expect(result.warnings.some((warning) => warning.includes("more than 50 km"))).toBe(false);
    expect(resolveLocality).not.toHaveBeenCalled();
  });
});
