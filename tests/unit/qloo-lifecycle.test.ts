// Verifies request cancellation, logical error reporting, and per-run circuit breaking in Qloo transport.
// Called by: npm test; fake timers and mocked fetch prevent provider calls
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { QLOO_MIN_GAP_MS, QLOO_RETRY_AFTER_MS } from "@/lib/config";
import { FAKE_RUN_REQUEST } from "../fixtures/fake-plan";

const cache = vi.hoisted(() => ({ getJson: vi.fn(), setJson: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({
  QLOO_API_KEY: "fake-test-placeholder", QLOO_BASE_URL: "https://hackathon.api.qloo.com",
}) }));
vi.mock("@/lib/store/cache", () => cache);

let client: typeof import("@/lib/qloo/client");
let contexts: typeof import("@/lib/agent/context");
const fetchMock = vi.fn<typeof fetch>();
const ValueSchema = z.object({ value: z.string() });

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(0);
  cache.getJson.mockReset().mockResolvedValue(null); cache.setJson.mockReset().mockResolvedValue(undefined);
  fetchMock.mockReset().mockImplementation(async () => Response.json({ value: "fake" }));
  vi.stubGlobal("fetch", fetchMock);
  client = await import("@/lib/qloo/client");
  contexts = await import("@/lib/agent/context");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("logical Qloo outcomes", () => {
  it("reports one transport failure through the cached wrapper", async () => {
    const onError = vi.fn();
    fetchMock.mockRejectedValue(new TypeError("private failure"));
    await expect(client.cachedQlooCall("/search", {}, ValueSchema.parse, ValueSchema, { onError })).rejects.toMatchObject({ code: "network" });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "network" }));
  });

  it("reports malformed live output once and never stores it", async () => {
    const onError = vi.fn();
    fetchMock.mockResolvedValue(Response.json({ value: 42 }));
    await expect(client.cachedQlooCall("/search", {}, ValueSchema.parse, ValueSchema, { onError })).rejects.toMatchObject({ code: "upstream" });
    expect(onError).toHaveBeenCalledOnce();
    expect(cache.setJson).not.toHaveBeenCalled();
  });

  it("reports one final retry failure but checks before each transport attempt", async () => {
    const onError = vi.fn(); const beforeCall = vi.fn();
    fetchMock.mockImplementation(async () => new Response(null, { status: 429 }));
    const result = expect(client.qlooGet("/search", {}, { onError, beforeCall })).rejects.toMatchObject({ code: "upstream" });
    await vi.runAllTimersAsync(); await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(beforeCall).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("checks the breaker after pacing and preserves its structured error without fetching", async () => {
    await client.qlooGet("/search", {});
    const beforeCall = vi.fn(() => { throw client.createQlooError("budget", null, "Research budget reached"); });
    const onError = vi.fn();
    const result = expect(client.qlooGet("/search", {}, { beforeCall, onError })).rejects.toMatchObject({ code: "budget" });
    await vi.advanceTimersByTimeAsync(QLOO_MIN_GAP_MS - 1);
    expect(beforeCall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await result;
    expect(beforeCall).toHaveBeenCalledOnce(); expect(onError).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("stops transport after three failed lookups in the same run", async () => {
    const context = contexts.createRunContext(FAKE_RUN_REQUEST);
    const options = contexts.contextQlooOptions(context);
    fetchMock.mockRejectedValue(Object.assign(new Error("fake timeout"), { name: "TimeoutError" }));
    for (let index = 0; index < 4; index++) {
      const result = expect(client.qlooGet("/search", {}, options)).rejects.toMatchObject({ code: "timeout" });
      await vi.runAllTimersAsync(); await result;
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(context).toMatchObject({ qlooDown: true, cacheable: false });
  });
});

describe("Qloo cancellation", () => {
  it("does not fetch an already aborted request", async () => {
    const controller = new AbortController(); controller.abort();
    const beforeCall = vi.fn(); const onError = vi.fn();
    await expect(client.qlooGet("/search", {}, { signal: controller.signal, beforeCall, onError })).rejects.toMatchObject({ code: "timeout" });
    expect(fetchMock).not.toHaveBeenCalled(); expect(beforeCall).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("cancels a paced lookup without a later transport attempt", async () => {
    await client.qlooGet("/search", {});
    const controller = new AbortController(); const beforeCall = vi.fn();
    const result = expect(client.qlooGet("/search", {}, { signal: controller.signal, beforeCall })).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(1); controller.abort();
    await result; await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledOnce(); expect(beforeCall).not.toHaveBeenCalled();
  });

  it("cancels a short-window retry delay without retrying", async () => {
    const controller = new AbortController(); const onError = vi.fn();
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    const result = expect(client.qlooGet("/search", {}, { signal: controller.signal, onError })).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(QLOO_RETRY_AFTER_MS - 1); controller.abort();
    await result; await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledOnce(); expect(onError).toHaveBeenCalledOnce();
  });

  it("passes the request signal to cache reads and writes", async () => {
    const controller = new AbortController();
    await client.cachedQlooCall("/search", {}, ValueSchema.parse, ValueSchema, { signal: controller.signal });
    expect(cache.getJson).toHaveBeenCalledWith(expect.any(String), controller.signal);
    expect(cache.setJson).toHaveBeenCalledWith(expect.any(String), { validated: true, value: { value: "fake" } },
      expect.any(Number), controller.signal);
  });

  it("does not cache a slim result when cancellation arrives during validation", async () => {
    const controller = new AbortController(); const onError = vi.fn();
    const slim = (raw: unknown): z.infer<typeof ValueSchema> => { controller.abort(); return ValueSchema.parse(raw); };
    await expect(client.cachedQlooCall("/search", {}, slim, ValueSchema, {
      signal: controller.signal, onError,
    })).rejects.toMatchObject({ code: "timeout" });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(onError).toHaveBeenCalledOnce();
    expect(cache.setJson).not.toHaveBeenCalled();
  });

  it("forwards cancellation through the cached wrapper to an in-flight fetch", async () => {
    const controller = new AbortController(); const onError = vi.fn(); const beforeCall = vi.fn();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("private abort reason")), { once: true });
    }));
    const result = expect(client.cachedQlooCall("/search", {}, ValueSchema.parse, ValueSchema,
      { signal: controller.signal, beforeCall, onError })).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(0); controller.abort();
    await result; await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledOnce(); expect(beforeCall).toHaveBeenCalledOnce(); expect(onError).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(cache.setJson).not.toHaveBeenCalled();
  });
});
