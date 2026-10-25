// Checks pasted lists and API requests preserve current edits while rejecting stale choices.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { buildPlanRequest, buildRunRequest, parseListText } from "@/lib/request-builders";
import { getPresets } from "@/lib/data";
import { cacheKey, canonicalJson, sha256Hex } from "@/lib/hash";
import { ProfileSchema, RunRequestSchema } from "@/lib/types";
import { FAKE_BRAND, FAKE_BRAND_ID, FAKE_CATEGORY_ID, FAKE_PLAN_RESPONSE, FAKE_PROFILE } from "../fixtures/fake-plan";

const CATEGORIES = [{ tagId: FAKE_CATEGORY_ID, label: "Coffee shop" }];

it("preserves Qloo branch addresses and coordinates in the existing plan and run shapes", () => {
  const branch = { ...FAKE_PROFILE.branches[0], address: "9 Example Lane", lat: 39.8, lon: -105.1, locationSource: "qloo_place" as const };
  const profile = { ...FAKE_PROFILE, branches: [branch] };
  const originalPlan = buildPlanRequest(FAKE_PROFILE, FAKE_BRAND.name);
  const originalRun = buildRunRequest(FAKE_PROFILE, FAKE_PLAN_RESPONSE, CATEGORIES);
  const plan = buildPlanRequest(profile, FAKE_BRAND.name);
  const run = buildRunRequest(profile, { ...FAKE_PLAN_RESPONSE, branches: [branch] }, CATEGORIES);
  expect(plan).toEqual({ ...originalPlan, branches: [branch] });
  expect(run).toEqual({ ...originalRun, branches: [branch] });
});

describe("pasted lists", () => {
  it("splits all line endings, preserves commas, and keeps the first case-insensitive spelling", () => {
    expect(parseListText("  Fake Coffee  \r\n\r\nFAKE COFFEE\nFake, LLC\rFake Tea\n ")).toEqual(["Fake Coffee", "Fake, LLC", "Fake Tea"]);
    expect(parseListText(" \n\r\n")).toEqual([]);
  });

  it("caps unique pasted names at 500", () => {
    const names = parseListText(Array.from({ length: 510 }, (_, index) => `Fake merchant ${index}`).join("\n"));
    expect(names).toHaveLength(500);
    expect(names[499]).toBe("Fake merchant 499");
  });
});

describe("planning requests", () => {
  it("includes preferences and only valid overrides for current brand names", () => {
    const profile = { ...FAKE_PROFILE, categoryPreferences: { removed: [FAKE_CATEGORY_ID], added: [] } };
    const result = buildPlanRequest(profile, `${FAKE_BRAND.name}\nFake Tea`, "denver-demo", {
      [FAKE_BRAND.name]: FAKE_BRAND_ID, "Fake Tea": "bad", "Stale Brand": FAKE_BRAND_ID,
    });
    expect(result.presetId).toBe("denver-demo");
    expect(result.brandOverrides).toEqual({ [FAKE_BRAND.name]: FAKE_BRAND_ID });
    expect(result.preferences).toEqual(profile.categoryPreferences);
  });

  it("rejects empty or excessive brand lists at the request boundary", () => {
    expect(() => buildPlanRequest(FAKE_PROFILE, " ")).toThrow();
    expect(() => buildPlanRequest(FAKE_PROFILE, Array.from({ length: 11 }, (_, index) => `Fake ${index}`).join("\n"))).toThrow();
  });
});

