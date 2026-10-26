// Checks static-data validity, reference integrity, and lookup behavior without network calls.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it } from "vitest";
import {
  BlacklistSchema, CategoryDefaultsSchema, NationalChainsSchema,
  findPreset, findUsCityCenter, getBlacklist, getCategoryDefaults, getCategoryLabel,
  getCities, getExactNationalChainNames, getNationalChainNames, getPresets, resolveMapCenter,
} from "@/lib/data";
import { MAP_DEFAULT_ZOOM, MAP_US_CENTER, MAP_US_ZOOM } from "@/lib/config";
import { CityListSchema, PresetSchema, UsCityCentersSchema } from "@/lib/types";
import usCityCentersData from "@/data/us-city-centers.json";
import citiesData from "@/data/presets/cities.json";

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

describe("bundled US city centers", () => {
  it("parses more than 700 unique labels and strips the source comment", () => {
    const table = UsCityCentersSchema.parse(usCityCentersData);
    expect(table).not.toHaveProperty("_comment");
    expect(table.cities.length).toBeGreaterThan(700);
    const labels = table.cities.map(([label]) => label);
    expect(new Set(labels).size).toBe(labels.length);
    // Catch normalized-label collisions that would silently overwrite a map entry.
    expect(new Set(labels.map((label) => findUsCityCenter(label))).size).toBe(labels.length);
  });

  it.each(["Portland, OR", "portland, or", "  Portland ,  OR ", "Portland,OR"])("finds Portland for %s", (label) => {
    const center = findUsCityCenter(label);
    expect(center).toEqual(findUsCityCenter("Portland, OR"));
    expect(center?.label).toBe("Portland, OR");
    expect(center?.lat).toBeCloseTo(45.537, 3);
    expect(center?.lon).toBeCloseTo(-122.65, 3);
    expect(center?.zoom).toBe(MAP_DEFAULT_ZOOM);
  });

  it.each(["Nashville, TN", "Washington, DC", "Honolulu, HI"])("includes %s", (label) => {
    expect(findUsCityCenter(label)).toMatchObject({ label, zoom: MAP_DEFAULT_ZOOM });
  });

  it("collapses whitespace inside a multi-word city label", () => {
    expect(findUsCityCenter("  New\t  York,NY ")).toEqual(findUsCityCenter("New York, NY"));
    expect(findUsCityCenter("New York, NY")).toBeDefined();
  });

  it.each(["Xyzville, ZZ", "", " \t "])("returns undefined for %j", (label) => {
    expect(findUsCityCenter(label)).toBeUndefined();
  });
});

describe("map center precedence", () => {
  const planCity = { label: "Fake City, ZZ", lat: 40, lon: -100 };

  it.each(citiesData.cities)("keeps the exact $label preset center before the table and plan", (city) => {
    expect(resolveMapCenter(city.label)).toEqual(city);
    expect(resolveMapCenter(city.label, planCity)).toEqual(city);
  });

  it("centers Portland from the table before any plan center", () => {
    expect(resolveMapCenter("Portland, OR")).toEqual(findUsCityCenter("Portland, OR"));
    expect(resolveMapCenter("Portland, OR", planCity)).toEqual(findUsCityCenter("Portland, OR"));
  });

  it.each(["", " \t ", "Xyzville, ZZ"])("shows the whole US for %j", (city) => {
    expect(resolveMapCenter(city)).toEqual({ ...MAP_US_CENTER, zoom: MAP_US_ZOOM });
  });

  it("uses the plan center when the typed city has no bundled match", () => {
    expect(resolveMapCenter("Xyzville, ZZ", planCity)).toEqual(planCity);
  });
});
