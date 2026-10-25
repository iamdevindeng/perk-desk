// Tests exact local budgets, mocked Upstash behavior, and forwarded IP selection without network calls.
// Called by: npm test
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRANCH_LOOKUP_LIMIT_GLOBAL, BRANCH_LOOKUP_LIMIT_PER_IP, SHARED_LIMIT_CONFIG_MESSAGE, SHARED_LIMIT_UNAVAILABLE_MESSAGE, PLAN_LIMIT_PER_IP, RATE_WINDOW_MS, RUN_LIMIT_GLOBAL, RUN_LIMIT_PER_IP } from "@/lib/config";
import { resetEnvForTests } from "@/lib/env";
import { checkLimit, getClientIp, resetMemoryLimitsForTests } from "@/lib/store/rate-limit";

const UPSTASH = vi.hoisted(() => ({ limit: vi.fn(), create: vi.fn(), fixedWindow: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: vi.fn(function () { return {}; }) }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: Object.assign(vi.fn(function (config: { prefix: string }) {
  UPSTASH.create(config);
  return { limit: (identifier: string) => UPSTASH.limit(config.prefix, identifier) };
}), { fixedWindow: UPSTASH.fixedWindow }) }));

beforeEach(() => {
  vi.clearAllMocks(); resetMemoryLimitsForTests();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("VERCEL_ENV", "development"); resetEnvForTests();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  UPSTASH.limit.mockReset().mockResolvedValue({ success: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); resetEnvForTests(); });

function enableRedis(): void {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-redis-token"); resetEnvForTests();
}

describe("daily budgets", () => {
  it("allows exactly 10 run requests per IP and keeps plan scope separate", async () => {
    for (let index = 0; index < RUN_LIMIT_PER_IP; index++) expect(await checkLimit("run", "fake-ip")).toEqual({ ok: true });
    expect(await checkLimit("run", "fake-ip")).toEqual({ ok: false, reason: "ip" });
    expect(await checkLimit("run", "another-ip")).toEqual({ ok: true });
    for (let index = 0; index < PLAN_LIMIT_PER_IP; index++) expect(await checkLimit("plan", "fake-ip")).toEqual({ ok: true });
    expect(await checkLimit("plan", "fake-ip")).toEqual({ ok: false, reason: "ip" });
  });

  it("enforces the exact global budget across distinct IPs", async () => {
    for (let index = 0; index < RUN_LIMIT_GLOBAL; index++) expect(await checkLimit("run", `fake-ip-${index}`)).toEqual({ ok: true });
    expect(await checkLimit("run", "new-ip")).toEqual({ ok: false, reason: "global" });
  });

  it("does not charge global usage for IP-blocked attempts", async () => {
    for (let index = 0; index <= RUN_LIMIT_PER_IP; index++) await checkLimit("run", "fake-ip");
    for (let index = RUN_LIMIT_PER_IP; index < RUN_LIMIT_GLOBAL; index++) expect(await checkLimit("run", `fake-ip-${index}`)).toEqual({ ok: true });
    expect(await checkLimit("run", "new-ip")).toEqual({ ok: false, reason: "global" });
  });

  it("starts a fresh fixed window exactly 24 hours after the first request", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    for (let index = 0; index < RUN_LIMIT_PER_IP; index++) await checkLimit("run", "fake-ip");
    vi.setSystemTime(1000 + RATE_WINDOW_MS - 1);
    expect((await checkLimit("run", "fake-ip")).ok).toBe(false);
    vi.setSystemTime(1000 + RATE_WINDOW_MS);
    expect(await checkLimit("run", "fake-ip")).toEqual({ ok: true });
  });

  it("uses fixed-window Upstash prefixes and does not call global after IP rejection", async () => {
    enableRedis();
    await checkLimit("run", "fake-ip");
    expect(UPSTASH.fixedWindow).toHaveBeenCalledWith(RUN_LIMIT_PER_IP, "1 d");
    expect(UPSTASH.fixedWindow).toHaveBeenCalledWith(RUN_LIMIT_GLOBAL, "1 d");
    expect(UPSTASH.limit.mock.calls).toEqual([["pd:v1:rl:run:ip", "fake-ip"], ["pd:v1:rl:run:global", "all"]]);
    expect(UPSTASH.create).toHaveBeenCalledWith(expect.objectContaining({ analytics: false }));
    UPSTASH.limit.mockClear().mockResolvedValue({ success: false });
    expect(await checkLimit("run", "fake-ip")).toEqual({ ok: false, reason: "ip" });
    expect(UPSTASH.limit).toHaveBeenCalledOnce();
  });

  it("keeps observed usage during Redis failure and treats timeout success as a local fallback", async () => {
    enableRedis(); const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let index = 0; index < RUN_LIMIT_PER_IP; index++) await checkLimit("run", "fake-ip");
    UPSTASH.limit.mockRejectedValueOnce(new Error("private service token"));
    expect(await checkLimit("run", "fake-ip")).toEqual({ ok: false, reason: "ip" });
    UPSTASH.limit.mockResolvedValue({ success: true, reason: "timeout" });
    expect(await checkLimit("run", "fake-ip")).toEqual({ ok: false, reason: "ip" });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private service token");
  });

  it("keeps a Redis IP denial during an outage until the shared reset", async () => {
    enableRedis(); vi.useFakeTimers(); vi.setSystemTime(1000);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    UPSTASH.limit.mockResolvedValueOnce({ success: false, remaining: 0, reset: 2000 });
    expect(await checkLimit("run", "fake-ip")).toEqual({ ok: false, reason: "ip" });
    UPSTASH.limit.mockRejectedValue(new Error("Redis unavailable"));
    expect(await checkLimit("run", "fake-ip")).toEqual({ ok: false, reason: "ip" });
    vi.setSystemTime(2000);
    expect(await checkLimit("run", "fake-ip")).toEqual({ ok: true });
  });

  it("keeps a shared global denial during an outage without reopening the budget", async () => {
    enableRedis(); vi.spyOn(console, "warn").mockImplementation(() => undefined);
    UPSTASH.limit.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, remaining: 0, reset: Date.now() + RATE_WINDOW_MS });
    expect(await checkLimit("run", "new-ip")).toEqual({ ok: false, reason: "global" });
    UPSTASH.limit.mockRejectedValue(new Error("Redis unavailable"));
    expect(await checkLimit("run", "another-ip")).toEqual({ ok: false, reason: "global" });
  });

  it("remembers the last accepted shared token even before a denial occurs", async () => {
    enableRedis(); vi.spyOn(console, "warn").mockImplementation(() => undefined);
    UPSTASH.limit.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: true, remaining: 0, reset: Date.now() + RATE_WINDOW_MS });
    expect(await checkLimit("run", "new-ip")).toEqual({ ok: true });
    UPSTASH.limit.mockRejectedValue(new Error("Redis unavailable"));
    expect(await checkLimit("run", "another-ip")).toEqual({ ok: false, reason: "global" });
  });
});

