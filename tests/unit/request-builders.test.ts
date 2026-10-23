// Checks pasted lists and API requests preserve current edits while rejecting stale choices.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { buildPlanRequest, buildRunRequest, parseListText } from "@/lib/request-builders";
import { RunRequestSchema } from "@/lib/types";
import { FAKE_BRAND, FAKE_BRAND_ID, FAKE_CATEGORY_ID, FAKE_PLAN_RESPONSE, FAKE_PROFILE } from "../fixtures/fake-plan";

const CATEGORIES = [{ tagId: FAKE_CATEGORY_ID, label: "Coffee shop" }];

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

  it("rejects unresolved changed addresses and more than five confirmed categories", () => {
    const profile = { ...FAKE_PROFILE, branches: [{ ...FAKE_PROFILE.branches[0], address: "New address", lat: undefined, lon: undefined }] };
    expect(() => buildRunRequest(profile, FAKE_PLAN_RESPONSE, CATEGORIES)).toThrow();
    expect(() => buildRunRequest(FAKE_PROFILE, FAKE_PLAN_RESPONSE, Array(6).fill(CATEGORIES[0]))).toThrow();
  });
});
