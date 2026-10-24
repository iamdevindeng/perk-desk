// Checks observed-category and evidence guards, brand-choice rules, and safe rejection traces.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it, vi } from "vitest";
import { PLAN_MAX_CATEGORIES } from "@/lib/config";
import { createPlanContext } from "@/lib/agent/context";
import { applyPlanGuards, checkCategoryCandidate, checkEvidence, PlanSubmissionSchema } from "@/lib/agent/guards";
import type { PlanContext } from "@/lib/agent/context";
import { FAKE_BRAND, FAKE_BRAND_ID, FAKE_CATEGORY_ID, FAKE_EVIDENCE, FAKE_PLAN_REQUEST, FAKE_TAG } from "../fixtures/fake-plan";

const OTHER_BRAND = { ...FAKE_BRAND, entityId: "00000000-0000-4000-8000-000000000009", name: "Fake Other Co" };
const SUBMISSION = { brandChoices: [], categories: [{ tagId: FAKE_CATEGORY_ID, evidence: [FAKE_EVIDENCE] }] };

function makeContext(): PlanContext {
  const context = createPlanContext(FAKE_PLAN_REQUEST, vi.fn());
  context.brandsByInput.set(FAKE_BRAND.name, {
    inputName: FAKE_BRAND.name, status: "resolved", chosen: FAKE_BRAND, matchKind: "exact",
    candidates: [FAKE_BRAND, OTHER_BRAND],
  });
  context.brandTags.set(FAKE_BRAND_ID, [FAKE_TAG]);
  context.brandTags.set(OTHER_BRAND.entityId, [FAKE_TAG]);
  context.candidateCategories.set(FAKE_CATEGORY_ID, "Observed coffee label");
  context.knownDensities.set(FAKE_CATEGORY_ID, 8);
  return context;
}

describe("layer 1", () => {
  it("accepts observed usable categories and rejects unknown, malformed, or blocked IDs", () => {
    const candidates = new Map([[FAKE_CATEGORY_ID, "Coffee"], ["urn:tag:category:place:music_school", "School"]]);
    expect(checkCategoryCandidate(FAKE_CATEGORY_ID, candidates)).toBe(true);
    expect(checkCategoryCandidate("urn:tag:category:place:bakery", candidates)).toBe(false);
    expect(checkCategoryCandidate("invalid", candidates)).toBe(false);
    expect(checkCategoryCandidate("urn:tag:category:place:music_school", candidates)).toBe(false);
    expect(checkCategoryCandidate(FAKE_CATEGORY_ID, candidates, ["coffee"])).toBe(false);
  });
});

describe("layer 2", () => {
  it("requires a chosen brand, an observed tag, and a non-empty reason", () => {
    const tags = new Map([[FAKE_BRAND_ID, [FAKE_TAG]]]);
    const chosen = new Set([FAKE_BRAND_ID]);
    expect(checkEvidence(FAKE_EVIDENCE, tags, chosen)).toBe(true);
    expect(checkEvidence({ ...FAKE_EVIDENCE, brandTagId: "invented-tag" }, tags, chosen)).toBe(false);
    expect(checkEvidence(FAKE_EVIDENCE, tags, new Set())).toBe(false);
    expect(checkEvidence({ ...FAKE_EVIDENCE, reason: " \n " }, tags, chosen)).toBe(false);
  });

  it("rejects demographic evidence even if a caller stores the restricted tag", () => {
    const restricted = { id: "fake:age", name: "Restricted", type: "urn:tag:new_age_group:qloo" };
    const tags = new Map([[FAKE_BRAND_ID, [restricted]]]);
    expect(checkEvidence({ ...FAKE_EVIDENCE, brandTagId: restricted.id }, tags, new Set([FAKE_BRAND_ID]))).toBe(false);
  });
});

