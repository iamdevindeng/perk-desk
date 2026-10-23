// Converts Qloo brand searches into slim candidates with only permitted, prioritized tags.
// Called by: brand-resolution tools, merchant chain checks, and qloo-search unit tests.
import { z } from "zod";
import { BRAND_SEARCH_TAKE, BRAND_TAGS_MAX } from "@/lib/config";
import { getBlacklist } from "@/lib/data";
import { BrandCandidateSchema, EntityIdSchema } from "@/lib/types";
import type { BrandCandidate, TagRef } from "@/lib/types";
import { cachedQlooCall } from "@/lib/qloo/client";
import type { QlooCallOptions } from "@/lib/qloo/client";

const TAG_TYPE_PRIORITY = [
  "urn:tag:genre:brand", "urn:tag:keyword:qloo", "urn:tag:lifestyle:qloo",
  "urn:tag:interest_adjacency:qloo", "urn:tag:product_category:qloo",
  "urn:tag:product_service:qloo", "urn:tag:industry:qloo",
  "urn:tag:consumption_context:qloo", "urn:tag:wikipedia_category",
];
const RawTagSchema = z.object({
  tag_id: z.string().optional(), id: z.string().optional(),
  name: z.string().min(1), type: z.string().catch(""),
});
const RawBrandSchema = z.object({
  entity_id: EntityIdSchema, name: z.string().min(1), popularity: z.number().catch(0),
  properties: z.object({ short_description: z.string().catch("") }).catch({ short_description: "" }),
  tags: z.array(z.unknown()).catch([]),
});
const RawSearchSchema = z.object({ results: z.array(z.unknown()).catch([]) });

function tagPriority(tag: TagRef): number {
  const priority = TAG_TYPE_PRIORITY.indexOf(tag.type);
  return priority < 0 ? TAG_TYPE_PRIORITY.length : priority;
}

export function filterAllowedBrandTags(tags: TagRef[]): TagRef[] {
  const deniedTypes = getBlacklist().brandTagTypeDenylist;
  // Whole segments avoid false matches such as "beverage" (ARCHITECTURE §5.5).
  const demographicType = /(^|[:_])(age|gender|income|demographic)(?=[:_]|$)/i;
  return tags
    .filter((tag) => tag.type && !deniedTypes.includes(tag.type) && !demographicType.test(tag.type))
    .sort((first, second) => tagPriority(first) - tagPriority(second))
    .slice(0, BRAND_TAGS_MAX);
}

function normalizeTag(raw: unknown): TagRef | null {
  const parsed = RawTagSchema.safeParse(raw);
  if (!parsed.success) return null;
  const id = parsed.data.tag_id ?? parsed.data.id;
  if (!id) return null;
  return { id, name: parsed.data.name, type: parsed.data.type };
}

function slimBrand(raw: unknown): BrandCandidate | null {
  const parsed = RawBrandSchema.safeParse(raw);
  if (!parsed.success) return null;
  const brand = parsed.data;
  const tags = brand.tags.map(normalizeTag).filter((tag) => tag !== null);
  // Filter before cachedQlooCall stores anything: prohibited tags never enter the cache.
  return {
    entityId: brand.entity_id, name: brand.name, popularity: brand.popularity,
    shortDescription: brand.properties.short_description, tags: filterAllowedBrandTags(tags),
  };
}

function slimBrands(raw: unknown): BrandCandidate[] {
  const parsed = RawSearchSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.results.map(slimBrand).filter((brand) => brand !== null);
}

async function searchWithTake(name: string, take: number, options: QlooCallOptions): Promise<BrandCandidate[]> {
  const query = name.trim();
  if (!query) return [];
  return cachedQlooCall("/search", { query, types: "urn:entity:brand", take },
    slimBrands, z.array(BrandCandidateSchema), options);
}

export async function searchBrands(name: string, options: QlooCallOptions = {}): Promise<BrandCandidate[]> {
  return searchWithTake(name, BRAND_SEARCH_TAKE, options);
}

export async function searchBrandExact(name: string, options: QlooCallOptions = {}): Promise<BrandCandidate | null> {
  // Name equality belongs to the chain check; search itself is fuzzy (ARCHITECTURE §6.3).
  const candidates = await searchWithTake(name, 1, options);
  return candidates[0] ?? null;
}
