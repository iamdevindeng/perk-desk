// Completes confirmed research and optionally tries one adjacent category for thin results.
// Called by: run-agent for deterministic completion and fallback research
import { FALLBACK_MIN_REMAINING_MS, MIN_INDEPENDENTS } from "@/lib/config";
import { handleToolError, hasResearchTime, type RunContext } from "@/lib/agent/context";
import { findMerchantsForCategory } from "@/lib/agent/tools/find-merchants";
import { getCategoryDefaults } from "@/lib/data";

async function researchCategory(tagId: string, context: RunContext, replacesTagId?: string): Promise<void> {
  if (context.fatalError) throw context.fatalError;
  context.emit({ type: "tool_call", at: 0, tool: "findMerchants", summary: replacesTagId ? "Trying an adjacent merchant category" : "Researching a confirmed merchant category" });
  try {
    const result = await findMerchantsForCategory({ tagId, replacesTagId }, context);
    if ("error" in result) context.warnings.push(result.error);
    const summary = "error" in result ? "Category research could not complete" : `Found ${result.independentCount} independent shops`;
    context.emit({ type: "tool_result", at: 0, tool: "findMerchants", summary });
  } catch (error) {
    handleToolError(context, error);
  }
}

export async function runFallbackResearch(context: RunContext, tryAdjacent = true): Promise<void> {
  for (const category of context.request.categories) {
    if (!hasResearchTime(context, FALLBACK_MIN_REMAINING_MS)) break;
    if (!context.results.has(category.tagId)) await researchCategory(category.tagId, context);
  }
  if (!tryAdjacent) return;
  for (const category of context.request.categories) {
    if (!hasResearchTime(context, FALLBACK_MIN_REMAINING_MS)) break;
    const outcome = context.results.get(category.tagId);
    if (!outcome?.complete || outcome.independentCount >= MIN_INDEPENDENTS || context.replacements.has(category.tagId)) continue;
    const defaults = getCategoryDefaults().categories.find((entry) => entry.tagId === category.tagId);
    const adjacent = defaults?.adjacent[0];
    if (adjacent) await researchCategory(adjacent, context, category.tagId);
  }
  if (context.fatalError) throw context.fatalError;
}