describe("plan guards", () => {
  it("builds labels from observed data and leaves submission count and plan ownership to the caller", () => {
    const context = makeContext();
    const forgedEvidence = { ...FAKE_EVIDENCE, brandName: "Invented", brandTagName: "Invented" };
    const result = applyPlanGuards({ ...SUBMISSION, categories: [{ tagId: FAKE_CATEGORY_ID, evidence: [forgedEvidence] }] }, context);
    expect(result.errors).toEqual([]);
    expect(result.kept[0]).toMatchObject({
      label: "Observed coffee label", knownIndependents: 8, source: "agent",
      evidence: [{ brandName: FAKE_BRAND.name, brandTagName: FAKE_TAG.name }],
    });
    expect(context.submitCount).toBe(0);
    expect(context.plan).toBeNull();
  });

  it("keeps valid sibling categories and evidence while tracing each rejection", () => {
    const context = makeContext();
    const emit = vi.fn();
    context.emit = emit;
    const invalid = { ...FAKE_EVIDENCE, brandTagId: "invented" };
    const result = applyPlanGuards({ brandChoices: [], categories: [
      { tagId: "invalid-category", evidence: [FAKE_EVIDENCE] },
      { tagId: FAKE_CATEGORY_ID, evidence: [invalid, FAKE_EVIDENCE] },
    ] }, context);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].evidence).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("drops categories containing only invalid evidence", () => {
    const context = makeContext();
    const result = applyPlanGuards({ brandChoices: [], categories: [{
      tagId: FAKE_CATEGORY_ID, evidence: [{ ...FAKE_EVIDENCE, brandTagId: "invented" }],
    }] }, context);
    expect(result.kept).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });

  it("does not let the model disguise unsupported evidence as a default", () => {
    const context = makeContext();
    const forged = { ...FAKE_EVIDENCE, kind: "default", brandTagId: "invented" };
    expect(applyPlanGuards({ categories: [{ tagId: FAKE_CATEGORY_ID, evidence: [forged] }] }, context).kept).toEqual([]);
    const valid = { ...FAKE_EVIDENCE, kind: "default" };
    const result = applyPlanGuards({ categories: [{ tagId: FAKE_CATEGORY_ID, evidence: [valid] }] }, context);
    expect(result.kept[0].evidence[0].kind).toBe("agent");
  });

  it("deduplicates and caps valid evidence in an agent submission", () => {
    const context = makeContext();
    const tags = Array.from({ length: 7 }, (_, index) => ({ ...FAKE_TAG, id: `fake:tag:${index}` }));
    context.brandTags.set(FAKE_BRAND_ID, tags);
    const evidence = tags.map((tag) => ({ ...FAKE_EVIDENCE, brandTagId: tag.id }));
    const result = applyPlanGuards({ categories: [{ tagId: FAKE_CATEGORY_ID, evidence: [evidence[0], ...evidence] }] }, context);
    expect(result.kept[0].evidence).toHaveLength(5);
    expect(new Set(result.kept[0].evidence.map((item) => "brandTagId" in item ? item.brandTagId : "")).size).toBe(5);
  });

  it("deduplicates and caps categories in submitted order", () => {
    const context = makeContext();
    const categories = Array.from({ length: PLAN_MAX_CATEGORIES + 1 }, (_, index) => {
      const tagId = `urn:tag:category:place:fake_category_${index}`;
      context.candidateCategories.set(tagId, `Fake ${index}`);
      return { tagId, evidence: [FAKE_EVIDENCE] };
    });
    const result = applyPlanGuards({ brandChoices: [], categories: [categories[0], ...categories] }, context);
    expect(result.kept.map((category) => category.tagId)).toEqual(categories.slice(0, PLAN_MAX_CATEGORIES).map((category) => category.tagId));
    expect(result.errors).toHaveLength(2);
  });

  it("preserves the code-resolved choice when the model selects another candidate", () => {
    const context = makeContext();
    applyPlanGuards({ ...SUBMISSION, brandChoices: [{ inputName: FAKE_BRAND.name, entityId: OTHER_BRAND.entityId }] }, context);
    expect(context.brandsByInput.get(FAKE_BRAND.name)?.chosen).toBe(FAKE_BRAND);
    expect(context.brandsByInput.get(FAKE_BRAND.name)?.matchKind).toBe("exact");
  });

  it("accepts valid ambiguous choices and uses the first candidate for an invalid choice", () => {
    const context = makeContext();
    const resolution = context.brandsByInput.get(FAKE_BRAND.name);
    if (!resolution) throw new Error("Fake resolution missing");
    resolution.status = "ambiguous";
    resolution.chosen = undefined;
    applyPlanGuards({ ...SUBMISSION, brandChoices: [{ inputName: FAKE_BRAND.name, entityId: OTHER_BRAND.entityId }] }, context);
    expect(resolution.chosen).toBe(OTHER_BRAND);
    expect(resolution.matchKind).toBe("agent");
    expect(resolution.status).toBe("ambiguous");
    applyPlanGuards({ ...SUBMISSION, brandChoices: [{ inputName: FAKE_BRAND.name, entityId: "invented" }] }, context);
    expect(resolution.chosen).toBe(FAKE_BRAND);
    expect(resolution.matchKind).toBe("fallback");
  });

  it("rejects malformed structures without throwing or exposing parser details", () => {
    expect(PlanSubmissionSchema.safeParse(SUBMISSION).success).toBe(true);
    expect(applyPlanGuards({ categories: "invalid" }, makeContext())).toEqual({
      kept: [], errors: ["The submitted plan has an invalid structure."],
    });
  });
});
