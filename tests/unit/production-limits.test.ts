// Verifies production shared-store failures block live work before HTTP streaming.
// Called by: npm test; provider work and Redis transport are mocked
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as planPost } from "@/app/api/plan/route";
import { POST as runPost } from "@/app/api/run/route";
import { expandPlanRequest, runPlan } from "@/lib/agent/plan-agent";
import { runResearch } from "@/lib/agent/run-agent";
import { PLAN_LIMIT_GLOBAL, RUN_LIMIT_GLOBAL, SHARED_LIMIT_CONFIG_MESSAGE, SHARED_LIMIT_UNAVAILABLE_MESSAGE } from "@/lib/config";
import { resetEnvForTests } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { clearMemoryCacheForTests, setJson } from "@/lib/store/cache";
import { checkLimit, resetMemoryLimitsForTests } from "@/lib/store/rate-limit";
import { FAKE_PLAN_REQUEST, FAKE_PLAN_RESPONSE, FAKE_RUN_REQUEST, FAKE_RUN_RESULT } from "../fixtures/fake-plan";

const UPSTASH = vi.hoisted(() => ({ limit: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: vi.fn(function () { return { get: UPSTASH.get, set: UPSTASH.set }; }) }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: Object.assign(vi.fn(function (config: { prefix: string }) {
  return { limit: (identifier: string) => UPSTASH.limit(config.prefix, identifier) };
}), { fixedWindow: vi.fn() }) }));
vi.mock("@/lib/agent/plan-agent", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/agent/plan-agent")>(), runPlan: vi.fn(),
}));
vi.mock("@/lib/agent/run-agent", () => ({ runResearch: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("QLOO_API_KEY", "fake-qloo-key");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("JUDGE_BYPASS_CODE", "fake-judge-code");
  resetEnvForTests(); clearMemoryCacheForTests(); resetMemoryLimitsForTests();
  vi.mocked(runPlan).mockReset().mockResolvedValue(FAKE_PLAN_RESPONSE);
  vi.mocked(runResearch).mockReset().mockResolvedValue(FAKE_RUN_RESULT);
  UPSTASH.limit.mockReset().mockResolvedValue({ success: true });
  UPSTASH.get.mockReset().mockResolvedValue(null); UPSTASH.set.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); resetEnvForTests(); });

function configureStore(url = "https://fake.example", token = "fake-store-token"): void {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", url); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token); resetEnvForTests();
}

function request(scope: "plan" | "run", preset = false, judge = false): Request {
  const body = scope === "plan" ? FAKE_PLAN_REQUEST : FAKE_RUN_REQUEST;
  return new Request(`http://localhost/api/${scope}`, { method: "POST",
    body: JSON.stringify({ ...body, ...(preset ? { presetId: "denver-demo" } : {}) }),
    headers: { "x-forwarded-for": "fake-private-ip", ...(judge ? { "x-judge-code": "fake-judge-code" } : {}) },
  });
}

describe.each(["plan", "run"] as const)("%s shared production budget", (scope) => {
  const post = scope === "plan" ? planPost : runPost;

  it.each([["", ""], ["https://fake.example", ""], ["", "fake-store-token"], [" ", " "]])(
    "returns HTTP 503 for missing credentials (%j, %j), even for judges and cold presets", async (url, token) => {
      configureStore(url, token);
      for (const [preset, judge] of [[false, false], [false, true], [true, false]]) {
        const response = await post(request(scope, preset, judge));
        expect(response.status).toBe(503);
        expect(response.headers.get("content-type")).toContain("application/json");
        expect(await response.json()).toEqual({ error: "config", message: SHARED_LIMIT_CONFIG_MESSAGE });
      }
      expect(runPlan).not.toHaveBeenCalled(); expect(runResearch).not.toHaveBeenCalled();
      expect(UPSTASH.limit).not.toHaveBeenCalled(); expect(console.info).not.toHaveBeenCalled();
    },
  );

  it("serves cached demo presets with exhausted budgets and no store or provider key", async () => {
    vi.stubEnv("VERCEL_ENV", "development"); vi.stubEnv("QLOO_API_KEY", ""); resetEnvForTests();
    const maximum = scope === "plan" ? PLAN_LIMIT_GLOBAL : RUN_LIMIT_GLOBAL;
    for (let index = 0; index < maximum; index++) await checkLimit(scope, "fake-private-ip", { skipIp: true });
    expect(await checkLimit(scope, "fake-private-ip", { skipIp: true })).toEqual({ ok: false, reason: "global" });
    const input = scope === "plan" ? expandPlanRequest({ ...FAKE_PLAN_REQUEST, presetId: "denver-demo" }) : { ...FAKE_RUN_REQUEST, presetId: "denver-demo" };
    const value = scope === "plan" ? FAKE_PLAN_RESPONSE : { complete: true, events: [{ type: "result", at: 0, result: FAKE_RUN_RESULT }] };
    await setJson(cacheKey(scope, input), value, 60);
    vi.stubEnv("VERCEL_ENV", "production"); resetEnvForTests();
    const response = await post(request(scope, true));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(scope === "plan" ? '"categories"' : '"type":"result"');
    expect(runPlan).not.toHaveBeenCalled(); expect(runResearch).not.toHaveBeenCalled();
    expect(UPSTASH.limit).not.toHaveBeenCalled(); expect(console.info).not.toHaveBeenCalled();
  });

  it.each(["development", "preview", ""])("keeps the memory budget in %j", async (environment) => {
    vi.stubEnv("VERCEL_ENV", environment); resetEnvForTests();
    const response = await post(request(scope));
    expect(response.status).toBe(200); await response.text();
    expect(scope === "plan" ? runPlan : runResearch).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Rate limit service unavailable; using local limits.");
    const maximum = scope === "plan" ? PLAN_LIMIT_GLOBAL : RUN_LIMIT_GLOBAL;
    for (let index = 1; index < maximum; index++) expect(await checkLimit(scope, "fake-private-ip", { skipIp: true })).toEqual({ ok: true });
    expect(await checkLimit(scope, "fake-private-ip", { skipIp: true })).toEqual({ ok: false, reason: "global" });
  });

  it.each(["ip", "global"])("fails closed on Redis %s exceptions and fail-open timeouts", async (kind) => {
    configureStore();
    for (const timeout of [false, true]) {
      UPSTASH.limit.mockImplementation(async (prefix: string) => {
        if (!prefix.endsWith(`:${kind}`)) return { success: true };
        if (timeout) return { success: true, reason: "timeout" };
        throw new Error("private store token detail");
      });
      const response = await post(request(scope, false, kind === "global"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "config", message: SHARED_LIMIT_UNAVAILABLE_MESSAGE });
    }
    expect(runPlan).not.toHaveBeenCalled(); expect(runResearch).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled(); expect(console.info).not.toHaveBeenCalled();
    UPSTASH.limit.mockResolvedValue({ success: true });
    const recovered = await post(request(scope));
    expect(recovered.status).toBe(200); await recovered.text();
    expect(scope === "plan" ? runPlan : runResearch).toHaveBeenCalledOnce();
  });

  it("keeps preview fallback and its warning after a shared-store outage", async () => {
    configureStore(); vi.stubEnv("VERCEL_ENV", "preview"); resetEnvForTests();
    UPSTASH.limit.mockRejectedValue(new Error("private store token detail"));
    const response = await post(request(scope));
    expect(response.status).toBe(200); await response.text();
    expect(scope === "plan" ? runPlan : runResearch).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Rate limit service unavailable; using local limits.");
  });
});
