// Builds guarded fallback categories from resolved brands, observed tags, and saved preferences.
// Called by: plan-agent during brand finalization and fallback completion, and fallback unit tests.
import { FALLBACK_MAX_CATEGORIES } from "@/lib/config";
import { getCategoryLabel } from "@/lib/data";
import { checkCategoryCandidate, checkEvidence, compactCategoryEvidence } from "@/lib/agent/guards";
import type { PlanContext } from "@/lib/agent/context";
import { resolveBrandNames } from "@/lib/agent/tools/resolve-brands";
import { searchCategoriesForContext } from "@/lib/agent/tools/search-categories";
import { mapBrandTagsToCategories } from "@/lib/fallback/category-map";
import { normalizeName } from "@/lib/merchants/name-match";
import { filterAllowedBrandTags } from "@/lib/qloo/search";
import type { BrandCandidate, PlannedCategory } from "@/lib/types";

function nameMatchLevel(inputName: string, candidateName: string): number {
  const input = normalizeName(inputName);
  const name = normalizeName(candidateName);
  if (!input || !name) return 0;
  if (name === input) return 3;
  // A whole-word prefix keeps REI distinct from Reiss (QLOO_API.md §2).
  if (name.startsWith(`${input} `) || input.startsWith(`${name} `)) return 2;
  // Keep corporate words here: the I in REI comes from Inc.
  const words = candidateName.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const acronym = words.map((word) => word[0]).join("");
  return words.length > 1 && input === acronym ? 1 : 0;
}

export function selectFallbackBrand(inputName: string, candidates: BrandCandidate[]): BrandCandidate | undefined {
  return candidates.map((candidate) => ({ candidate, level: nameMatchLevel(inputName, candidate.name) }))
    .filter((match) => match.level > 0)
    .sort((first, second) => second.level - first.level || second.candidate.popularity - first.candidate.popularity)[0]?.candidate;
}

export function chooseFallbackBrands(context: PlanContext, preserveResolved = false): BrandCandidate[] {
  const brands: BrandCandidate[] = [];
  for (const resolution of context.brandsByInput.values()) {
    // Explicit choices do not depend on which brands survive the category evidence cap.
    const preserve = resolution.chosen && (resolution.matchKind === "user" || resolution.matchKind === "agent" ||
      (preserveResolved && (resolution.matchKind === "exact" || resolution.matchKind === "prefix")));
    if (!preserve) {
      const chosen = selectFallbackBrand(resolution.inputName, resolution.candidates);
      if (chosen !== resolution.chosen) resolution.matchKind = "fallback";
      resolution.chosen = chosen;
      resolution.status = chosen ? "resolved" : resolution.candidates.length ? "ambiguous" : "unresolved";
    }
    if (!resolution.chosen) continue;
    const brand = { ...resolution.chosen, tags: filterAllowedBrandTags(resolution.chosen.tags) };
    context.brandTags.set(brand.entityId, brand.tags);
    brands.push(brand);
  }
  return brands;
}

function preferenceCategories(context: PlanContext): PlannedCategory[] {
  return context.request.preferences.added.map((tagId) => ({
    tagId, label: getCategoryLabel(tagId), source: "fallback",
    evidence: [{ kind: "preference", reason: "Saved institution preference; confirm this category." }],
  }));
}

function applyPreferences(context: PlanContext, mapped: PlannedCategory[]): PlannedCategory[] {
  const categories = new Map<string, PlannedCategory>();
  // Added preferences lead; a removed category wins if both lists contain the same ID.
  for (const category of [...preferenceCategories(context), ...mapped]) {
    if (context.request.preferences.removed.includes(category.tagId)) continue;
    const existing = categories.get(category.tagId);
    // Keep preference ordering without hiding stronger observed brand evidence.
    categories.set(category.tagId, existing ? { ...existing,
      evidence: compactCategoryEvidence([...existing.evidence, ...category.evidence]),
    } : category);
  }
  return [...categories.values()];
}

function guardedCategory(category: PlannedCategory, context: PlanContext, chosenIds: Set<string>): PlannedCategory | null {
  if (!checkCategoryCandidate(category.tagId, context.candidateCategories)) {
    context.emit({ type: "guard", at: 0, layer: 1, summary: "Dropped a fallback category not returned by category search." });
    return null;
  }
  // Non-brand suggestions are created only by trusted fallback code, after guard 1.
  const evidence = category.evidence.filter((item) => item.kind === "preference" || item.kind === "default" ||
    checkEvidence(item, context.brandTags, chosenIds));
  if (!evidence.length) {
    context.emit({ type: "guard", at: 0, layer: 2, summary: "Dropped a fallback category without valid observed brand evidence." });
    return null;
  }
  return { ...category, label: context.candidateCategories.get(category.tagId) ?? category.label,
    evidence, knownIndependents: context.knownDensities.get(category.tagId) };
}

export async function buildFallbackPlan(context: PlanContext, preserveResolved = false): Promise<PlannedCategory[]> {
  await resolveBrandNames(context.request.brandNames, context);
  const brands = chooseFallbackBrands(context, preserveResolved);
  if (!brands.length) {
    context.warnings.push("No requested brands could be resolved for fallback planning.");
    return [];
  }
  const mapped = mapBrandTagsToCategories(brands);
  const proposed = applyPreferences(context, mapped);
  const categories: PlannedCategory[] = [];
  const chosenIds = new Set(brands.map((brand) => brand.entityId));
  for (const category of proposed) {
    // Limit accepted categories only; removed or rejected suggestions must not consume a slot.
    if (categories.length >= FALLBACK_MAX_CATEGORIES) break;
    // Hand-written targets are suggestions; guard 1 still requires a real category-search result.
    if (!context.candidateCategories.has(category.tagId)) await searchCategoriesForContext(category.label, context);
    const checked = guardedCategory(category, context, chosenIds);
    if (checked) categories.push(checked);
  }
  if (!categories.length) context.warnings.push("No suggested fallback categories passed the observed-category and evidence checks.");
  return categories;
}
