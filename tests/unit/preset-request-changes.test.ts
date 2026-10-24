// Checks live-research warnings compare real request inputs without changing preset cache data.
// Called by: npm test; both presets use hand-written fictional plan responses
import { expect, it } from "vitest";
import { getPresets } from "@/lib/data";
import { buildPlanRequest, buildRunRequest, mergePreferences, presetRequestChanges } from "@/lib/request-builders";
import { ProfileSchema } from "@/lib/types";
import { FAKE_CATEGORY, FAKE_PLAN_RESPONSE, FAKE_PLACE_ID } from "../fixtures/fake-plan";

function presetInput(id = "denver-demo") {
  const preset = getPresets().find((entry) => entry.id === id)!;
  const profile = ProfileSchema.parse({ ...preset.profile,
    branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })),
  });
  const plan = { ...FAKE_PLAN_RESPONSE, branches: profile.branches, categories: [
    FAKE_CATEGORY, { ...FAKE_CATEGORY, tagId: "urn:tag:category:place:bakery", label: "Bakery" },
  ] };
  return { profile, brandsText: preset.brandsText, presetId: id, brandOverrides: {}, plan, canonicalPlan: plan, confirmedCategories: plan.categories };
}

it.each(["denver-demo", "austin-demo"])("keeps untouched %s requests free of live-research warnings", (id) => {
  const input = presetInput(id);
  expect(presetRequestChanges(input)).toEqual({ plan: false, run: false });
  expect(presetRequestChanges({ ...input, plan: undefined, canonicalPlan: undefined, confirmedCategories: undefined }))
    .toEqual({ plan: false, run: false });
});

it("warns only for research when confirmed categories change before preferences are saved", () => {
  const input = presetInput();
  expect(presetRequestChanges({ ...input, confirmedCategories: input.confirmedCategories.slice(0, 1) }))
    .toEqual({ plan: false, run: true });
  expect(presetRequestChanges({ ...input, confirmedCategories: [...input.confirmedCategories,
    { tagId: "urn:tag:category:place:gym", label: "Gym" },
  ] })).toEqual({ plan: false, run: true });
});

it.each(["signed", "not_a_fit"] as const)("warns only for research after the %s status changes exclusions", (status) => {
  const input = presetInput();
  const profile = { ...input.profile, merchantStatus: {
    [FAKE_PLACE_ID]: { name: "Fake Local Shop", status, updatedAt: "2026-10-24" },
  } };
  expect(presetRequestChanges({ ...input, profile })).toEqual({ plan: false, run: true });
});

it.each(["contacted", "to_contact"] as const)("does not warn when the %s status leaves the request unchanged", (status) => {
  const input = presetInput();
  const profile = { ...input.profile, merchantStatus: {
    [FAKE_PLACE_ID]: { name: "Fake Local Shop", status, updatedAt: "2026-10-24" },
  } };
  expect(presetRequestChanges({ ...input, profile })).toEqual({ plan: false, run: false });
});

it("warns for the next Plan after merging preferences while identical confirmed research stays cached", () => {
  const input = presetInput();
  const categoryPreferences = mergePreferences(input.profile.categoryPreferences, input.plan.categories, input.plan.categories.slice(0, 1));
  const profile = { ...input.profile, categoryPreferences };
  expect(presetRequestChanges({ ...input, profile })).toEqual({ plan: true, run: false });
});

it("compares a later changed-preference plan against the retained untouched plan", () => {
  const input = presetInput();
  const categoryPreferences = mergePreferences(input.profile.categoryPreferences, input.plan.categories, input.plan.categories.slice(0, 1));
  const plan = { ...input.plan, categories: [input.plan.categories[0]] };
  expect(presetRequestChanges({ ...input, profile: { ...input.profile, categoryPreferences }, plan, confirmedCategories: plan.categories }))
    .toEqual({ plan: true, run: true });
});

it("does not classify custom or unknown presets as edited cached demos", () => {
  const input = presetInput();
  expect(presetRequestChanges({ ...input, presetId: undefined })).toEqual({ plan: false, run: false });
  expect(presetRequestChanges({ ...input, presetId: "unknown-demo" })).toEqual({ plan: false, run: false });
});

it("does not mutate caller data or alter either serialized request", () => {
  const input = presetInput();
  const before = structuredClone(input);
  const planBefore = buildPlanRequest(input.profile, input.brandsText, input.presetId);
  const runBefore = buildRunRequest(input.profile, input.plan, input.confirmedCategories, {}, input.presetId);
  presetRequestChanges(input);
  expect(input).toEqual(before);
  expect(buildPlanRequest(input.profile, input.brandsText, input.presetId)).toEqual(planBefore);
  expect(buildRunRequest(input.profile, input.plan, input.confirmedCategories, {}, input.presetId)).toEqual(runBefore);
});
