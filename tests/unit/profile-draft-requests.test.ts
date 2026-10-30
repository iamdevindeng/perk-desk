// Checks browser-only branch markers and incomplete drafts stay outside validated API requests.
// Called by: npm test; in-memory storage and invented plan data keep these boundaries offline
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getPresets } from "@/lib/data";
import { cacheKey } from "@/lib/hash";
import { loadProfile, saveProfile } from "@/lib/profile-storage";
import { buildPlanRequest, buildRunRequest, presetRequestChanges } from "@/lib/request-builders";
import { ProfileSchema, type Profile } from "@/lib/types";
import { FAKE_BRAND, FAKE_BRANCH, FAKE_CATEGORY, FAKE_PLAN_RESPONSE, FAKE_PROFILE } from "../fixtures/fake-plan";

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
});
afterEach(() => { vi.unstubAllGlobals(); });

it.each([true, false])("strips isPlaceholder=%s from plan/run requests without changing their cache keys", (isPlaceholder) => {
  const profile: Profile = { ...FAKE_PROFILE, branches: [{ ...FAKE_BRANCH, isPlaceholder }], branchesByCity: {
    "Austin, TX": [{ ...FAKE_BRANCH, name: "", isPlaceholder: false }],
  } };
  saveProfile(profile);
  const loaded = loadProfile()!;
  expect(loaded).toEqual(profile);
  const original = structuredClone(loaded);
  const plan = buildPlanRequest(loaded, FAKE_BRAND.name);
  const baselinePlan = buildPlanRequest(FAKE_PROFILE, FAKE_BRAND.name);
  const run = buildRunRequest(loaded, FAKE_PLAN_RESPONSE, [FAKE_CATEGORY]);
  const baselineRun = buildRunRequest(FAKE_PROFILE, FAKE_PLAN_RESPONSE, [FAKE_CATEGORY]);
  expect(plan).toEqual(baselinePlan);
  expect(run).toEqual(baselineRun);
  expect(plan.branches[0]).not.toHaveProperty("isPlaceholder");
  expect(run.branches[0]).not.toHaveProperty("isPlaceholder");
  expect(plan).not.toHaveProperty("branchesByCity");
  expect(run).not.toHaveProperty("branchesByCity");
  expect(cacheKey("plan", plan)).toBe(cacheKey("plan", baselinePlan));
  expect(cacheKey("run", run)).toBe(cacheKey("run", baselineRun));
  expect(loaded).toEqual(original);
});

const INCOMPLETE_FIELDS: { label: string; fields: Partial<Profile> }[] = [
  { label: "institution", fields: { institutionName: "" } },
  { label: "city", fields: { city: "" } },
  { label: "branch name", fields: { branches: [{ ...FAKE_BRANCH, name: "", isPlaceholder: false }] } },
];
it.each(INCOMPLETE_FIELDS)("persists an empty $label but still rejects its planning request", ({ fields }) => {
  const profile = { ...FAKE_PROFILE, ...fields };
  saveProfile(profile);
  const loaded = loadProfile()!;
  expect(loaded).toEqual(profile);
  expect(() => buildPlanRequest(loaded, FAKE_BRAND.name)).toThrow();
});

it.each(getPresets())("does not classify browser branch markers as edits to $label", (preset) => {
  const baseline = ProfileSchema.parse({ ...preset.profile,
    branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })),
  });
  const profile: Profile = { ...baseline,
    branches: baseline.branches.map((branch) => ({ ...branch, isPlaceholder: false })),
    branchesByCity: { "Fake City, CO": [{ ...FAKE_BRANCH, name: "", isPlaceholder: true }] },
  };
  saveProfile(profile);
  const loaded = loadProfile()!;
  expect(loaded).toEqual(profile);
  const plan = { ...FAKE_PLAN_RESPONSE, branches: baseline.branches };
  expect(presetRequestChanges({ profile: loaded, brandsText: preset.brandsText, presetId: preset.id,
    plan, canonicalPlan: plan, confirmedCategories: plan.categories,
  })).toEqual({ plan: false, run: false });
});
