// Tests exact local budgets, mocked Upstash behavior, and request exemption checks without network calls.
// Called by: npm test
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expandPlanRequest } from "@/lib/agent/plan-agent";
import { PLAN_LIMIT_PER_IP, RATE_WINDOW_MS, RUN_LIMIT_GLOBAL, RUN_LIMIT_PER_IP } from "@/lib/config";
import { findPreset } from "@/lib/data";
import { resetEnvForTests } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { getJson } from "@/lib/store/cache";
import { checkLimit, getClientIp, hasJudgeBypass, isPresetRun, resetMemoryLimitsForTests } from "@/lib/store/rate-limit";
import { RunRequestSchema, type RunRequest } from "@/lib/types";
import { FAKE_PLAN_REQUEST, FAKE_PLAN_RESPONSE, FAKE_RUN_REQUEST } from "../fixtures/fake-plan";

const UPSTASH = vi.hoisted(() => ({ limit: vi.fn(), create: vi.fn(), fixedWindow: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: vi.fn(function () { return {}; }) }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: Object.assign(vi.fn(function (config: { prefix: string }) {
  UPSTASH.create(config);
  return { limit: (identifier: string) => UPSTASH.limit(config.prefix, identifier) };
}), { fixedWindow: UPSTASH.fixedWindow }) }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks(); resetMemoryLimitsForTests();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("JUDGE_BYPASS_CODE", ""); resetEnvForTests();
  UPSTASH.limit.mockReset().mockResolvedValue({ success: true });
  vi.mocked(getJson).mockReset().mockResolvedValue(null);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); resetEnvForTests(); });

function enableRedis(): void {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.example");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-redis-token"); resetEnvForTests();
}

describe("daily budgets", () => {
  it("allows exactly 20 run requests per IP and keeps plan scope separate", async () => {
    for (let index = 0; index < RUN_LIMIT_PER_IP; index++) expect(await checkLimit("run", "fake-ip")).toEqual({ ok: true });
    expect(await checkLimit("run", "fake-ip")).toEqual({ ok: false, reason: "ip" });
    expect(await checkLimit("run", "another-ip")).toEqual({ ok: true });
    for (let index = 0; index < PLAN_LIMIT_PER_IP; index++) expect(await checkLimit("plan", "fake-ip")).toEqual({ ok: true });
    expect(await checkLimit("plan", "fake-ip")).toEqual({ ok: false, reason: "ip" });
  });

  it("skips only the per-IP limit for presets and still enforces the exact global budget", async () => {
    for (let index = 0; index < RUN_LIMIT_GLOBAL; index++) expect(await checkLimit("run", "preset-ip", { skipIp: true })).toEqual({ ok: true });
    expect(await checkLimit("run", "preset-ip", { skipIp: true })).toEqual({ ok: false, reason: "global" });
  });

  it("does not charge global usage for IP-blocked attempts", async () => {
    for (let index = 0; index <= RUN_LIMIT_PER_IP; index++) await checkLimit("run", "fake-ip");
    for (let index = RUN_LIMIT_PER_IP; index < RUN_LIMIT_GLOBAL; index++) expect(await checkLimit("run", "preset-ip", { skipIp: true })).toEqual({ ok: true });
    expect(await checkLimit("run", "preset-ip", { skipIp: true })).toEqual({ ok: false, reason: "global" });
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
    UPSTASH.limit.mockResolvedValueOnce({ success: false, remaining: 0, reset: Date.now() + RATE_WINDOW_MS });
    expect(await checkLimit("run", "preset-ip", { skipIp: true })).toEqual({ ok: false, reason: "global" });
    UPSTASH.limit.mockRejectedValue(new Error("Redis unavailable"));
    expect(await checkLimit("run", "another-ip", { skipIp: true })).toEqual({ ok: false, reason: "global" });
  });

  it("remembers the last accepted shared token even before a denial occurs", async () => {
    enableRedis(); vi.spyOn(console, "warn").mockImplementation(() => undefined);
    UPSTASH.limit.mockResolvedValueOnce({ success: true, remaining: 0, reset: Date.now() + RATE_WINDOW_MS });
    expect(await checkLimit("run", "preset-ip", { skipIp: true })).toEqual({ ok: true });
    UPSTASH.limit.mockRejectedValue(new Error("Redis unavailable"));
    expect(await checkLimit("run", "another-ip", { skipIp: true })).toEqual({ ok: false, reason: "global" });
  });
});

describe("request metadata", () => {
  it("uses the first forwarded IP, then real IP, then unknown", () => {
    expect(getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": " first-ip, second-ip", "x-real-ip": "third-ip" } }))).toBe("first-ip");
    expect(getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": " ", "x-real-ip": "third-ip" } }))).toBe("third-ip");
    expect(getClientIp(new Request("http://localhost"))).toBe("unknown");
  });

  it("requires a nonempty exact judge code on both sides", () => {
    expect(hasJudgeBypass(new Request("http://localhost"))).toBe(false);
    vi.stubEnv("JUDGE_BYPASS_CODE", "fake-judge-code"); resetEnvForTests();
    expect(hasJudgeBypass(new Request("http://localhost", { headers: { "x-judge-code": "fake-judge-code" } }))).toBe(true);
    expect(hasJudgeBypass(new Request("http://localhost", { headers: { "x-judge-code": "wrong-code" } }))).toBe(false);
  });
});

function presetRun(): RunRequest {
  const preset = findPreset("denver-demo")!;
  return RunRequestSchema.parse({ ...FAKE_RUN_REQUEST, presetId: preset.id, branches: preset.profile.branches });
}

describe("preset run validation", () => {
  it("matches canonical preset branches and cached resolved brand identity with case-insensitive names", async () => {
    const input = presetRun(); input.brands[0].name = input.brands[0].name.toUpperCase();
    vi.mocked(getJson).mockResolvedValue(FAKE_PLAN_RESPONSE);
    expect(await isPresetRun(input)).toBe(true);
    expect(getJson).toHaveBeenCalledWith(cacheKey("plan", expandPlanRequest({ ...FAKE_PLAN_REQUEST, presetId: "denver-demo" })));
  });

  it("rejects forged branches, duplicate branches, unknown presets, and absent cached plans", async () => {
    vi.mocked(getJson).mockResolvedValue(FAKE_PLAN_RESPONSE);
    const changed = presetRun(); changed.branches[0].radiusMeters += 1;
    expect(await isPresetRun(changed)).toBe(false);
    const duplicate = presetRun(); duplicate.branches[1] = duplicate.branches[0];
    expect(await isPresetRun(duplicate)).toBe(false);
    expect(await isPresetRun({ ...presetRun(), presetId: "unknown" })).toBe(false);
    vi.mocked(getJson).mockResolvedValue(null);
    expect(await isPresetRun(presetRun())).toBe(false);
  });

  it("rejects duplicate brands and forged IDs even when the brand name is allowed", async () => {
    vi.mocked(getJson).mockResolvedValue(FAKE_PLAN_RESPONSE);
    const duplicate = presetRun(); duplicate.brands.push(duplicate.brands[0]);
    expect(await isPresetRun(duplicate)).toBe(false);
    const changed = presetRun(); changed.brands[0].entityId = "00000000-0000-4000-8000-000000000099";
    expect(await isPresetRun(changed)).toBe(false);
  });
});
