// Verifies optional cache work stops promptly at a request deadline without exposing transport errors.
// Called by: npm test; Redis operations and environment values are fake
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { clearMemoryCacheForTests, getJson, setJson } from "@/lib/store/cache";

type FakeRedisOptions = { signal?: () => AbortSignal };
const mocked = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), construct: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: function (options: FakeRedisOptions) {
  mocked.construct(options);
  return { get: mocked.get, set: mocked.set };
} }));

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://cache.example.invalid");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-cache-token");
  resetEnvForTests(); clearMemoryCacheForTests();
  mocked.get.mockReset().mockResolvedValue({ value: "fake" });
  mocked.set.mockReset().mockResolvedValue("OK"); mocked.construct.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); resetEnvForTests(); clearMemoryCacheForTests(); });

it("does not start cache reads or writes with an already aborted signal", async () => {
  const controller = new AbortController(); controller.abort();
  expect(await getJson("fake-key", controller.signal)).toBeNull();
  await expect(setJson("fake-key", 1, 60, controller.signal)).resolves.toBeUndefined();
  expect(mocked.construct).not.toHaveBeenCalled(); expect(mocked.get).not.toHaveBeenCalled(); expect(mocked.set).not.toHaveBeenCalled();
  expect(console.warn).not.toHaveBeenCalled();
});

it("uses isolated signal-aware clients while keeping the ordinary shared client", async () => {
  await getJson("ordinary-first"); await getJson("ordinary-second");
  const first = new AbortController(); const second = new AbortController();
  await getJson("first", first.signal); await setJson("second", 2, 60, second.signal);
  await getJson("ordinary-third");
  expect(mocked.construct).toHaveBeenCalledTimes(3);
  expect(mocked.construct.mock.calls[0][0].signal).toBeUndefined();
  expect(mocked.construct.mock.calls[1][0].signal()).toBe(first.signal);
  expect(mocked.construct.mock.calls[2][0].signal()).toBe(second.signal);
  expect(mocked.set).toHaveBeenCalledWith("second", 2, { ex: 60 });
});

it("returns a cache miss on abort even if the Redis request stays pending", async () => {
  const controller = new AbortController();
  mocked.get.mockImplementation(async () => await new Promise(() => undefined));
  const pending = getJson("fake-key", controller.signal);
  expect(mocked.get).toHaveBeenCalledOnce(); controller.abort();
  expect(await pending).toBeNull();
  expect(mocked.construct.mock.calls[0][0].signal().aborted).toBe(true);
  expect(console.warn).not.toHaveBeenCalled();
});

it("returns from a pending cache write on abort and keeps the Redis signal aborted", async () => {
  const controller = new AbortController();
  mocked.set.mockImplementation(async () => await new Promise(() => undefined));
  const pending = setJson("fake-key", { value: "fake" }, 60, controller.signal);
  expect(mocked.set).toHaveBeenCalledOnce(); controller.abort();
  await expect(pending).resolves.toBeUndefined();
  expect(mocked.construct.mock.calls[0][0].signal().aborted).toBe(true);
  expect(console.warn).not.toHaveBeenCalled();
});

it("removes its abort listener after ordinary completion or failure", async () => {
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  expect(await getJson("fake-key", controller.signal)).toEqual({ value: "fake" });
  mocked.get.mockRejectedValueOnce(new Error("private fake error"));
  expect(await getJson("fake-key", controller.signal)).toBeNull();
  expect(remove).toHaveBeenCalledTimes(2);
  expect(console.warn).toHaveBeenCalledExactlyOnceWith("Cache unavailable; continuing without cached data.");
});

it("does not change memory cache values after an aborted write", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", ""); resetEnvForTests();
  await setJson("fake-key", "original", 60);
  const controller = new AbortController(); controller.abort();
  await setJson("fake-key", "replacement", 60, controller.signal);
  expect(await getJson("fake-key")).toBe("original");
  expect(await getJson("fake-key", controller.signal)).toBeNull();
});