describe("confirmed research requests", () => {
  it("trims and deduplicates business-member names without changing the pasted text", () => {
    const profile = { ...FAKE_PROFILE, businessMembersText: " Fake Coffee, LLC \r\nFAKE COFFEE, LLC\n\nFake Tea" };
    const result = buildRunRequest(profile, FAKE_PLAN_RESPONSE, CATEGORIES);
    expect(result.businessMemberNames).toEqual(["Fake Coffee, LLC", "Fake Tea"]);
    expect(profile.businessMembersText).toBe(" Fake Coffee, LLC \r\nFAKE COFFEE, LLC\n\nFake Tea");
    expect(result.signedNames).toEqual([]);
  });

  it("excludes signed/not-a-fit IDs without changing the signed-merchants text", () => {
    const profile = { ...FAKE_PROFILE, signedMerchantsText: "Fake, LLC\nfake, llc", merchantStatus: {
      "00000000-0000-4000-8000-000000000002": { name: "Fake Signed", status: "signed" as const, updatedAt: "2026-10-23" },
      "00000000-0000-4000-8000-000000000003": { name: "Fake Rejected", status: "not_a_fit" as const, updatedAt: "2026-10-23" },
      "00000000-0000-4000-8000-000000000004": { name: "Fake Contacted", status: "contacted" as const, updatedAt: "2026-10-23" },
    } };
    const result = buildRunRequest(profile, FAKE_PLAN_RESPONSE, CATEGORIES, {}, "denver-demo");
    expect(result.excludeEntityIds).toEqual(["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"]);
    expect(result.signedNames).toEqual(["Fake, LLC"]);
    expect(profile.signedMerchantsText).toBe("Fake, LLC\nfake, llc");
    expect(result.businessMemberNames).toEqual([]);
    expect(RunRequestSchema.safeParse(result).success).toBe(true);
  });

  it("uses only a known candidate override and ignores unknown choices", () => {
    const candidate = { entityId: "00000000-0000-4000-8000-000000000009", name: "Fake Alternate", popularity: 0.4, shortDescription: "Fake" };
    const plan = { ...FAKE_PLAN_RESPONSE, brands: [{ ...FAKE_PLAN_RESPONSE.brands[0], candidates: [candidate] }] };
    expect(buildRunRequest(FAKE_PROFILE, plan, CATEGORIES, { [FAKE_BRAND.name]: candidate.entityId }).brands).toEqual([{ entityId: candidate.entityId, name: candidate.name }]);
    expect(buildRunRequest(FAKE_PROFILE, plan, CATEGORIES, { [FAKE_BRAND.name]: "00000000-0000-4000-8000-000000000099" }).brands).toEqual([{ entityId: FAKE_BRAND_ID, name: FAKE_BRAND.name }]);
  });

  it("fills resolved coordinates while preserving current branch name and radius edits", () => {
    const profile = { ...FAKE_PROFILE, branches: [{ ...FAKE_PROFILE.branches[0], name: "Fake Renamed", radiusMeters: 8000, lat: undefined, lon: undefined, locationSource: undefined }] };
    const result = buildRunRequest(profile, FAKE_PLAN_RESPONSE, CATEGORIES);
    expect(result.branches[0]).toMatchObject({ name: "Fake Renamed", radiusMeters: 8000, lat: FAKE_PLAN_RESPONSE.branches[0].lat, lon: FAKE_PLAN_RESPONSE.branches[0].lon });
  });

  it("prefers current map coordinates and never restores a deleted profile branch", () => {
    const profile = { ...FAKE_PROFILE, branches: [{ ...FAKE_PROFILE.branches[0], lat: 40, lon: -105, locationSource: "map" as const }] };
    const plan = { ...FAKE_PLAN_RESPONSE, branches: [...FAKE_PLAN_RESPONSE.branches, { ...FAKE_PROFILE.branches[0], id: "deleted" }] };
    const result = buildRunRequest(profile, plan, CATEGORIES);
    expect(result.branches).toHaveLength(1);
    expect(result.branches[0]).toMatchObject({ lat: 40, lon: -105, locationSource: "map" });
  });

  it("researches only located plan branches while preserving unresolved branches for repair", () => {
    const located = { ...FAKE_PROFILE.branches[0], name: "Fake Renamed", radiusMeters: 8000 };
    const unresolved = { ...FAKE_PROFILE.branches[0], id: "unresolved", address: "Unknown location", lat: undefined, lon: undefined };
    const profile = { ...FAKE_PROFILE, branches: [located, unresolved] };
    const result = buildRunRequest(profile, FAKE_PLAN_RESPONSE, CATEGORIES);
    expect(result.branches).toEqual([located]);
    expect(profile.branches).toEqual([located, unresolved]);
    expect(() => buildRunRequest(profile, { ...FAKE_PLAN_RESPONSE, branches: [] }, CATEGORIES)).toThrow();
  });

  it("rejects unresolved changed addresses and more than five confirmed categories", () => {
    const profile = { ...FAKE_PROFILE, branches: [{ ...FAKE_PROFILE.branches[0], address: "New address", lat: undefined, lon: undefined }] };
    expect(() => buildRunRequest(profile, FAKE_PLAN_RESPONSE, CATEGORIES)).toThrow();
    expect(() => buildRunRequest(FAKE_PROFILE, FAKE_PLAN_RESPONSE, Array(6).fill(CATEGORIES[0]))).toThrow();
  });
});


it("preserves both preset run cache keys with the same fictional plan", () => {
  const keys = getPresets().map((preset) => {
    // Match preset selection's profile defaults; resolved brands/categories remain hand-written fakes.
    const profile = ProfileSchema.parse({ ...preset.profile,
      branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })),
      branchesByCity: { "Fake City, CO": FAKE_PROFILE.branches },
    });
    const planRequest = buildPlanRequest(profile, preset.brandsText, preset.id);
    const plan = { ...FAKE_PLAN_RESPONSE, branches: planRequest.branches };
    const request = buildRunRequest(profile, plan, plan.categories, {}, preset.id);
    expect(RunRequestSchema.parse(request)).toEqual(request);
    return [preset.id, cacheKey("run", request)];
  });
  // Captured before R24 tightened validation; this is not a stored Qloo response or live demo key.
  expect(Object.fromEntries(keys)).toEqual({
    "denver-demo": "pd:v1:run:ddc5a61c3fb964f15b27946a8ed59da4aef8de1fe6346e41816802a022c1d867",
    "austin-demo": "pd:v1:run:df0a7f795471a180f4028894c99525643bd135bf12db137ed386743b8cc21b92",
  });
});

it.each(getPresets())("keeps $label request payloads, canonical hashes, and cache keys unchanged with branch memory", (preset) => {
  const profile = ProfileSchema.parse({ ...preset.profile,
    branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })),
  });
  const withMemory = { ...profile, branchesByCity: { "Fake City, CO": FAKE_PROFILE.branches } };
  const plan = { ...FAKE_PLAN_RESPONSE, branches: profile.branches };
  const requests = [
    [buildPlanRequest(profile, preset.brandsText, preset.id), buildPlanRequest(withMemory, preset.brandsText, preset.id)],
    [buildRunRequest(profile, plan, plan.categories, {}, preset.id), buildRunRequest(withMemory, plan, plan.categories, {}, preset.id)],
  ];
  for (const [original, remembered] of requests) {
    const kind = "brandNames" in original ? "plan" : "run";
    expect(remembered).not.toHaveProperty("branchesByCity");
    expect(remembered).toEqual(original);
    expect(sha256Hex(canonicalJson(remembered))).toBe(sha256Hex(canonicalJson(original)));
    expect(cacheKey(kind, remembered)).toBe(cacheKey(kind, original));
  }
});
