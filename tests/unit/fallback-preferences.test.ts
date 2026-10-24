// Checks saved category preferences preserve stronger observed evidence and removal choices.
// Called by: npm test; all brand data is hand-written and network lookups are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanContext, type PlanContext } from "@/lib/agent/context";
import { resolveBrandNames } from "@/lib/agent/tools/resolve-brands";
import { searchCategoriesForContext } from "@/lib/agent/tools/search-categories";
import { buildFallbackPlan } from "@/lib/fallback/fallback-plan";
import type { BrandCandidate } from "@/lib/types";
import { FAKE_BRAND, FAKE_CATEGORY_ID, FAKE_PLAN_REQUEST, FAKE_TAG } from "../fixtures/fake-plan";

vi.mock("@/lib/agent/tools/resolve-brands", () => ({ resolveBrandNames: vi.fn() }));
vi.mock("@/lib/agent/tools/search-categories", () => ({ searchCategoriesForContext: vi.fn() }));

const BAKERY_ID = "urn:tag:category:place:bakery";
const CAFE_ID = "urn:tag:category:place:cafe";

function preferenceContext(brand: BrandCandidate = FAKE_BRAND): PlanContext {
  const context = createPlanContext(structuredClone(FAKE_PLAN_REQUEST));
  context.brandsByInput.set(brand.name, {
    inputName: brand.name, status: "resolved", chosen: brand, matchKind: "exact", candidates: [brand],
  });
  context.request.preferences = { added: [FAKE_CATEGORY_ID], removed: [] };
  context.candidateCategories.set(FAKE_CATEGORY_ID, "Coffee shop");
  context.candidateCategories.set(CAFE_ID, "Cafe");
  context.candidateCategories.set(BAKERY_ID, "Bakery");
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveBrandNames).mockResolvedValue([]);
  vi.mocked(searchCategoriesForContext).mockResolvedValue([]);
});

describe("fallback preference evidence", () => {
  it("merges rule and preference evidence while preserving preference category order", async () => {
    const context = preferenceContext();
    context.request.preferences.added = [BAKERY_ID, FAKE_CATEGORY_ID];
    const categories = await buildFallbackPlan(context);
    expect(categories.map((category) => category.tagId)).toEqual([BAKERY_ID, FAKE_CATEGORY_ID, CAFE_ID]);
    expect(categories[1].evidence).toEqual([
      { kind: "rule", brandEntityId: FAKE_BRAND.entityId, brandName: FAKE_BRAND.name,
        brandTagId: FAKE_TAG.id, brandTagName: FAKE_TAG.name, reason: "Rule: tag contains 'coffee'" },
      { kind: "preference", reason: "Saved institution preference; confirm this category." },
    ]);
  });

  it("retains at most five strongest records after a preference is merged", async () => {
    const tags = Array.from({ length: 6 }, (_, index) => ({
      ...FAKE_TAG, id: `fake:coffee:${index}`, name: index === 5 ? "Specialty coffee roasting equipment" : "Coffee",
    }));
    const categories = await buildFallbackPlan(preferenceContext({ ...FAKE_BRAND, tags }));
    const evidence = categories[0].evidence;
    expect(evidence).toHaveLength(5);
    expect(evidence.every((item) => item.kind === "rule")).toBe(true);
    expect(evidence[0]).toMatchObject({ brandTagId: "fake:coffee:5", brandTagName: "Specialty coffee roasting equipment" });
    expect(new Set(evidence.map((item) => "brandTagId" in item ? item.brandTagId : item.kind)).size).toBe(5);
  });

  it("lets removal win over both a saved addition and matching rule evidence", async () => {
    const context = preferenceContext();
    context.request.preferences.removed = [FAKE_CATEGORY_ID];
    const categories = await buildFallbackPlan(context);
    expect(categories.map((category) => category.tagId)).toEqual([CAFE_ID]);
  });

  it("keeps preference-only suggestions free of unrelated brand and tag fields", async () => {
    const context = preferenceContext();
    context.request.preferences.added = [BAKERY_ID];
    const categories = await buildFallbackPlan(context);
    expect(categories[0].tagId).toBe(BAKERY_ID);
    expect(categories[0].evidence).toEqual([
      { kind: "preference", reason: "Saved institution preference; confirm this category." },
    ]);
  });
});
