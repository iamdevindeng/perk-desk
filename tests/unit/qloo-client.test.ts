// Verifies Qloo transport security, pacing, error mapping, and validated slim caching.
// Called by: npm test; all network and environment access is mocked
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { QLOO_BASE_URL_DEFAULT, QLOO_CACHE_TTL_S, QLOO_MIN_GAP_MS, QLOO_RETRY_AFTER_MS } from "@/lib/config";

const mocks = vi.hoisted(() => ({
  environment: { QLOO_API_KEY: "fake-test-placeholder" as string | undefined, QLOO_BASE_URL: "https://hackathon.api.qloo.com" },
  getJson: vi.fn(), setJson: vi.fn(), values: new Map<string, unknown>(),
}));
vi.mock("@/lib/env", () => ({ getEnv: () => mocks.environment }));
vi.mock("@/lib/store/cache", () => ({ getJson: mocks.getJson, setJson: mocks.setJson }));

let client: typeof import("@/lib/qloo/client");
const fetchMock = vi.fn<typeof fetch>();
const SlimSchema = z.object({ name: z.string() });

function slimName(raw: unknown): z.infer<typeof SlimSchema> {
  const response = z.object({ names: z.array(z.string()) }).parse(raw);
  return { name: response.names[0] };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  mocks.environment.QLOO_API_KEY = "fake-test-placeholder";
  mocks.environment.QLOO_BASE_URL = QLOO_BASE_URL_DEFAULT;
  mocks.values.clear();
  mocks.getJson.mockImplementation(async (key: string) => mocks.values.get(key) ?? null);
  mocks.setJson.mockImplementation(async (key: string, value: unknown) => { mocks.values.set(key, value); });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  client = await import("@/lib/qloo/client");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Qloo transport", () => {
  it("sorts parameters and sends the placeholder only in its header, with redirects blocked", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ results: [] }));
    await client.qlooGet("/search", { take: 3, query: "Fake Coffee Co", types: "urn:entity:brand" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${QLOO_BASE_URL_DEFAULT}/search?query=Fake+Coffee+Co&take=3&types=urn%3Aentity%3Abrand`);
    expect(String(url)).not.toContain("fake-test-placeholder");
    expect(options?.headers).toEqual({ "X-Api-Key": "fake-test-placeholder" });
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(["https://example.invalid", "http://hackathon.api.qloo.com", "https://user:pass@hackathon.api.qloo.com", "invalid"])("rejects unsafe base URL %s", async (baseUrl) => {
    mocks.environment.QLOO_BASE_URL = baseUrl;
    await expect(client.qlooGet("/search", {})).rejects.toMatchObject({ code: "config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing credentials before fetching", async () => {
    mocks.environment.QLOO_API_KEY = undefined;
    await expect(client.qlooGet("/search", {})).rejects.toMatchObject({ code: "config", status: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ status: 401, code: "auth" }, { status: 403, code: "auth" }, { status: 400, code: "bad_request" }, { status: 500, code: "upstream" }])("maps HTTP $status to $code", async ({ status, code }) => {
    fetchMock.mockResolvedValueOnce(new Response("ignored error body", { status }));
    await expect(client.qlooGet("/search", {})).rejects.toMatchObject({ code, status });
  });

  it("retries one short-window rate limit after the configured delay", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 })).mockResolvedValueOnce(Response.json({ results: [] }));
    const result = client.qlooGet("/search", {});
    await vi.advanceTimersByTimeAsync(QLOO_RETRY_AFTER_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ results: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an exhausted monthly quota", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429, headers: { "x-month-ratelimit-remaining": "0" } }));
    await expect(client.qlooGet("/search", {})).rejects.toMatchObject({ code: "quota", status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops after the second short-window rate limit", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 429 }));
    const result = expect(client.qlooGet("/search", {})).rejects.toMatchObject({ code: "upstream", status: 429 });
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([{ errorName: "AbortError", code: "timeout" }, { errorName: "TimeoutError", code: "timeout" }, { errorName: "TypeError", code: "network" }])("maps $errorName without exposing its message", async ({ errorName, code }) => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("sensitive upstream text"), { name: errorName }));
    await expect(client.qlooGet("/search", {})).rejects.toMatchObject({ code, message: "Qloo is having trouble; try again in a minute." });
  });

  it("reserves separate start times for concurrent calls", async () => {
    const starts: number[] = [];
    fetchMock.mockImplementation(async () => { starts.push(Date.now()); return Response.json({ results: [] }); });
    const requests = Promise.all([client.qlooGet("/search", {}), client.qlooGet("/search", {}), client.qlooGet("/search", {})]);
    await vi.runAllTimersAsync();
    await requests;
    expect(starts).toEqual([0, QLOO_MIN_GAP_MS, QLOO_MIN_GAP_MS * 2]);
  });

  it("recognizes only structured Qloo errors", () => {
    expect(client.isQlooError(client.createQlooError("auth", 401, "Refused"))).toBe(true);
    expect(client.isQlooError(new Error("other"))).toBe(false);
    expect(client.isQlooError({ code: "auth", status: 401 })).toBe(false);
  });
});

describe("Qloo slim cache", () => {
  it("stores only slim data and reports a validated second call as cached", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ names: ["Fake Coffee Co"], rawOnly: "discard" }));
    const onCall = vi.fn();
    const first = await client.cachedQlooCall("/search", { query: "Fake Coffee Co" }, slimName, SlimSchema, { onCall });
    const second = await client.cachedQlooCall("/search", { query: "Fake Coffee Co" }, slimName, SlimSchema, { onCall });
    expect(first).toEqual({ name: "Fake Coffee Co" });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.setJson).toHaveBeenCalledWith(expect.stringMatching(/^pd:v1:qloo:/), { validated: true, value: first }, QLOO_CACHE_TTL_S);
    expect(onCall.mock.calls.map(([event]) => event.cached)).toEqual([false, true]);
  });

  it("treats malformed cached data as a miss", async () => {
    mocks.getJson.mockResolvedValueOnce({ name: 123 });
    fetchMock.mockResolvedValueOnce(Response.json({ names: ["Fake Coffee Co"] }));
    await expect(client.cachedQlooCall("/search", {}, slimName, SlimSchema)).resolves.toEqual({ name: "Fake Coffee Co" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed slim output before writing the cache", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ names: [] }));
    await expect(client.cachedQlooCall("/search", {}, slimName, SlimSchema)).rejects.toMatchObject({ code: "upstream" });
    expect(mocks.setJson).not.toHaveBeenCalled();
  });

  it("sanitizes exceptions thrown by a boundary parser", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ malformed: true }));
    await expect(client.cachedQlooCall("/search", {}, slimName, SlimSchema)).rejects.toMatchObject({ code: "upstream" });
    expect(mocks.setJson).not.toHaveBeenCalled();
  });
});
