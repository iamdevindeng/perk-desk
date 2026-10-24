// Checks that real research preserves partial evidence and recovers from outages without flushing cache keys.
// Called by: npm test; Qloo lookups, configuration, and rate limits are mocked with fictional data
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/run/route";
import { cacheKey, citySlug } from "@/lib/hash";
import { createQlooError } from "@/lib/qloo/client";
import { findPlaces } from "@/lib/qloo/insights";
import { searchBrandExact } from "@/lib/qloo/search";
import { clearMemoryCacheForTests, getJson, setJson } from "@/lib/store/cache";
import { checkLimit } from "@/lib/store/rate-limit";
import { TraceEventSchema, type TraceEvent, type RunRequest } from "@/lib/types";
import { FAKE_RUN_REQUEST, FAKE_RUN_RESULT } from "../fixtures/fake-plan";
import { makeFakePlace } from "../fixtures/fake-places";

vi.mock("@/lib/env", () => ({ hasQlooKey: () => true, hasUpstash: () => false, hasDeepSeekKey: () => false, isAgentDisabled: () => true }));
vi.mock("@/lib/qloo/insights", () => ({ findPlaces: vi.fn() }));
vi.mock("@/lib/qloo/search", () => ({ searchBrandExact: vi.fn() }));
vi.mock("@/lib/store/rate-limit", () => ({ checkLimit: vi.fn(), getClientIp: () => "fake", hasJudgeBypass: () => false, isPresetRun: async () => false }));
const RUN_KEY = cacheKey("run", FAKE_RUN_REQUEST);
const DENSITY_KEY = `pd:v1:density:${citySlug(FAKE_RUN_REQUEST.city)}:${FAKE_RUN_REQUEST.categories[0].tagId}`;
const PLACES = Array.from({ length: 12 }, (_, index) => makeFakePlace(index + 10));

async function run(request: RunRequest = FAKE_RUN_REQUEST): Promise<TraceEvent[]> {
  const response = await POST(new Request("http://localhost/api/run", { method: "POST", body: JSON.stringify(request) }));
  return (await response.text()).trim().split("\n").map((line) => TraceEventSchema.parse(JSON.parse(line)));
}
function result(events: TraceEvent[]) { return events.find((event) => event.type === "result")?.result; }

beforeEach(() => {
  vi.clearAllMocks(); clearMemoryCacheForTests();
  vi.mocked(findPlaces).mockReset().mockResolvedValue(PLACES);
  vi.mocked(searchBrandExact).mockReset().mockResolvedValue(null);
  vi.mocked(checkLimit).mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unit tests must not use network"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("run outage recovery", () => {
  it("emits error and done on a full outage, preserves prior density, then recovers without clearing cache", async () => {
    await setJson(DENSITY_KEY, { count: 9, complete: true }, 60);
    vi.mocked(findPlaces).mockRejectedValue(createQlooError("network", null, "private upstream detail"));
    const failed = await run();
    expect(failed.slice(-2).map((event) => event.type)).toEqual(["error", "done"]);
    expect(result(failed)).toBeUndefined(); expect(JSON.stringify(failed)).not.toContain("private upstream detail");
    expect(await getJson(RUN_KEY)).toBeNull();
    expect(await getJson(DENSITY_KEY)).toEqual({ count: 9, complete: true });
    expect(findPlaces).toHaveBeenCalledTimes(2);
    vi.mocked(findPlaces).mockReset().mockResolvedValue(PLACES);
    expect(result(await run())?.merchants).toHaveLength(10);
    expect(findPlaces).toHaveBeenCalledTimes(2);
    expect(await getJson(RUN_KEY)).toMatchObject({ complete: true });
    vi.mocked(findPlaces).mockClear(); vi.mocked(checkLimit).mockClear();
    expect(result(await run())?.merchants).toHaveLength(10);
    expect(findPlaces).not.toHaveBeenCalled(); expect(checkLimit).not.toHaveBeenCalled();
  });

  it.each(["taste", "baseline"])("keeps partial %s failure results without caching or declaring thin supply", async (failure) => {
    vi.mocked(findPlaces).mockImplementation(async (query) => {
      if ((query.brandIds.length > 0) === (failure === "taste")) throw createQlooError("upstream", 200, "private");
      return PLACES.slice(0, 2);
    });
    const partial = result(await run())!;
    expect(partial.merchants).toHaveLength(2);
    expect(partial.categories).toMatchObject([{ status: "incomplete" }]);
    expect(partial.merchants.every((merchant) => merchant.rankLift === null)).toBe(true);
    expect(partial.merchants.every((merchant) => merchant.tasteSignal === (failure === "baseline"))).toBe(true);
    expect(await getJson(RUN_KEY)).toBeNull(); expect(await getJson(DENSITY_KEY)).toBeNull();
    expect(findPlaces).toHaveBeenCalledTimes(2);
    vi.mocked(findPlaces).mockReset().mockResolvedValue(PLACES);
    expect(result(await run())?.merchants).toHaveLength(10);
  });

  it.each([0, 8])("refreshes legacy run envelopes and density %s at the same keys", async (count) => {
    await setJson(RUN_KEY, { events: [{ type: "result", at: 0, result: { ...FAKE_RUN_RESULT, merchants: [], warnings: ["Lookup failed"] } }] }, 60);
    await setJson(DENSITY_KEY, count, 60);
    expect(result(await run())?.merchants).toHaveLength(10);
    expect(findPlaces).toHaveBeenCalledTimes(2);
    expect(await getJson(RUN_KEY)).toMatchObject({ complete: true });
    expect(await getJson(DENSITY_KEY)).toEqual({ count: 12, complete: true });
  });

  it("caches a genuinely empty successful search and its verified zero density", async () => {
    vi.mocked(findPlaces).mockResolvedValue([]);
    expect(result(await run())?.merchants).toEqual([]);
    expect(await getJson(DENSITY_KEY)).toEqual({ count: 0, complete: true });
    expect(await getJson(RUN_KEY)).toMatchObject({ complete: true });
    vi.mocked(findPlaces).mockClear();
    expect(result(await run())?.merchants).toEqual([]); expect(findPlaces).not.toHaveBeenCalled();
  });

  it("keeps a healthy branch when another branch fails without writing partial density", async () => {
    const request = { ...FAKE_RUN_REQUEST, branches: [...FAKE_RUN_REQUEST.branches, { ...FAKE_RUN_REQUEST.branches[0], id: "failed", name: "Fake failed branch", lat: 40 }] };
    vi.mocked(findPlaces).mockImplementation(async (query) => {
      if (query.lat === 40) throw new Error("private branch failure");
      return PLACES;
    });
    expect(result(await run(request))?.merchants).toHaveLength(10);
    expect(await getJson(cacheKey("run", request))).toBeNull(); expect(await getJson(DENSITY_KEY)).toBeNull();
    expect(findPlaces).toHaveBeenCalledTimes(4);
  });

  it("does not cache a missing confirmed category even when another category succeeded", async () => {
    const request = { ...FAKE_RUN_REQUEST, categories: [...FAKE_RUN_REQUEST.categories, { tagId: "urn:tag:category:place:hospital", label: "Hospital" }] };
    expect(result(await run(request))?.categories[1].status).toBe("incomplete");
    expect(await getJson(cacheKey("run", request))).toBeNull();
  });

  it("does not cache incomplete chain checks", async () => {
    vi.mocked(searchBrandExact).mockRejectedValue(new Error("private brand failure"));
    expect(result(await run())?.merchants).toHaveLength(10);
    expect(await getJson(RUN_KEY)).toBeNull();
  });
});
