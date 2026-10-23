// Checks cache expiry, isolation, and safe Redis failures without network access.
// Called by: npm test
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemoryCacheForTests, getJson, setJson } from "@/lib/store/cache";
import { resetEnvForTests } from "@/lib/env";

const mocked = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), construct: vi.fn() }));
vi.mock("@upstash/redis", () => ({
  Redis: function () {
    mocked.construct();
    return { get: mocked.get, set: mocked.set };
  },
}));

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  resetEnvForTests();
  clearMemoryCacheForTests();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetEnvForTests();
  clearMemoryCacheForTests();
});

describe("memory cache", () => {
  it("returns null on misses and expires values at their TTL", async () => {
    vi.useFakeTimers();
    expect(await getJson("missing")).toBeNull();
    await setJson("test", { count: 1 }, 2);
    expect(await getJson("test")).toEqual({ count: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await getJson("test")).toBeNull();
    expect(mocked.construct).not.toHaveBeenCalled();
  });
  it("does not share mutable objects with callers", async () => {
    const value = { count: 1 };
    await setJson("test", value, 20);
    value.count = 2;
    const cached = await getJson("test") as { count: number };
    cached.count = 3;
    expect(await getJson("test")).toEqual({ count: 1 });
  });
  it("clears cached values for isolated tests", async () => {
    await setJson("test", 1, 20);
    clearMemoryCacheForTests();
    expect(await getJson("test")).toBeNull();
  });
});

describe("optional Redis", () => {
  function enableRedis(): void {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://cache.example.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-cache-token");
    resetEnvForTests();
  }
  it("constructs a client lazily and passes a TTL", async () => {
    enableRedis();
    expect(mocked.construct).not.toHaveBeenCalled();
    mocked.get.mockResolvedValue({ count: 2 });
    await setJson("test", { count: 2 }, 30);
    expect(mocked.set).toHaveBeenCalledWith("test", { count: 2 }, { ex: 30 });
    expect(await getJson("test")).toEqual({ count: 2 });
    expect(mocked.construct).toHaveBeenCalledTimes(1);
  });
  it("treats service failures as misses and logs only a fixed warning once", async () => {
    enableRedis();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocked.get.mockRejectedValue(new Error("fake-sensitive-upstream-detail"));
    mocked.set.mockRejectedValue(new Error("fake-sensitive-upstream-detail"));
    expect(await getJson("test")).toBeNull();
    await expect(setJson("test", 1, 30)).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledExactlyOnceWith("Cache unavailable; continuing without cached data.");
  });
});
