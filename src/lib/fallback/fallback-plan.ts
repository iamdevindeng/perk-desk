// Builds guarded fallback categories from resolved brands, observed tags, and saved preferences.
// Called by: plan-agent when the model is unavailable or its submitted plan needs backfill.
import { FALLBACK_MAX_CATEGORIES } from "@/lib/config";
import { getCategoryLabel } from "@/lib/data";
import { checkCategoryCandidate, checkEvidence } from "@/lib/agent/guards";
import type { PlanContext } from "@/lib/agent/context";
import { resolveBrandNames } from "@/lib/agent/tools/resolve-brands";
import { searchCategoriesForContext } from "@/lib/agent/tools/search-categories";
import { mapBrandTagsToCategories } from "@/lib/fallback/category-map";
import { filterAllowedBrandTags } from "@/lib/qloo/search";
import type { BrandCandidate, PlannedCategory } from "@/lib/types";

function chooseFallbackBrands(context: PlanContext): BrandCandidate[] {
  const preservedIds = new Set(context.plan?.flatMap((category) => category.evidence.map((item) => item.brandEntityId)) ?? []);
  const brands: BrandCandidate[] = [];
  for (const resolution of context.brandsByInput.values()) {
    const preserve = resolution.chosen && (resolution.status === "resolved" || preservedIds.has(resolution.chosen.entityId));
    if (!preserve) {
      resolution.chosen = [...resolution.candidates].sort((first, second) => second.popularity - first.popularity)[0];
      resolution.matchKind = "fallback";
    }
    if (!resolution.chosen) continue;
    const brand = { ...resolution.chosen, tags: filterAllowedBrandTags(resolution.chosen.tags) };
    context.brandTags.set(brand.entityId, brand.tags);
    brands.push(brand);
  }
  return brands;
}

function preferenceCategories(context: PlanContext, brands: BrandCandidate[]): PlannedCategory[] {
  const brand = brands.find((candidate) => candidate.tags.length);
  if (!brand) return [];
  const tag = brand.tags[0];
  return context.request.preferences.added.map((tagId) => ({
    tagId, label: getCategoryLabel(tagId), source: "fallback",
    evidence: [{ brandEntityId: brand.entityId, brandName: brand.name, brandTagId: tag.id, brandTagName: tag.name,
      reason: "Saved institution preference; confirm this category." }],
  }));
}

function applyPreferences(context: PlanContext, brands: BrandCandidate[], mapped: PlannedCategory[]): PlannedCategory[] {
  const categories = new Map<string, PlannedCategory>();
  // Added preferences lead; a removed category wins if both lists contain the same ID.
  for (const category of [...preferenceCategories(context, brands), ...mapped]) {
    if (context.request.preferences.removed.includes(category.tagId) || categories.has(category.tagId)) continue;
    categories.set(category.tagId, category);
  }
  return [...categories.values()];
}

function guardedCategory(category: PlannedCategory, context: PlanContext, chosenIds: Set<string>): PlannedCategory | null {
  if (!checkCategoryCandidate(category.tagId, context.candidateCategories)) {
    context.emit({ type: "guard", at: 0, layer: 1, summary: "Dropped a fallback category not returned by category search." });
    return null;
  }
  const evidence = category.evidence.filter((item) => checkEvidence(item, context.brandTags, chosenIds));
  if (!evidence.length) {
    context.emit({ type: "guard", at: 0, layer: 2, summary: "Dropped a fallback category without valid observed brand evidence." });
    return null;
  }
  return { ...category, label: context.candidateCategories.get(category.tagId) ?? category.label,
    evidence, knownIndependents: context.knownDensities.get(category.tagId) };
}

export async function buildFallbackPlan(context: PlanContext): Promise<PlannedCategory[]> {
  await resolveBrandNames(context.request.brandNames, context);
  const brands = chooseFallbackBrands(context);
  if (!brands.length) {
    context.warnings.push("No requested brands could be resolved for fallback planning.");
    return [];
  }
  const mapped = mapBrandTagsToCategories(brands);
  if (!mapped.length) {
    context.warnings.push("Resolved brands have no permitted evidence tags; fallback cannot justify any category.");
    return [];
  }
  const proposed = applyPreferences(context, brands, mapped);
  const categories: PlannedCategory[] = [];
  const chosenIds = new Set(brands.map((brand) => brand.entityId));
  for (const category of proposed) {
    if (categories.length >= FALLBACK_MAX_CATEGORIES) break;
    // Hand-written targets are suggestions; guard 1 still requires a real category-search result.
    if (!context.candidateCategories.has(category.tagId)) await searchCategoriesForContext(category.label, context);
    const checked = guardedCategory(category, context, chosenIds);
    if (checked) categories.push(checked);
  }
  if (!categories.length) context.warnings.push("No suggested fallback categories passed the observed-category and evidence checks.");
  return categories;
}
