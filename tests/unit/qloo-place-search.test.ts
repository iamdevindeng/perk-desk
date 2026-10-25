// Checks place-search query parameters and shared slim parsing with invented upstream data.
// Called by: npm test with fetch mocked and no live Qloo calls
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { searchPlacesByName } from "@/lib/qloo/search";
import { clearMemoryCacheForTests, getJson } from "@/lib/store/cache";

const fetchMock = vi.fn<typeof fetch>();
const RAW_PLACE = {
  entity_id: "00000000-0000-4000-8000-000000000001", name: "Fake Grove Credit Union",
  location: { lat: 12.345, lon: -67.89 },
  properties: { address: "1 Example Lane", primary_genre: { id: "urn:tag:genre:place:credit_union" }, is_closed: false },
};

beforeEach(() => {
  vi.stubEnv("QLOO_API_KEY", "fake-unit-key");
  vi.stubEnv("QLOO_BASE_URL", "https://hackathon.api.qloo.com");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  resetEnvForTests(); clearMemoryCacheForTests(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetEnvForTests(); });

describe("Qloo place name search", () => {
  it("sends a trimmed place query, take 50, and comma-separated latitude first", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ results: [RAW_PLACE, null] }));
    const result = await searchPlacesByName(" Fake Grove Credit Union ", 12.3, -67.8);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: "Fake Grove Credit Union", types: "urn:entity:place", take: "50", "filter.location": "12.3,-67.8",
    });
    expect(result).toEqual([{
      entityId: RAW_PLACE.entity_id, name: RAW_PLACE.name, address: "1 Example Lane", lat: 12.345, lon: -67.89,
      primaryGenreId: "urn:tag:genre:place:credit_union", isClosed: false, explain: [],
    }]);
    expect(await getJson(cacheKey("qloo", { path: "/search", params: {
      query: "Fake Grove Credit Union", types: "urn:entity:place", take: 50, "filter.location": "12.3,-67.8",
    } }))).toEqual({ validated: true, value: result });
  });

  it("skips calls for empty or whitespace-only queries", async () => {
    expect(await searchPlacesByName("", 12.3, -67.8)).toEqual([]);
    expect(await searchPlacesByName(" \t ", 12.3, -67.8)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the validated slim cache on a repeated search", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: true, results: [RAW_PLACE] }));
    const first = await searchPlacesByName("Fake Grove Credit Union", 12.3, -67.8);
    expect(await searchPlacesByName("Fake Grove Credit Union", 12.3, -67.8)).toEqual(first);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
