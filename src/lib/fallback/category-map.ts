// Maps permitted brand-tag names to deterministic fallback categories with honest evidence.
// Called by: fallback-plan and category-map unit tests.
import { FALLBACK_MAX_CATEGORIES } from "@/lib/config";
import { getCategoryDefaults, getCategoryLabel } from "@/lib/data";
import { normalizeName } from "@/lib/merchants/name-match";
import { filterAllowedBrandTags } from "@/lib/qloo/search";
import type { BrandCandidate, CategoryEvidence, PlannedCategory, TagRef } from "@/lib/types";

export const CATEGORY_RULES: { keywords: string[]; categories: string[] }[] = [
  { keywords: ["coffee", "espresso"], categories: ["coffee_shop", "cafe"] },
  { keywords: ["tea"], categories: ["tea_house"] },
  { keywords: ["bakery", "pastry", "donut"], categories: ["bakery", "donut_shop"] },
  { keywords: ["dessert", "ice cream", "candy", "chocolate"], categories: ["dessert_shop", "ice_cream_shop"] },
  { keywords: ["beer", "brew", "craft beer"], categories: ["brewery", "beer_garden"] },
  { keywords: ["wine"], categories: ["wine_bar", "wine_store"] },
  { keywords: ["cocktail", "spirits", "liqueur", "aperitif"], categories: ["cocktail_bar"] },
  { keywords: ["pet", "dog", "cats", "kitten"], categories: ["pet_supply_store", "pet_groomer"] },
  { keywords: ["yoga", "fitness", "athletic", "gym", "training", "running"], categories: ["gym", "sporting_goods_store"] },
  { keywords: ["outdoor", "camping", "hiking", "cycling", "bicycle"], categories: ["sporting_goods_store", "bicycle_shop"] },
  { keywords: ["beauty", "cosmetic", "skincare", "makeup"], categories: ["nail_salon", "day_spa"] },
  { keywords: ["hair"], categories: ["hair_salon", "barber_shop"] },
  { keywords: ["book"], categories: ["book_store"] },
  { keywords: ["music", "vinyl", "record"], categories: ["record_store"] },
  { keywords: ["fashion", "apparel", "clothing", "boots", "western"], categories: ["clothing_store", "womens_clothing_store", "mens_clothing_store"] },
  { keywords: ["jewelry"], categories: ["jewelry_store"] },
  { keywords: ["gift"], categories: ["gift_shop"] },
  { keywords: ["salad", "healthy", "plant-based", "organic"], categories: ["health_food_restaurant", "juice_shop"] },
  { keywords: ["burger"], categories: ["hamburger_restaurant"] },
  { keywords: ["mexican", "burrito", "taco"], categories: ["mexican_restaurant", "taco_restaurant"] },
  { keywords: ["pizza"], categories: ["pizza_restaurant"] },
  { keywords: ["grocery", "natural foods"], categories: ["health_food_restaurant", "cafe"] },
  { keywords: ["spa", "massage", "wellness"], categories: ["day_spa", "massage_spa"] },
].map((rule) => ({ ...rule, categories: rule.categories.map((slug) => `urn:tag:category:place:${slug}`) }));

function evidenceFor(brand: BrandCandidate, tag: TagRef, reason: string): CategoryEvidence {
  return { brandEntityId: brand.entityId, brandName: brand.name, brandTagId: tag.id, brandTagName: tag.name, reason };
}

function addCategory(categories: Map<string, PlannedCategory>, tagId: string, evidence: CategoryEvidence): void {
  const existing = categories.get(tagId);
  if (!existing) {
    categories.set(tagId, { tagId, label: getCategoryLabel(tagId), source: "fallback", evidence: [evidence] });
    return;
  }
  const alreadyCounted = existing.evidence.some((item) =>
    item.brandEntityId === evidence.brandEntityId && item.brandTagId === evidence.brandTagId);
  if (!alreadyCounted) existing.evidence.push(evidence);
}

function matchingKeyword(tagName: string, keywords: string[]): string | undefined {
  return keywords.find((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}`, "i").test(tagName);
  });
}

function ruleCategories(brands: BrandCandidate[]): PlannedCategory[] {
  const categories = new Map<string, PlannedCategory>();
  // Iterating rules first makes equal-frequency ties follow the documented rule order.
  for (const rule of CATEGORY_RULES) {
    for (const brand of brands) {
      addBrandMatches(categories, rule, brand);
    }
  }
  return [...categories.values()].sort((first, second) => second.evidence.length - first.evidence.length);
}

function addBrandMatches(
  categories: Map<string, PlannedCategory>, rule: { keywords: string[]; categories: string[] }, brand: BrandCandidate,
): void {
  for (const tag of brand.tags) {
    const keyword = matchingKeyword(tag.name, rule.keywords);
    if (keyword) addRuleCategories(categories, rule.categories, evidenceFor(brand, tag, `Rule: tag contains '${keyword}'`));
  }
}

function addRuleCategories(categories: Map<string, PlannedCategory>, tagIds: string[], evidence: CategoryEvidence): void {
  for (const tagId of tagIds) addCategory(categories, tagId, evidence);
}

function isSegmentBrand(brand: BrandCandidate, seedBrands: string[]): boolean {
  const name = normalizeName(brand.name);
  return seedBrands.some((seed) => {
    const normalizedSeed = normalizeName(seed);
    return name === normalizedSeed || name.startsWith(`${normalizedSeed} `) || normalizedSeed.startsWith(`${name} `);
  });
}

function defaultCategories(brands: BrandCandidate[]): PlannedCategory[] {
  const categories = new Map<string, PlannedCategory>();
  for (const segment of getCategoryDefaults().quickSegments) {
    for (const brand of brands.filter((candidate) => candidate.tags.length && isSegmentBrand(candidate, segment.seedBrands))) {
      const evidence = evidenceFor(brand, brand.tags[0], `Quick-segment default: ${segment.label}; confirm this category.`);
      addRuleCategories(categories, segment.categories, evidence);
    }
  }
  if (categories.size) return [...categories.values()];
  const brand = brands.find((candidate) => candidate.tags.length);
  if (!brand) return [];
  const evidence = evidenceFor(brand, brand.tags[0], "Generic fallback default; no matching keyword rule. Confirm this category.");
  const defaults = ["coffee_shop", "brunch_restaurant", "brewery", "gift_shop"];
  addRuleCategories(categories, defaults.map((slug) => `urn:tag:category:place:${slug}`), evidence);
  return [...categories.values()];
}

export function mapBrandTagsToCategories(brands: BrandCandidate[]): PlannedCategory[] {
  const permittedBrands = brands.map((brand) => ({ ...brand, tags: filterAllowedBrandTags(brand.tags) }));
  const mapped = ruleCategories(permittedBrands);
  return (mapped.length ? mapped : defaultCategories(permittedBrands)).slice(0, FALLBACK_MAX_CATEGORIES);
}
