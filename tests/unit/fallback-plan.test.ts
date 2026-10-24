// Checks fallback brand selection, observed-category guards, preferences, and partial-plan preservation.
// Called by: npm test through the Vitest unit-test configuration.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanContext } from "@/lib/agent/context";
import type { PlanContext } from "@/lib/agent/context";
import { resolveBrandNames } from "@/lib/agent/tools/resolve-brands";
import { searchCategoriesForContext } from "@/lib/agent/tools/search-categories";
import { buildFallbackPlan } from "@/lib/fallback/fallback-plan";
import { FAKE_BRAND, FAKE_CATEGORY, FAKE_CATEGORY_ID, FAKE_PLAN_REQUEST, FAKE_TAG } from "../fixtures/fake-plan";

vi.mock("@/lib/agent/tools/resolve-brands", () => ({ resolveBrandNames: vi.fn() }));
vi.mock("@/lib/agent/tools/search-categories", () => ({ searchCategoriesForContext: vi.fn() }));

const CAFE_ID = "urn:tag:category:place:cafe";
const BAKERY_ID = "urn:tag:category:place:bakery";
const HIGHER_BRAND = { ...FAKE_BRAND, entityId: "00000000-0000-4000-8000-000000000009", name: "Fake Other Coffee", popularity: 0.9 };

function makeContext(): PlanContext {
  const context = createPlanContext(structuredClone(FAKE_PLAN_REQUEST));
  context.brandsByInput.set(FAKE_BRAND.name, {
    inputName: FAKE_BRAND.name, status: "resolved", chosen: FAKE_BRAND, matchKind: "exact", candidates: [FAKE_BRAND, HIGHER_BRAND],
  });
  context.brandTags.set(FAKE_BRAND.entityId, [FAKE_TAG]);
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveBrandNames).mockResolvedValue([]);
  vi.mocked(searchCategoriesForContext).mockImplementation(async (query, context) => {
    const tagId = query === "Bakery" ? BAKERY_ID : query === "Cafe" ? CAFE_ID : FAKE_CATEGORY_ID;
    context.candidateCategories.set(tagId, `Observed ${query}`);
    return [{ tagId, label: `Observed ${query}`, usableInDemoCities: true }];
  });
});

describe("fallback plan", () => {
  it("uses observed category searches, preserves exact choices, and keeps rule evidence", async () => {
    const context = makeContext();
    const categories = await buildFallbackPlan(context);
    expect(resolveBrandNames).toHaveBeenCalledWith(context.request.brandNames, context);
    expect(categories.map((category) => category.tagId)).toEqual([FAKE_CATEGORY_ID, CAFE_ID]);
    expect(categories[0].label).toBe("Observed Coffee shop");
    expect(categories.every((category) => category.evidence[0].reason.startsWith("Rule:"))).toBe(true);
    expect(context.brandsByInput.get(FAKE_BRAND.name)?.chosen).toBe(FAKE_BRAND);
    expect(context.brandsByInput.get(FAKE_BRAND.name)?.matchKind).toBe("exact");
  });

  it("chooses a matching name before a more popular unrelated candidate", async () => {
    const context = makeContext();
    const resolution = context.brandsByInput.get(FAKE_BRAND.name);
    if (!resolution) throw new Error("Missing fake resolution");
    resolution.status = "ambiguous";
    resolution.chosen = undefined;
    await buildFallbackPlan(context);
    expect(resolution.chosen).toBe(FAKE_BRAND);
    expect(resolution.matchKind).toBe("fallback");
  });

  it("preserves an ambiguous choice that already supports a valid partial category", async () => {
    const context = makeContext();
    const resolution = context.brandsByInput.get(FAKE_BRAND.name);
    if (!resolution) throw new Error("Missing fake resolution");
    resolution.status = "ambiguous";
    resolution.matchKind = "agent";
    context.plan = [FAKE_CATEGORY];
    await buildFallbackPlan(context);
    expect(resolution.chosen).toBe(FAKE_BRAND);
    expect(context.plan).toEqual([FAKE_CATEGORY]);
    expect(context.plan[0].source).toBe("agent");
  });

  it("does not pretend defaults were returned when category search finds nothing", async () => {
    vi.mocked(searchCategoriesForContext).mockResolvedValue([]);
    const context = makeContext();
    expect(await buildFallbackPlan(context)).toEqual([]);
    expect(context.candidateCategories.size).toBe(0);
    expect(context.warnings.length).toBeGreaterThan(0);
  });

  it("returns a warning and no invented evidence for brands without allowed tags", async () => {
    const context = makeContext();
    const resolution = context.brandsByInput.get(FAKE_BRAND.name);
    if (!resolution) throw new Error("Missing fake resolution");
    resolution.chosen = { ...FAKE_BRAND, tags: [] };
    resolution.candidates = [resolution.chosen];
    expect(await buildFallbackPlan(context)).toEqual([]);
    expect(context.warnings.join(" ")).toContain("no permitted evidence tags");
    expect(searchCategoriesForContext).not.toHaveBeenCalled();
  });

  it("prioritizes added preferences and honors removals without inventing keyword matches", async () => {
    const context = makeContext();
    context.request.preferences = { added: [BAKERY_ID], removed: [CAFE_ID] };
    const categories = await buildFallbackPlan(context);
    expect(categories.map((category) => category.tagId)).toEqual([BAKERY_ID, FAKE_CATEGORY_ID]);
    expect(categories[0].evidence[0].reason).toBe("Saved institution preference; confirm this category.");
  });
});
