// Resolves requested brand names and exposes permitted evidence tags to the plan agent.
// Called by: plan-agent, fallback-plan, and brand-resolution unit tests
import { tool, type Tool } from "ai";
import { z } from "zod";
import { BRAND_PROMPT_TAGS_MAX, BRAND_SEARCH_TAKE } from "@/lib/config";
import { contextQlooOptions, handleToolError, type BrandResolution, type PlanContext } from "@/lib/agent/context";
import { normalizeName } from "@/lib/merchants/name-match";
import { filterAllowedBrandTags, searchBrands } from "@/lib/qloo/search";
import { PlanRequestSchema, type BrandCandidate, type ResolvedBrand } from "@/lib/types";

const ResolveBrandsInputSchema = z.object({ names: PlanRequestSchema.shape.brandNames });
type ResolveBrandsInput = z.infer<typeof ResolveBrandsInputSchema>;
export type BrandMatch = {
  status: BrandResolution["status"]; chosen?: BrandCandidate; matchKind?: ResolvedBrand["matchKind"];
};
export type BrandToolCandidate = {
  entityId: string; name: string; popularity: number; shortDescription: string;
  tags: string[]; evidenceTags: { id: string; name: string }[];
};
export type BrandToolResult = {
  inputName: string; status: BrandResolution["status"]; chosen?: { entityId: string; name: string };
  candidates: BrandToolCandidate[];
};
type ResolveBrandsOutput = BrandToolResult[] | { error: string };

export function matchBrand(inputName: string, candidates: BrandCandidate[]): BrandMatch {
  const input = normalizeName(inputName);
  if (!candidates.length || !input) return { status: "unresolved" };
  const exact = candidates.find((candidate) => normalizeName(candidate.name) === input);
  if (exact) return { status: "resolved", chosen: exact, matchKind: "exact" };
  const prefix = candidates.find((candidate) => {
    const name = normalizeName(candidate.name);
    return name && (name.startsWith(`${input} `) || input.startsWith(`${name} `));
  });
  if (prefix) return { status: "resolved", chosen: prefix, matchKind: "prefix" };
  return { status: "ambiguous" };
}

function toolCandidate(candidate: BrandCandidate): BrandToolCandidate {
  const tags = candidate.tags.slice(0, BRAND_PROMPT_TAGS_MAX);
  // submitPlan requires exact IDs; names alone cannot identify valid evidence (ARCHITECTURE.md §5.3).
  return {
    entityId: candidate.entityId, name: candidate.name, popularity: candidate.popularity,
    shortDescription: candidate.shortDescription, tags: tags.map((tag) => tag.name),
    evidenceTags: tags.map(({ id, name }) => ({ id, name })),
  };
}

function toolResult(resolution: BrandResolution): BrandToolResult {
  const chosen = resolution.chosen;
  return {
    inputName: resolution.inputName, status: resolution.status,
    chosen: chosen ? { entityId: chosen.entityId, name: chosen.name } : undefined,
    candidates: resolution.candidates.map(toolCandidate),
  };
}

async function resolveOneBrand(inputName: string, context: PlanContext): Promise<BrandResolution> {
  const existing = context.brandsByInput.get(inputName);
  if (existing) return existing;
  const found = await searchBrands(inputName, contextQlooOptions(context));
  const candidates = found.slice(0, BRAND_SEARCH_TAKE).map((candidate) => ({
    ...candidate, tags: filterAllowedBrandTags(candidate.tags),
  }));
  for (const candidate of candidates) context.brandTags.set(candidate.entityId, candidate.tags);
  const override = candidates.find((candidate) => candidate.entityId === context.request.brandOverrides[inputName]);
  const match: BrandMatch = override ? { status: "resolved", chosen: override, matchKind: "user" } : matchBrand(inputName, candidates);
  const resolution = { inputName, candidates, ...match };
  context.brandsByInput.set(inputName, resolution);
  return resolution;
}

export async function resolveBrandNames(names: string[], context: PlanContext): Promise<ResolveBrandsOutput> {
  context.emit({ type: "tool_call", at: 0, tool: "resolveBrands", summary: "Resolving member brand names" });
  try {
    const requestedNames = new Set(names.map((name) => name.trim().toLowerCase()));
    // Use the original input spelling for overrides; ignore names invented by the model.
    const inputNames = [...new Set(context.request.brandNames.filter((name) => requestedNames.has(name.trim().toLowerCase())))];
    const results: BrandToolResult[] = [];
    for (const inputName of inputNames) results.push(toolResult(await resolveOneBrand(inputName, context)));
    context.emit({ type: "tool_result", at: 0, tool: "resolveBrands", summary: `Checked ${results.length} brand names` });
    return results;
  } catch (error) {
    context.emit({ type: "tool_result", at: 0, tool: "resolveBrands", summary: "Brand lookup failed" });
    return handleToolError(context, error);
  }
}

export function buildResolveBrandsTool(context: PlanContext): Tool<ResolveBrandsInput, ResolveBrandsOutput> {
  return tool({
    description: "Resolve the requested member brands; use evidenceTags IDs to justify categories.",
    inputSchema: ResolveBrandsInputSchema,
    execute: async ({ names }) => resolveBrandNames(names, context),
  });
}
