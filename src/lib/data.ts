// Validates bundled category, chain, preset, and city data once for shared access.
// Called by: planning, merchant filtering, frontend pickers, and tests/unit/data.test.ts.
import { z } from "zod";
import categoryDefaultsData from "@/data/category-defaults.json";
import blacklistData from "@/data/category-blacklist.json";
import nationalChainsData from "@/data/national-chains.json";
import denverPresetData from "@/data/presets/denver-demo.json";
import austinPresetData from "@/data/presets/austin-demo.json";
import citiesData from "@/data/presets/cities.json";
import usCityCentersData from "@/data/us-city-centers.json";
import { MAP_DEFAULT_ZOOM, MAP_US_CENTER, MAP_US_ZOOM } from "@/lib/config";
import { CategoryTagIdSchema, CityListSchema, PresetSchema, UsCityCentersSchema } from "@/lib/types";
import type { CityList, PlanResponse, Preset } from "@/lib/types";

export const CategoryDefaultsSchema = z.object({
  verifiedOn: z.iso.date(),
  categories: z.array(z.object({
    tagId: CategoryTagIdSchema,
    label: z.string().min(1),
    group: z.string().min(1),
    depth: z.enum(["thick", "medium", "thin"]),
    quickPick: z.boolean(),
    adjacent: z.array(CategoryTagIdSchema),
  })).min(1),
  quickSegments: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    seedBrands: z.array(z.string().min(1)).min(1),
    categories: z.array(CategoryTagIdSchema).min(1),
  })).min(1),
});

export const BlacklistSchema = z.object({
  categorySlugKeywords: z.array(z.string().min(1)),
  noisePrimaryGenres: z.array(z.string().min(1)),
  brandTagTypeDenylist: z.array(z.string().min(1)),
});

export const NationalChainsSchema = z.object({
  names: z.array(z.string().min(1)),
  exactNames: z.array(z.string().min(1)),
});
export type CategoryDefaults = z.infer<typeof CategoryDefaultsSchema>;
export type Blacklist = z.infer<typeof BlacklistSchema>;
export type NationalChains = z.infer<typeof NationalChainsSchema>;

// Static imports also work in client bundles and Vercel; object parsing strips _comment.
const CATEGORY_DEFAULTS = CategoryDefaultsSchema.parse(categoryDefaultsData);
const BLACKLIST = BlacklistSchema.parse(blacklistData);
const NATIONAL_CHAINS = NationalChainsSchema.parse(nationalChainsData);
const PRESETS = [PresetSchema.parse(denverPresetData), PresetSchema.parse(austinPresetData)];
const CITY_LIST = CityListSchema.parse(citiesData);
const US_CITY_CENTERS = UsCityCentersSchema.parse(usCityCentersData);
const US_CITY_CENTERS_BY_LABEL = new Map(US_CITY_CENTERS.cities.map(([label, lat, lon]) =>
  [normalizeCityLabel(label), { label, lat, lon, zoom: MAP_DEFAULT_ZOOM }]));

function normalizeCityLabel(city: string): string {
  return city.trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").toLowerCase();
}

export function getCategoryDefaults(): CategoryDefaults {
  return CATEGORY_DEFAULTS;
}

export function getCategoryLabel(tagId: string): string {
  const category = CATEGORY_DEFAULTS.categories.find((entry) => entry.tagId === tagId);
  if (category) return category.label;
  // Qloo can return valid categories beyond our hand-written defaults (ARCHITECTURE §8).
  const slug = tagId.split(":").pop() ?? tagId;
  return slug.replaceAll("_", " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function getBlacklist(): Blacklist {
  return BLACKLIST;
}

export function getNationalChainNames(): string[] {
  return NATIONAL_CHAINS.names;
}

export function getExactNationalChainNames(): string[] {
  return NATIONAL_CHAINS.exactNames;
}

export function getPresets(): Preset[] {
  return PRESETS;
}

export function findPreset(id: string): Preset | null {
  return PRESETS.find((preset) => preset.id === id) ?? null;
}

export function getCities(): CityList["cities"] {
  return CITY_LIST.cities;
}

export function findUsCityCenter(city: string): { label: string; lat: number; lon: number; zoom: number } | undefined {
  return US_CITY_CENTERS_BY_LABEL.get(normalizeCityLabel(city));
}

export function resolveMapCenter(city: string, planCity?: PlanResponse["city"]): { lat: number; lon: number; zoom?: number } {
  const presetCity = getCities().find((entry) => entry.label === city);
  const center = presetCity ?? findUsCityCenter(city) ?? planCity;
  if (center) return center;
  // Keep the preset safety fallback; empty and unknown Other city inputs start nationwide.
  const otherCity = !getCities().some((entry) => entry.label === city);
  return otherCity ? { ...MAP_US_CENTER, zoom: MAP_US_ZOOM } : getCities()[0];
}
