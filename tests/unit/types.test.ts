// Validates every shared schema with fictional data and rejects malformed boundaries.
// Called by: npm test
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import * as schemas from "@/lib/types";
import {
  FAKE_BRANCH, FAKE_BRAND, FAKE_BRAND_ID, FAKE_CATEGORY, FAKE_CATEGORY_ID, FAKE_CATEGORY_REPORT,
  FAKE_CITY_LIST, FAKE_EVIDENCE, FAKE_MERCHANT, FAKE_PLACE, FAKE_PLAN_REQUEST, FAKE_PLAN_RESPONSE,
  FAKE_PRESET, FAKE_PROFILE, FAKE_RESOLVED_BRAND, FAKE_RUN_REQUEST, FAKE_RUN_RESULT, FAKE_TAG, FAKE_TRACE_EVENTS,
} from "../fixtures/fake-plan";

const STATUS_ENTRY = { name: "Fake Corner Cafe", status: "to_contact", updatedAt: "2026-10-23" };
const CATEGORY_TAG = { tagId: FAKE_CATEGORY_ID, label: "Coffee shop" };
const BRANCH_LOOKUP_REQUEST = { name: "Fake Credit Union", city: "Fake City, CO" };
const BRANCH_LOOKUP_RESPONSE = { status: "found", query: BRANCH_LOOKUP_REQUEST.name, cityLabel: BRANCH_LOOKUP_REQUEST.city,
  places: [{ entityId: FAKE_PLACE.entityId, name: "Fake Credit Union", address: "3 Example Lane", lat: 39.75, lon: -104.99, distanceMeters: 20 }],
  suggestions: [],
};
const CASES: { name: string; schema: z.ZodType; valid: unknown; invalid: unknown[] }[] = [
  { name: "CategoryTagId", schema: schemas.CategoryTagIdSchema, valid: FAKE_CATEGORY_ID,
    invalid: ["urn:tag:genre:place:coffee_shop", "urn:tag:category:place:Coffee Shop"] },
  { name: "EntityId", schema: schemas.EntityIdSchema, valid: FAKE_BRAND_ID, invalid: ["short", "x".repeat(65)] },
  { name: "Branch", schema: schemas.BranchSchema, valid: FAKE_BRANCH,
    invalid: [{ ...FAKE_BRANCH, radiusMeters: 500 }, { ...FAKE_BRANCH, lat: 91 }] },
  { name: "BranchLookupRequest", schema: schemas.BranchLookupRequestSchema, valid: BRANCH_LOOKUP_REQUEST,
    invalid: [{ ...BRANCH_LOOKUP_REQUEST, name: " " }, { ...BRANCH_LOOKUP_REQUEST, name: "x".repeat(101) },
      { ...BRANCH_LOOKUP_REQUEST, city: "x" }, { ...BRANCH_LOOKUP_REQUEST, city: "x".repeat(81) }] },
  { name: "BranchLookupResponse", schema: schemas.BranchLookupResponseSchema, valid: BRANCH_LOOKUP_RESPONSE,
    invalid: [{ ...BRANCH_LOOKUP_RESPONSE, status: "unknown" },
      { ...BRANCH_LOOKUP_RESPONSE, places: Array(21).fill(BRANCH_LOOKUP_RESPONSE.places[0]) },
      { ...BRANCH_LOOKUP_RESPONSE, suggestions: Array(9).fill({ name: "Fake Bank", locations: 1 }) }] },
  { name: "CategoryPreferences", schema: schemas.CategoryPreferencesSchema, valid: { removed: [], added: [FAKE_CATEGORY_ID] },
    invalid: [{ removed: ["invalid"], added: [] }, { removed: [], added: Array(51).fill(FAKE_CATEGORY_ID) }] },
  { name: "MerchantStatus", schema: schemas.MerchantStatusSchema, valid: "to_contact", invalid: ["pending", 1] },
  { name: "MerchantStatusEntry", schema: schemas.MerchantStatusEntrySchema, valid: STATUS_ENTRY,
    invalid: [{ ...STATUS_ENTRY, status: "pending" }, { ...STATUS_ENTRY, updatedAt: 10 }] },
  { name: "Profile", schema: schemas.ProfileSchema, valid: FAKE_PROFILE,
    invalid: [{ ...FAKE_PROFILE, branches: Array(6).fill(FAKE_BRANCH) }, { ...FAKE_PROFILE, institutionName: "" }] },
  { name: "TagRef", schema: schemas.TagRefSchema, valid: FAKE_TAG,
    invalid: [{ ...FAKE_TAG, id: 1 }, { ...FAKE_TAG, type: null }] },
  { name: "CategoryTag", schema: schemas.CategoryTagSchema, valid: CATEGORY_TAG,
    invalid: [{ ...CATEGORY_TAG, tagId: "invalid" }, { ...CATEGORY_TAG, label: 1 }] },
  { name: "BrandCandidate", schema: schemas.BrandCandidateSchema, valid: FAKE_BRAND,
    invalid: [{ ...FAKE_BRAND, popularity: "high" }, { ...FAKE_BRAND, tags: [null] }] },
  { name: "Place", schema: schemas.PlaceSchema, valid: FAKE_PLACE,
    invalid: [{ ...FAKE_PLACE, lat: "39.75" }, { ...FAKE_PLACE, entityId: "bad" }] },
  { name: "ResolvedBrand", schema: schemas.ResolvedBrandSchema, valid: FAKE_RESOLVED_BRAND,
    invalid: [{ ...FAKE_RESOLVED_BRAND, matchKind: "guess" }, { ...FAKE_RESOLVED_BRAND, candidates: Array(4).fill(FAKE_BRAND) }] },
  { name: "CategoryEvidence", schema: schemas.CategoryEvidenceSchema, valid: FAKE_EVIDENCE,
    invalid: [{ ...FAKE_EVIDENCE, reason: "x".repeat(201) }, { ...FAKE_EVIDENCE, brandEntityId: "bad" }] },
  { name: "PlannedCategory", schema: schemas.PlannedCategorySchema, valid: FAKE_CATEGORY,
    invalid: [{ ...FAKE_CATEGORY, evidence: [] }, { ...FAKE_CATEGORY, tagId: "invalid" }] },
  { name: "PlanRequest", schema: schemas.PlanRequestSchema, valid: FAKE_PLAN_REQUEST,
    invalid: [{ ...FAKE_PLAN_REQUEST, brandNames: [] }, { ...FAKE_PLAN_REQUEST, branches: Array(6).fill(FAKE_BRANCH) }] },
  { name: "RunRequest", schema: schemas.RunRequestSchema, valid: FAKE_RUN_REQUEST,
    invalid: [{ ...FAKE_RUN_REQUEST, branches: [{ ...FAKE_BRANCH, lat: undefined }] }, { ...FAKE_RUN_REQUEST, categories: Array(6).fill(CATEGORY_TAG) }] },
  { name: "MerchantResult", schema: schemas.MerchantResultSchema, valid: FAKE_MERCHANT,
    invalid: [{ ...FAKE_MERCHANT, rankLift: 1.5 }, { ...FAKE_MERCHANT, pitchSource: "guess" }] },
  { name: "MerchantCandidate", schema: schemas.MerchantCandidateSchema,
    valid: { ...FAKE_MERCHANT, radiusMeters: 6000, baselineLength: 3, affinity: 0.1, explain: [] },
    invalid: [{ ...FAKE_MERCHANT }, { ...FAKE_MERCHANT, radiusMeters: 6000, baselineLength: 1.5, affinity: null, explain: [] }] },
  { name: "CategoryReport", schema: schemas.CategoryReportSchema, valid: FAKE_CATEGORY_REPORT,
    invalid: [{ ...FAKE_CATEGORY_REPORT, status: "empty" }, { ...FAKE_CATEGORY_REPORT, independentCount: 1.5 }] },
  { name: "RunResult", schema: schemas.RunResultSchema, valid: FAKE_RUN_RESULT,
    invalid: [{ ...FAKE_RUN_RESULT, mode: "cached" }, { ...FAKE_RUN_RESULT, qlooCalls: 1.5 }] },
  { name: "StepId", schema: schemas.StepIdSchema, valid: "resolve_brands", invalid: ["resolveBrands", 1] },
  { name: "ErrorCode", schema: schemas.ErrorCodeSchema, valid: "timeout", invalid: ["not_found", 500] },
  { name: "TraceEvent", schema: schemas.TraceEventSchema, valid: FAKE_TRACE_EVENTS[0],
    invalid: [{ type: "done", at: "0" }, { type: "guard", at: 0, layer: 3, summary: "invalid" }] },
  { name: "PlanResponse", schema: schemas.PlanResponseSchema, valid: FAKE_PLAN_RESPONSE,
    invalid: [{ ...FAKE_PLAN_RESPONSE, trace: [{ type: "unknown", at: 0 }] }, { ...FAKE_PLAN_RESPONSE, categories: [{ ...FAKE_CATEGORY, evidence: [] }] }] },
  { name: "Preset", schema: schemas.PresetSchema, valid: FAKE_PRESET,
    invalid: [{ ...FAKE_PRESET, profile: { ...FAKE_PROFILE, branches: [] } }, { ...FAKE_PRESET, brandsText: 1 }] },
  { name: "CityList", schema: schemas.CityListSchema, valid: FAKE_CITY_LIST,
    invalid: [{ cities: [{ ...FAKE_CITY_LIST.cities[0], zoom: 1.5 }] }, { cities: [{ ...FAKE_CITY_LIST.cities[0], lat: "north" }] }] },
];

