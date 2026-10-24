// Searches Qloo place categories and removes invalid or blacklisted category tags.
// Called by: category-search tools, category guards, and qloo-search unit tests.
import { z } from "zod";
import { TAG_SEARCH_TAKE } from "@/lib/config";
import { getBlacklist } from "@/lib/data";
import { CategoryTagIdSchema, CategoryTagSchema } from "@/lib/types";
import type { CategoryTag } from "@/lib/types";
import { cachedQlooCall } from "@/lib/qloo/client";
import type { QlooCallOptions } from "@/lib/qloo/client";

const RawCategorySchema = z.object({ id: CategoryTagIdSchema, name: z.string().min(1) });
const RawCategoriesSchema = z.object({
  success: z.literal(true).optional(), results: z.object({ tags: z.array(z.unknown()) }),
});

export function isBlacklistedCategory(tagId: string): boolean {
  if (!CategoryTagIdSchema.safeParse(tagId).success) return true;
  const slug = tagId.slice("urn:tag:category:place:".length);
  return getBlacklist().categorySlugKeywords.some((keyword) => slug.includes(keyword));
}

function slimCategories(raw: unknown): CategoryTag[] {
  const response = RawCategoriesSchema.parse(raw);
  const categories: CategoryTag[] = [];
  for (const rawCategory of response.results.tags) {
    const category = RawCategorySchema.safeParse(rawCategory);
    if (!category.success || isBlacklistedCategory(category.data.id)) continue;
    categories.push({ tagId: category.data.id, label: category.data.name });
  }
  return categories;
}

export async function searchPlaceCategories(query: string, options: QlooCallOptions = {}): Promise<CategoryTag[]> {
  const trimmedQuery = query.trim();
  // Qloo returns no tags for an empty filter.query (QLOO_API.md §3).
  if (!trimmedQuery) return [];
  return cachedQlooCall("/v2/tags", {
    "filter.query": trimmedQuery, "filter.tag.types": "urn:tag:category:place", take: TAG_SEARCH_TAKE,
  }, slimCategories, z.array(CategoryTagSchema), options);
}