describe("request metadata", () => {
  it("uses the first forwarded IP, then real IP, then unknown", () => {
    expect(getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": " first-ip, second-ip", "x-real-ip": "third-ip" } }))).toBe("first-ip");
    expect(getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": " ", "x-real-ip": "third-ip" } }))).toBe("third-ip");
    expect(getClientIp(new Request("http://localhost"))).toBe("unknown");
  });

});


describe("branch lookup budgets", () => {
  it("allows exactly 30 branch lookups per IP with a separate plan budget", async () => {
    for (let index = 0; index < BRANCH_LOOKUP_LIMIT_PER_IP; index++) expect(await checkLimit("branches", "fake-ip")).toEqual({ ok: true });
    expect(await checkLimit("branches", "fake-ip")).toEqual({ ok: false, reason: "ip" });
    expect(await checkLimit("plan", "fake-ip")).toEqual({ ok: true });
  });

  it("allows exactly 300 branch lookups across distinct IPs", async () => {
    for (let index = 0; index < BRANCH_LOOKUP_LIMIT_GLOBAL; index++) expect(await checkLimit("branches", `fake-ip-${index}`)).toEqual({ ok: true });
    expect(await checkLimit("branches", "new-ip")).toEqual({ ok: false, reason: "global" });
  });

  it("uses its own Upstash prefixes and limits", async () => {
    enableRedis(); await checkLimit("branches", "fake-ip");
    expect(UPSTASH.fixedWindow).toHaveBeenCalledWith(30, "1 d");
    expect(UPSTASH.fixedWindow).toHaveBeenCalledWith(300, "1 d");
    expect(UPSTASH.limit.mock.calls).toEqual([["pd:v1:rl:branches:ip", "fake-ip"], ["pd:v1:rl:branches:global", "all"]]);
  });

  it("fails closed in production for missing or unavailable shared stores", async () => {
    vi.stubEnv("VERCEL_ENV", "production"); resetEnvForTests();
    expect(await checkLimit("branches", "fake-ip")).toEqual({ ok: false, reason: "store", message: SHARED_LIMIT_CONFIG_MESSAGE });
    enableRedis(); UPSTASH.limit.mockRejectedValue(new Error("fake unavailable store"));
    expect(await checkLimit("branches", "fake-ip")).toEqual({ ok: false, reason: "store", message: SHARED_LIMIT_UNAVAILABLE_MESSAGE });
    UPSTASH.limit.mockResolvedValue({ success: true, reason: "timeout" });
    expect(await checkLimit("branches", "fake-ip")).toEqual({ ok: false, reason: "store", message: SHARED_LIMIT_UNAVAILABLE_MESSAGE });
  });
});
