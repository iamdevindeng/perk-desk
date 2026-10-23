// Checks mocked Qloo brand/category queries and removes prohibited tags before caching.
// Called by: npm test through the Vitest unit-test configuration.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND_SEARCH_TAKE, BRAND_TAGS_MAX, TAG_SEARCH_TAKE } from "@/lib/config";
import { resetEnvForTests } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { filterAllowedBrandTags, searchBrandExact, searchBrands } from "@/lib/qloo/search";
import { isBlacklistedCategory, searchPlaceCategories } from "@/lib/qloo/tags";
import { clearMemoryCacheForTests, getJson } from "@/lib/store/cache";
import type { TagRef } from "@/lib/types";
import { FAKE_BRAND_RESPONSE, FAKE_TAG_RESPONSE } from "../fixtures/qloo-fake";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("QLOO_API_KEY", "fake-unit-key");
  vi.stubEnv("QLOO_BASE_URL", "https://hackathon.api.qloo.com");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  resetEnvForTests();
  clearMemoryCacheForTests();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvForTests();
});

function fakeTag(id: string, type: string): TagRef {
  return { id, name: `Fake ${id}`, type };
}

describe("brand tag compliance and priority", () => {
  it("blocks denied types and whole demographic segments without overmatching", () => {
    const allowed = fakeTag("allowed", "urn:tag:beverage:qloo");
    const filtered = filterAllowedBrandTags([
      fakeTag("denied", "urn:tag:customer_segment:qloo"),
      fakeTag("age", "urn:tag:new_age_group:qloo"),
      fakeTag("gender", "urn:tag:gender:qloo"),
      fakeTag("income", "urn:tag:income_level:qloo"),
      fakeTag("demographic", "urn:tag:demographic:qloo"),
      fakeTag("unknown", ""), allowed,
    ]);
    expect(filtered).toEqual([allowed]);
  });

  it("prioritizes known types, retains within-type order, and caps after filtering", () => {
    const otherTags = Array.from({ length: BRAND_TAGS_MAX + 5 }, (_, index) =>
      fakeTag(`other-${index}`, "urn:tag:other:qloo"));
    const firstKeyword = fakeTag("first", "urn:tag:keyword:qloo");
    const secondKeyword = fakeTag("second", "urn:tag:keyword:qloo");
    const genre = fakeTag("genre", "urn:tag:genre:brand");
    const input = [...otherTags, firstKeyword, secondKeyword, genre];
    const filtered = filterAllowedBrandTags(input);
    expect(filtered).toHaveLength(BRAND_TAGS_MAX);
    expect(filtered.slice(0, 3)).toEqual([genre, firstKeyword, secondKeyword]);
    expect(input[0]).toBe(otherTags[0]);
  });
});

describe("brand searches", () => {
  it("uses brand query parameters and caches only normalized permitted fields", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(FAKE_BRAND_RESPONSE));
    const results = await searchBrands(" Fake Outdoor Co ");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("query")).toBe("Fake Outdoor Co");
    expect(url.searchParams.get("types")).toBe("urn:entity:brand");
    expect(url.searchParams.get("take")).toBe(String(BRAND_SEARCH_TAKE));
    expect(results[0].name).toBe("Fake Outdoor Co");
    expect(results[0].tags.every((tag) => typeof tag.id === "string")).toBe(true);
    const stored = await getJson(cacheKey("qloo", {
      path: "/search", params: { query: "Fake Outdoor Co", types: "urn:entity:brand", take: BRAND_SEARCH_TAKE },
    }));
    expect(stored).toEqual(results);
    expect(JSON.stringify(stored)).not.toContain("target_age_group");
    expect(JSON.stringify(stored)).not.toContain("tag_id");
  });

  it("skips malformed candidates and defaults missing optional properties", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ results: [
      null, { entity_id: "00000000-0000-4000-8000-000000000003", name: "Fake Basic Co" },
      { entity_id: "invalid", name: "Fake Invalid Co" },
    ] }));
    expect(await searchBrands("Fake Basic Co")).toEqual([{
      entityId: "00000000-0000-4000-8000-000000000003", name: "Fake Basic Co",
      popularity: 0, shortDescription: "", tags: [],
    }]);
  });

  it("normalizes either tag ID spelling and drops tags without IDs", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ results: [{
      entity_id: "00000000-0000-4000-8000-000000000004", name: "Fake Mixed Co",
      tags: [
        { tag_id: "fake:first", name: "First", type: "urn:tag:keyword:qloo" },
        { id: "fake:second", name: "Second", type: "urn:tag:keyword:qloo" },
        { name: "Missing ID", type: "urn:tag:keyword:qloo" },
      ],
    }] }));
    const results = await searchBrands("Fake Mixed Co");
    expect(results[0].tags.map((tag) => tag.id)).toEqual(["fake:first", "fake:second"]);
  });

  it("requests one candidate for the later exact-name chain check", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(FAKE_BRAND_RESPONSE));
    expect((await searchBrandExact("Fake Outdoor Co"))?.name).toBe("Fake Outdoor Co");
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("take")).toBe("1");
  });

  it("returns null for an empty brand search response", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ results: [] }));
    expect(await searchBrandExact("Fake Missing Co")).toBeNull();
  });
});

describe("place categories", () => {
  it("requests place tags and drops blocked or malformed IDs", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(FAKE_TAG_RESPONSE));
    const results = await searchPlaceCategories(" coffee ");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v2/tags");
    expect(url.searchParams.get("filter.query")).toBe("coffee");
    expect(url.searchParams.get("filter.tag.types")).toBe("urn:tag:category:place");
    expect(url.searchParams.get("take")).toBe(String(TAG_SEARCH_TAKE));
    expect(results.some((category) => category.tagId === "urn:tag:category:place:coffee_shop")).toBe(true);
    expect(results.every((category) => !isBlacklistedCategory(category.tagId))).toBe(true);
  });

  it("blocks slug substrings and invalid IDs, but accepts usable categories", () => {
    expect(isBlacklistedCategory("urn:tag:category:place:music_school")).toBe(true);
    expect(isBlacklistedCategory("urn:tag:category:place:coffee_supplier")).toBe(true);
    expect(isBlacklistedCategory("urn:tag:genre:place:coffee_shop")).toBe(true);
    expect(isBlacklistedCategory("urn:tag:category:place:coffee_shop")).toBe(false);
  });

  it("never fetches for blank brand or category queries", async () => {
    expect(await searchBrands(" \n ")).toEqual([]);
    expect(await searchBrandExact(" ")).toBeNull();
    expect(await searchPlaceCategories(" \t ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
