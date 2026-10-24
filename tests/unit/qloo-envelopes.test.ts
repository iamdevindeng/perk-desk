// Rejects failed or malformed HTTP-200 envelopes without caching them, while preserving valid empty results.
// Called by: npm test; every fetch returns small fictional data in memory
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND_SEARCH_TAKE } from "@/lib/config";
import { cacheKey } from "@/lib/hash";
import { findPlaces, resolveLocality } from "@/lib/qloo/insights";
import { searchBrands } from "@/lib/qloo/search";
import { searchPlaceCategories } from "@/lib/qloo/tags";
import { clearMemoryCacheForTests, setJson } from "@/lib/store/cache";
import { FAKE_BRAND_RESPONSE, FAKE_LOCALITY_RESPONSE, FAKE_PLACES_RESPONSE, FAKE_TAG_RESPONSE } from "../fixtures/qloo-fake";

vi.mock("@/lib/env", () => ({ hasUpstash: () => false, getEnv: () => ({ QLOO_API_KEY: "fake-placeholder", QLOO_BASE_URL: "https://hackathon.api.qloo.com" }) }));
const FETCH = vi.fn<typeof fetch>();
const SERVICES = [
  { name: "brands", call: () => searchBrands("Fake Coffee Co"), healthy: FAKE_BRAND_RESPONSE, empty: { results: [] }, wrong: { results: {} } },
  { name: "categories", call: () => searchPlaceCategories("fake coffee"), healthy: FAKE_TAG_RESPONSE, empty: { results: { tags: [] } }, wrong: { results: { tags: null } } },
  { name: "places", call: () => findPlaces({ lat: 39.75, lon: -104.99, radiusMeters: 6000, tagId: "urn:tag:category:place:coffee_shop", brandIds: [] }),
    healthy: FAKE_PLACES_RESPONSE, empty: { results: { entities: [] } }, wrong: { results: { entities: "invalid" } } },
  { name: "localities", call: () => resolveLocality("Fake address"), healthy: FAKE_LOCALITY_RESPONSE, empty: { query: { localities: { filter: [] } } }, wrong: { query: { localities: { filter: null } } } },
];
beforeEach(() => { clearMemoryCacheForTests(); FETCH.mockReset(); vi.stubGlobal("fetch", FETCH); });
afterEach(() => { vi.unstubAllGlobals(); });

describe.each(SERVICES)("$name envelope boundary", (service) => {
  it.each(["failure", "missing", "null", "wrong"])("rejects %s then recovers and caches only the healthy result", async (variant) => {
    const malformed = variant === "failure" ? { ...service.empty, success: false, message: "private upstream detail" }
      : variant === "missing" ? {} : variant === "null" ? null : service.wrong;
    FETCH.mockResolvedValueOnce(Response.json(malformed)).mockResolvedValueOnce(Response.json(service.healthy));
    await expect(service.call()).rejects.toMatchObject({ code: "upstream", message: "Qloo returned an unexpected response; try again in a minute." });
    const recovered = await service.call();
    expect(await service.call()).toEqual(recovered);
    expect(FETCH).toHaveBeenCalledTimes(2);
  });
  it("accepts and caches a valid empty result, including unknown envelope fields", async () => {
    FETCH.mockResolvedValueOnce(Response.json({ ...service.empty, success: true, futureField: "ignored" }));
    const empty = await service.call();
    expect(empty).toEqual(service.name === "localities" ? null : []);
    expect(await service.call()).toEqual(empty); expect(FETCH).toHaveBeenCalledTimes(1);
  });
});

it.each([{ results: { entities: [] } }, { query: {} }, { query: { localities: {} } }])("preserves documented missing-locality resolution", async (response) => {
  FETCH.mockResolvedValueOnce(Response.json(response));
  expect(await resolveLocality("Fake unresolvable address")).toBeNull();
});

it.each([{ legacy: [] }, { legacy: [{ entityId: "00000000-0000-4000-8000-000000000001", name: "Fake old brand", popularity: 0, tags: [], shortDescription: "" }] }])("refreshes legacy slim values at unchanged keys", async ({ legacy }) => {
  const key = cacheKey("qloo", { path: "/search", params: { query: "Fake Coffee Co", types: "urn:entity:brand", take: BRAND_SEARCH_TAKE } });
  await setJson(key, legacy, 60);
  FETCH.mockResolvedValueOnce(Response.json(FAKE_BRAND_RESPONSE));
  const recovered = await searchBrands("Fake Coffee Co");
  expect(recovered[0].name).toBe("Fake Outdoor Co");
  expect(await searchBrands("Fake Coffee Co")).toEqual(recovered);
  expect(FETCH).toHaveBeenCalledTimes(1);
});
