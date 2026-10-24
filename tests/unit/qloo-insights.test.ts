// Checks place normalization, compact hours, and exact Qloo insights query parameters without network calls.
// Called by: npm test
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { clearMemoryCacheForTests } from "@/lib/store/cache";
import { findPlaces, formatHours, resolveLocality, slimPlace } from "@/lib/qloo/insights";
import { FAKE_LOCALITY_RESPONSE, FAKE_PLACE, FAKE_PLACES_RESPONSE } from "../fixtures/qloo-fake";

const FETCH = vi.fn();
const QUERY = {
  lat: 39.75, lon: -104.99, radiusMeters: 6000, tagId: "urn:tag:category:place:coffee_shop",
  brandIds: ["00000000-0000-4000-8000-000000000001"],
};

beforeEach(() => {
  FETCH.mockReset();
  vi.stubGlobal("fetch", FETCH);
  vi.stubEnv("QLOO_API_KEY", "fake-insights-key");
  vi.stubEnv("QLOO_BASE_URL", "https://hackathon.api.qloo.com");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  resetEnvForTests();
  clearMemoryCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("place normalization", () => {
  it("maps documented fields and strips unknown sensitive fields", () => {
    expect(slimPlace(FAKE_PLACE)).toEqual({
      entityId: FAKE_PLACE.entity_id, name: "Fake Coffee Shop", address: "10 Fictional Lane", lat: 39.75, lon: -104.99,
      phone: ["+1", "555", "0100"].join("-"), website: "https://fake.example", googlePlaceId: "fake-google-place",
      hoursText: "Mon–Fri 10:00–17:00 · Sat 10:00–16:00 · Sun closed",
      businessRating: 4.6, tripadvisorRating: 4.5, tripadvisorCount: 23, priceLevel: 2,
      primaryGenreId: "urn:tag:genre:place:coffee_shop", description: "A fictional neighborhood cafe.",
      uniqueSellingPoint: "Handmade pretend pastries.", isClosed: false, affinity: 0.18,
      explain: [{ entityId: "00000000-0000-4000-8000-000000000001", score: 1 }],
    });
  });

  it("retains a closed place without ratings and omits null optional values", () => {
    const place = slimPlace(FAKE_PLACES_RESPONSE.results.entities[1]);
    expect(place).toMatchObject({ name: "Fake Closed Cafe", isClosed: true, address: "", explain: [] });
    expect(place).not.toHaveProperty("priceLevel");
    expect(place).not.toHaveProperty("tripadvisorRating");
  });

  it("uses the longer description when the short description is unavailable", () => {
    const raw = { ...FAKE_PLACE, properties: {
      description: "Fictional description", short_description: null, address: "11 Fake Street", business_rating: 4.2,
    } };
    expect(slimPlace(raw)).toMatchObject({ description: "Fictional description", address: "11 Fake Street", businessRating: 4.2 });
    expect(slimPlace(raw)).not.toHaveProperty("hoursText");
  });

  it("keeps a usable place when optional upstream fields have changed shape", () => {
    const raw = { ...FAKE_PLACE, properties: { phone: {}, business_rating: "bad" }, external: null, query: null };
    expect(slimPlace(raw)).toEqual({
      entityId: FAKE_PLACE.entity_id, name: FAKE_PLACE.name, lat: 39.75, lon: -104.99,
      address: "", isClosed: false, explain: [],
    });
  });

  it("drops unusable essentials and only malformed explanation entries", () => {
    expect(slimPlace({ ...FAKE_PLACE, name: " " })).toBeNull();
    expect(slimPlace({ ...FAKE_PLACE, entity_id: null })).toBeNull();
    expect(slimPlace({ ...FAKE_PLACE, location: { lat: 400, lon: -104.99 } })).toBeNull();
    const raw = { ...FAKE_PLACE, query: { explainability: { "signal.interests.entities": [
      { entity_id: "00000000-0000-4000-8000-000000000001", score: 0.7 }, { score: "invalid" },
    ] } } };
    expect(slimPlace(raw)?.explain).toHaveLength(1);
  });
});

describe("opening hours", () => {
  it("groups equal consecutive days without crossing unknown days", () => {
    const hours = [{ opens: "T09:00:00", closes: "T17:00:00" }];
    expect(formatHours({ monday: hours, tuesday: hours, thursday: hours })).toBe("Mon–Tue 09:00–17:00 · Thu 09:00–17:00");
  });

  it("handles split hours and consecutive closed days", () => {
    expect(formatHours({
      friday: [{ opens: "T09:00:00", closes: "T12:00:00" }, { opens: "T14:00:00", closes: "T18:00:00" }],
      saturday: [{ closed: true }], sunday: [{ closed: true }],
    })).toBe("Fri 09:00–12:00, 14:00–18:00 · Sat–Sun closed");
  });

  it("omits empty and malformed schedules", () => {
    expect(formatHours(undefined)).toBeUndefined();
    expect(formatHours({})).toBeUndefined();
    expect(formatHours({ monday: [{ opens: "T99:00:00", closes: "T17:00:00" }] })).toBeUndefined();
    expect(formatHours({ monday: [] })).toBeUndefined();
  });
});

describe("insights requests", () => {
  it("uses longitude-first WKT, radius, taste signals, and slim cached results", async () => {
    FETCH.mockResolvedValue(new Response(JSON.stringify(FAKE_PLACES_RESPONSE)));
    const onCall = vi.fn();
    const places = await findPlaces(QUERY, { onCall });
    const url = new URL(String(FETCH.mock.calls[0][0]));
    expect(url.searchParams.get("filter.location")).toBe("POINT(-104.99 39.75)");
    expect(url.searchParams.get("filter.location.radius")).toBe("6000");
    expect(url.searchParams.get("filter.tags")).toBe(QUERY.tagId);
    expect(url.searchParams.get("signal.interests.entities")).toBe(QUERY.brandIds.join(","));
    expect(url.searchParams.get("feature.explainability")).toBe("true");
    expect(url.toString()).not.toContain("fake-insights-key");
    expect(new Headers(FETCH.mock.calls[0][1].headers).get("X-Api-Key")).toBe("fake-insights-key");
    expect(places).toHaveLength(2);
    expect(await findPlaces(QUERY, { onCall })).toEqual(places);
    expect(FETCH).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: "/v2/insights", cached: true }));
  });

  it("omits taste parameters from baseline queries", async () => {
    FETCH.mockResolvedValue(new Response(JSON.stringify({ results: { entities: [] } })));
    expect(await findPlaces({ ...QUERY, brandIds: [] })).toEqual([]);
    const url = new URL(String(FETCH.mock.calls[0][0]));
    expect(url.searchParams.has("signal.interests.entities")).toBe(false);
    expect(url.searchParams.has("feature.explainability")).toBe(false);
  });

  it("resolves the response locality and caches only its slim fields", async () => {
    FETCH.mockResolvedValue(new Response(JSON.stringify(FAKE_LOCALITY_RESPONSE)));
    expect(await resolveLocality(" Fake address ")).toEqual({ name: "Fake district", lat: 39.75, lon: -104.99 });
    const url = new URL(String(FETCH.mock.calls[0][0]));
    expect(url.searchParams.get("filter.location.query")).toBe("Fake address");
    expect(url.searchParams.get("take")).toBe("1");
  });

  it("returns null for missing localities or blank queries", async () => {
    expect(await resolveLocality(" ")).toBeNull();
    expect(FETCH).not.toHaveBeenCalled();
    FETCH.mockResolvedValue(new Response(JSON.stringify({ query: { localities: { filter: [] } } })));
    expect(await resolveLocality("Fake unknown place")).toBeNull();
  });
});
