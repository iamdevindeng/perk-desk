// Checks static-data validity, reference integrity, and lookup behavior without network calls.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it } from "vitest";
import {
  BlacklistSchema, CategoryDefaultsSchema, NationalChainsSchema,
  findPreset, getBlacklist, getCategoryDefaults, getCategoryLabel,
  getCities, getExactNationalChainNames, getNationalChainNames, getPresets,
} from "@/lib/data";
import { CityListSchema, PresetSchema } from "@/lib/types";

describe("hand-written category data", () => {
  it("validates the category catalog and ignores author comments", () => {
    const defaults = getCategoryDefaults();
    expect(CategoryDefaultsSchema.safeParse(defaults).success).toBe(true);
    expect(defaults.categories.length).toBeGreaterThan(0);
    expect(defaults).not.toHaveProperty("_comment");
  });

  it("keeps every adjacent and quick-segment category in the catalog", () => {
    const defaults = getCategoryDefaults();
    const categoryIds = new Set(defaults.categories.map((category) => category.tagId));
    const adjacentIds = defaults.categories.flatMap((category) => category.adjacent);
    const segmentIds = defaults.quickSegments.flatMap((segment) => segment.categories);
    for (const tagId of [...adjacentIds, ...segmentIds]) expect(categoryIds.has(tagId)).toBe(true);
  });

  it("rejects malformed category IDs and unknown depth labels", () => {
    const defaults = getCategoryDefaults();
    const category = defaults.categories[0];
    expect(CategoryDefaultsSchema.safeParse({
      ...defaults, categories: [{ ...category, tagId: "invalid:category" }],
    }).success).toBe(false);
    expect(CategoryDefaultsSchema.safeParse({
      ...defaults, categories: [{ ...category, depth: "unverified" }],
    }).success).toBe(false);
  });

  it("uses the catalog label and title-cases an unfamiliar category slug", () => {
    expect(getCategoryLabel("urn:tag:category:place:coffee_shop")).toBe("Coffee shop");
    expect(getCategoryLabel("urn:tag:category:place:fake_craft_shop")).toBe("Fake Craft Shop");
  });
});

describe("hand-written filtering data", () => {
  it("validates each blacklist without including comments", () => {
    const blacklist = getBlacklist();
    expect(BlacklistSchema.safeParse(blacklist).success).toBe(true);
    expect(blacklist.categorySlugKeywords.length).toBeGreaterThan(0);
    expect(blacklist.noisePrimaryGenres.length).toBeGreaterThan(0);
    expect(blacklist.brandTagTypeDenylist.length).toBeGreaterThan(0);
    expect(blacklist).not.toHaveProperty("_comment");
  });

  it("rejects malformed blacklist entries", () => {
    expect(BlacklistSchema.safeParse({
      ...getBlacklist(), categorySlugKeywords: "school",
    }).success).toBe(false);
    expect(BlacklistSchema.safeParse({
      ...getBlacklist(), brandTagTypeDenylist: [12],
    }).success).toBe(false);
  });

  it("validates chain names and rejects non-string or empty entries", () => {
    const chains = { names: getNationalChainNames(), exactNames: getExactNationalChainNames() };
    expect(NationalChainsSchema.safeParse(chains).success).toBe(true);
    for (const field of ["names", "exactNames"] as const) {
      expect(chains[field].length).toBeGreaterThan(0);
      expect(NationalChainsSchema.safeParse({ ...chains, [field]: [12] }).success).toBe(false);
      expect(NationalChainsSchema.safeParse({ ...chains, [field]: [""] }).success).toBe(false);
    }
    expect(chains.exactNames.some((name) => chains.names.includes(name))).toBe(false);
  });
});

describe("presets and map cities", () => {
  it("validates both presets with one to five located branches", () => {
    expect(getPresets().map((preset) => preset.id)).toEqual(["denver-demo", "austin-demo"]);
    for (const preset of getPresets()) {
      expect(PresetSchema.safeParse(preset).success).toBe(true);
      expect(preset).not.toHaveProperty("_comment");
      expect(preset.profile.branches.length).toBeGreaterThanOrEqual(1);
      expect(preset.profile.branches.length).toBeLessThanOrEqual(5);
      for (const branch of preset.profile.branches) {
        expect(Number.isFinite(branch.lat)).toBe(true);
        expect(Number.isFinite(branch.lon)).toBe(true);
      }
    }
  });

  it("finds known presets and returns null for an unknown ID", () => {
    expect(findPreset("denver-demo")?.profile.city).toBe("Denver, CO");
    expect(findPreset("austin-demo")?.profile.city).toBe("Austin, TX");
    expect(findPreset("missing-preset")).toBeNull();
  });

  it("validates the map cities and returns their entries", () => {
    const cities = getCities();
    expect(CityListSchema.safeParse({ cities }).success).toBe(true);
    expect(cities.map((city) => city.label)).toEqual(["Denver, CO", "Austin, TX"]);
  });
});