describe("shared schemas", () => {
  it.each(CASES)("accepts a valid $name and rejects malformed variants", ({ schema, valid, invalid }) => {
    expect(schema.safeParse(valid).success).toBe(true);
    for (const input of invalid) expect(schema.safeParse(input).success).toBe(false);
  });

  it.each(FAKE_TRACE_EVENTS)("parses the $type event", (event) => {
    expect(schemas.TraceEventSchema.parse(event)).toEqual(event);
  });

  it("keeps request defaults usable and strips unknown fields", () => {
    const request = schemas.PlanRequestSchema.parse({
      institutionName: "Fake CU", city: "Denver, CO", branches: [{ id: "one", name: "Fake branch" }],
      brandNames: ["Fake Coffee Co"], unexpected: "discard me",
    });
    expect(request.branches[0]).toEqual({ id: "one", name: "Fake branch", address: "", radiusMeters: 6000 });
    expect(request.preferences).toEqual({ removed: [], added: [] });
    expect(request.brandOverrides).toEqual({});
    expect(request).not.toHaveProperty("unexpected");
  });

  it("does not put brand tag lists in the candidate switcher", () => {
    const brand = schemas.ResolvedBrandSchema.parse({ ...FAKE_RESOLVED_BRAND, candidates: [FAKE_BRAND] });
    expect(brand.candidates[0]).not.toHaveProperty("tags");
  });

  it("rejects overlong trace summaries before streaming", () => {
    expect(schemas.TraceEventSchema.safeParse({
      type: "tool_call", at: 0, tool: "resolveBrands", summary: "x".repeat(201),
    }).success).toBe(false);
  });
});

it.each([{ lat: -90, lon: -180 }, { lat: 90, lon: 180 }])("accepts coordinate boundaries for research", (point) => {
  expect(schemas.RunRequestSchema.safeParse({ ...FAKE_RUN_REQUEST, branches: [{ ...FAKE_BRANCH, ...point }] }).success).toBe(true);
});
it("trims lookup inputs and accepts Qloo places in saved profiles", () => {
  expect(schemas.BranchLookupRequestSchema.parse({ name: "  Fake Credit Union  ", city: "  Fake City, CO  " })).toEqual(BRANCH_LOOKUP_REQUEST);
  const branch = { ...FAKE_BRANCH, locationSource: "qloo_place" };
  expect(schemas.ProfileSchema.parse({ ...FAKE_PROFILE, branches: [branch] }).branches).toEqual([branch]);
});
it.each([{ lat: -91 }, { lat: 91 }, { lon: -181 }, { lon: 181 }, { lat: undefined }, { lon: undefined }])("rejects out-of-range or missing research coordinates", (point) => {
  expect(schemas.RunRequestSchema.safeParse({ ...FAKE_RUN_REQUEST, branches: [{ ...FAKE_BRANCH, ...point }] }).success).toBe(false);
});
