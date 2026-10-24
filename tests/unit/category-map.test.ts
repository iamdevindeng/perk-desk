// Checks fallback rule coverage, keyword matching, frequency order, and honest default evidence.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it } from "vitest";
import { FALLBACK_MAX_CATEGORIES } from "@/lib/config";
import { getCategoryDefaults } from "@/lib/data";
import { CATEGORY_RULES, mapBrandTagsToCategories } from "@/lib/fallback/category-map";
import type { BrandCandidate } from "@/lib/types";
import { FAKE_BRAND, FAKE_TAG } from "../fixtures/fake-plan";

function brandWithTags(names: string[]): BrandCandidate {
  return { ...FAKE_BRAND, tags: names.map((name, index) => ({ ...FAKE_TAG, id: `fake:tag:${index}`, name })) };
}

describe("fallback category rules", () => {
  it("uses only targets present in the hand-written category catalog", () => {
    const knownIds = new Set(getCategoryDefaults().categories.map((category) => category.tagId));
    for (const rule of CATEGORY_RULES) {
      expect(rule.keywords.length).toBeGreaterThan(0);
      for (const tagId of rule.categories) expect(knownIds.has(tagId)).toBe(true);
    }
  });

  it("matches keywords case-insensitively at the start of a word", () => {
    const categories = mapBrandTagsToCategories([brandWithTags(["Premium COFFEE equipment"])]);
    expect(categories.map((category) => category.tagId)).toEqual([
      "urn:tag:category:place:coffee_shop", "urn:tag:category:place:cafe",
    ]);
    expect(categories[0].evidence[0]).toMatchObject({ brandTagId: "fake:tag:0", reason: "Rule: tag contains 'coffee'" });
    expect(mapBrandTagsToCategories([brandWithTags(["Toffee"])]).every((category) =>
      category.evidence[0].reason.startsWith("Generic fallback"))).toBe(true);
  });

  it("does not read keywords from tag IDs or prohibited tags", () => {
    const brand = { ...FAKE_BRAND, tags: [
      { ...FAKE_TAG, id: "urn:tag:keyword:qloo:wine", name: "Unclassified" },
      { id: "fake:restricted", name: "Wine", type: "urn:tag:target_age_group:qloo" },
    ] };
    const categories = mapBrandTagsToCategories([brand]);
    expect(categories.some((category) => category.tagId === "urn:tag:category:place:wine_bar")).toBe(false);
    expect(categories.every((category) => category.evidence[0].kind === "default")).toBe(true);
    expect(categories.every((category) => !("brandTagId" in category.evidence[0]))).toBe(true);
  });

  it("ranks distinct supporting tags by frequency and resolves ties by rule order", () => {
    const categories = mapBrandTagsToCategories([brandWithTags(["Wine", "Gifts", "Coffee", "Espresso"])]);
    expect(categories).toHaveLength(FALLBACK_MAX_CATEGORIES);
    expect(categories.map((category) => category.tagId)).toEqual([
      "urn:tag:category:place:coffee_shop", "urn:tag:category:place:cafe",
      "urn:tag:category:place:wine_bar", "urn:tag:category:place:wine_store",
    ]);
    expect(categories[0].evidence).toHaveLength(2);
  });

  it("does not count one supporting tag twice when two rules lead to the same category", () => {
    const categories = mapBrandTagsToCategories([brandWithTags(["Organic grocery"])]);
    expect(categories.find((category) => category.tagId === "urn:tag:category:place:health_food_restaurant")?.evidence).toHaveLength(1);
  });

  it("caps stored evidence after ranking categories by their full distinct support", () => {
    const coffee = Array.from({ length: 6 }, (_, index) => `Coffee option ${index}`);
    const wine = Array.from({ length: 7 }, (_, index) => `Wine option ${index}`);
    const categories = mapBrandTagsToCategories([brandWithTags([...coffee, ...wine])]);
    expect(categories[0].tagId).toBe("urn:tag:category:place:wine_bar");
    expect(categories.every((category) => category.evidence.length === 5)).toBe(true);
  });

  it("uses quick-segment defaults with explicit default evidence", () => {
    const brand = { ...brandWithTags(["Unclassified"]), name: "Fake Unknown" };
    const seeded = { ...brand, name: "Starbucks" };
    const categories = mapBrandTagsToCategories([seeded]);
    expect(categories.map((category) => category.tagId)).toEqual([
      "urn:tag:category:place:coffee_shop", "urn:tag:category:place:bakery",
      "urn:tag:category:place:dessert_shop", "urn:tag:category:place:ice_cream_shop",
    ]);
    expect(categories.every((category) => category.evidence[0].reason.startsWith("Quick-segment default:"))).toBe(true);
    expect(categories.every((category) => category.evidence[0].kind === "default" && !("brandTagId" in category.evidence[0]))).toBe(true);
  });

  it("offers explicit defaults without inventing brand evidence when tags are absent", () => {
    const categories = mapBrandTagsToCategories([{ ...FAKE_BRAND, tags: [] }]);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.every((category) => category.evidence[0].kind === "default" && !("brandEntityId" in category.evidence[0]))).toBe(true);
    expect(mapBrandTagsToCategories([])).toEqual([]);
  });

  it("does not mutate input brands or tags", () => {
    const brand = brandWithTags(["Coffee"]);
    const original = structuredClone(brand);
    mapBrandTagsToCategories([brand]);
    expect(brand).toEqual(original);
  });
});
