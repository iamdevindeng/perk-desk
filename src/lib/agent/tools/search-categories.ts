// Searches permitted place categories and adds known density hints to the request context.
// Called by: plan/run agents, fallback planning, and category-search unit tests
import { tool, type Tool } from "ai";
import { z } from "zod";
import { contextQlooOptions, handleToolError, researchStopped, type PlanContext, type RunContext } from "@/lib/agent/context";
import { getCategoryDefaults } from "@/lib/data";
import { citySlug } from "@/lib/hash";
import { isBlacklistedCategory, searchPlaceCategories } from "@/lib/qloo/tags";
import { getJson } from "@/lib/store/cache";
import type { CategoryTag } from "@/lib/types";

const SearchCategoriesInputSchema = z.object({ query: z.string().trim().min(1).max(80) });
// Legacy bare counts may describe an outage; require evidence of a complete lookup.
const DensitySchema = z.object({ count: z.number().int().nonnegative(), complete: z.literal(true) });
type SearchCategoriesInput = z.infer<typeof SearchCategoriesInputSchema>;
export type CategorySearchResult = CategoryTag & { knownIndependents?: number; usableInDemoCities: boolean };
type SearchCategoriesOutput = CategorySearchResult[] | { error: string };

async function categoryWithDensity(category: CategoryTag, context: PlanContext | RunContext): Promise<CategorySearchResult> {
  const key = `pd:v1:density:${citySlug(context.request.city)}:${category.tagId}`;
  const density = DensitySchema.safeParse(await getJson(key, context.signal));
  context.candidateCategories.set(category.tagId, category.label);
  if (density.success) context.knownDensities.set(category.tagId, density.data.count);
  return {
    ...category, knownIndependents: context.knownDensities.get(category.tagId),
    usableInDemoCities: getCategoryDefaults().categories.some((known) => known.tagId === category.tagId),
  };
}

export async function searchCategoriesForContext(query: string, context: PlanContext | RunContext): Promise<SearchCategoriesOutput> {
  if (researchStopped(context)) return { error: "Research stopped; using available categories." };
  context.emit({ type: "tool_call", at: 0, tool: "searchCategories", summary: "Finding place categories" });
  try {
    const input = SearchCategoriesInputSchema.parse({ query });
    const categories = await searchPlaceCategories(input.query, contextQlooOptions(context));
    const results: CategorySearchResult[] = [];
    for (const category of categories) {
      if (!isBlacklistedCategory(category.tagId)) results.push(await categoryWithDensity(category, context));
    }
    context.emit({ type: "tool_result", at: 0, tool: "searchCategories", summary: `Found ${results.length} place categories` });
    return results;
  } catch (error) {
    context.emit({ type: "tool_result", at: 0, tool: "searchCategories", summary: "Category lookup failed" });
    return handleToolError(context, error);
  }
}

export function buildSearchCategoriesTool(context: PlanContext | RunContext): Tool<SearchCategoriesInput, SearchCategoriesOutput> {
  return tool({
    description: "Find real local merchant categories using a short keyword derived from member brand tags.",
    inputSchema: SearchCategoriesInputSchema,
    execute: async ({ query }) => searchCategoriesForContext(query, context),
  });
}
