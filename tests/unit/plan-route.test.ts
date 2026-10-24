// Checks planning HTTP validation, preset cache identity, and sanitized service failures.
// Called by: npm test
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, maxDuration } from "@/app/api/plan/route";
import { expandPlanRequest, runPlan } from "@/lib/agent/plan-agent";
import { RESULT_TTL_S } from "@/lib/config";
import { findPreset } from "@/lib/data";
import { resetEnvForTests } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { createQlooError, type QlooErrorCode } from "@/lib/qloo/client";
import { getJson, setJson } from "@/lib/store/cache";
import { checkLimit } from "@/lib/store/rate-limit";
import { PlanResponseSchema } from "@/lib/types";
import { FAKE_PLAN_REQUEST, FAKE_PLAN_RESPONSE } from "../fixtures/fake-plan";

vi.mock("@/lib/agent/plan-agent", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/agent/plan-agent")>(), runPlan: vi.fn(),
}));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(), setJson: vi.fn() }));
vi.mock("@/lib/store/rate-limit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/store/rate-limit")>(), checkLimit: vi.fn(),
}));

function request(body: unknown): Request {
  return new Request("http://localhost/api/plan", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.mocked(runPlan).mockReset().mockResolvedValue(FAKE_PLAN_RESPONSE);
  vi.mocked(getJson).mockReset().mockResolvedValue(null);
  vi.mocked(setJson).mockReset().mockResolvedValue(undefined);
  vi.mocked(checkLimit).mockReset().mockResolvedValue({ ok: true });
  vi.stubEnv("QLOO_API_KEY", "fake-route-key");
  vi.stubEnv("JUDGE_BYPASS_CODE", "");
  resetEnvForTests();
});

afterEach(() => { vi.unstubAllEnvs(); resetEnvForTests(); });

describe("plan route validation", () => {
  it("returns a schema-valid plan and caches it with the canonical request", async () => {
    const response = await POST(request(FAKE_PLAN_REQUEST));
    expect(response.status).toBe(200);
    expect(PlanResponseSchema.parse(await response.json())).toEqual(FAKE_PLAN_RESPONSE);
    expect(runPlan).toHaveBeenCalledWith(FAKE_PLAN_REQUEST, {});
    expect(setJson).toHaveBeenCalledWith(cacheKey("plan", FAKE_PLAN_REQUEST), FAKE_PLAN_RESPONSE, RESULT_TTL_S);
    expect(maxDuration).toBe(300);
  });

  it.each([{}, null, [], { ...FAKE_PLAN_REQUEST, brandNames: [] }])("rejects an invalid body before reading cache", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request", issues: expect.any(Array) });
    expect(getJson).not.toHaveBeenCalled();
    expect(runPlan).not.toHaveBeenCalled();
  });

  it("treats malformed JSON as a bad request without echoing its contents", async () => {
    const response = await POST(new Request("http://localhost/api/plan", { method: "POST", body: "private malformed input" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_request", issues: [{ path: [], code: "invalid_json" }] });
  });

  it("does not echo user record keys in validation details", async () => {
    const response = await POST(request({ ...FAKE_PLAN_REQUEST, brandOverrides: { "private user value": 42 } }));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private user value");
  });

  it("returns config 503 for a cache miss when the Qloo key is missing", async () => {
    vi.stubEnv("QLOO_API_KEY", ""); resetEnvForTests();
    const response = await POST(request(FAKE_PLAN_REQUEST));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "config", message: "Server is missing its Qloo key." });
    expect(runPlan).not.toHaveBeenCalled();
  });
});

describe("preset expansion and cache", () => {
  it("loads preset profile and brands while retaining user preferences and brand overrides", async () => {
    const input = {
      ...FAKE_PLAN_REQUEST, presetId: "denver-demo", preferences: { removed: ["urn:tag:category:place:cafe"], added: [] },
      brandOverrides: { REI: "00000000-0000-4000-8000-000000000001" },
    };
    await POST(request(input));
    const expanded = expandPlanRequest(input);
    const preset = findPreset("denver-demo")!;
    expect(vi.mocked(runPlan).mock.calls[0][0]).toEqual(expanded);
    expect(expanded.institutionName).toBe(preset.profile.institutionName);
    expect(expanded.branches).toEqual(preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })));
    expect(expanded.brandNames).not.toEqual(input.brandNames);
    expect(expanded.preferences).toEqual(input.preferences);
    expect(expanded.brandOverrides).toEqual(input.brandOverrides);
    expect(getJson).toHaveBeenCalledWith(cacheKey("plan", expanded));
  });

  it("ignores altered preset profile fields when building the cache key", async () => {
    const input = { ...FAKE_PLAN_REQUEST, presetId: "denver-demo" };
    await POST(request(input));
    await POST(request({ ...input, city: "Austin, TX", institutionName: "Changed CU", brandNames: ["Different Brand"] }));
    expect(vi.mocked(getJson).mock.calls[0][0]).toBe(vi.mocked(getJson).mock.calls[1][0]);
  });

  it("rejects an unknown preset without calling the agent", async () => {
    const response = await POST(request({ ...FAKE_PLAN_REQUEST, presetId: "unknown-demo" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(runPlan).not.toHaveBeenCalled();
  });

  it("serves a valid cached plan even when no Qloo key is configured", async () => {
    vi.stubEnv("QLOO_API_KEY", ""); resetEnvForTests();
    vi.mocked(getJson).mockResolvedValue({ ...FAKE_PLAN_RESPONSE, ignoredField: "discard" });
    const response = await POST(request(FAKE_PLAN_REQUEST));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(FAKE_PLAN_RESPONSE);
    expect(runPlan).not.toHaveBeenCalled();
    expect(setJson).not.toHaveBeenCalled();
    expect(checkLimit).not.toHaveBeenCalled();
  });

  it.each([{ broken: true }, { ...FAKE_PLAN_RESPONSE, categories: [] }])("treats unusable cached plans as a miss", async (stored) => {
    vi.mocked(getJson).mockResolvedValue(stored);
    expect((await POST(request(FAKE_PLAN_REQUEST))).status).toBe(200);
    expect(runPlan).toHaveBeenCalledOnce();
  });

  it("refreshes legacy plans whose evidence has no explicit kind", async () => {
    const category = FAKE_PLAN_RESPONSE.categories[0];
    const legacyEvidence = Object.fromEntries(Object.entries(category.evidence[0]).filter(([key]) => key !== "kind"));
    vi.mocked(getJson).mockResolvedValue({ ...FAKE_PLAN_RESPONSE, categories: [{ ...category, evidence: [legacyEvidence] }] });
    expect((await POST(request(FAKE_PLAN_REQUEST))).status).toBe(200);
    expect(runPlan).toHaveBeenCalledOnce();
    expect(setJson).toHaveBeenCalledWith(cacheKey("plan", FAKE_PLAN_REQUEST), FAKE_PLAN_RESPONSE, RESULT_TTL_S);
  });

  it("does not cache plans with no categories", async () => {
    vi.mocked(runPlan).mockResolvedValue({ ...FAKE_PLAN_RESPONSE, categories: [] });
    expect((await POST(request(FAKE_PLAN_REQUEST))).status).toBe(200);
    expect(setJson).not.toHaveBeenCalled();
  });
});

describe("plan request limits", () => {
  it("returns a valid limited response without running or caching a plan", async () => {
    vi.mocked(checkLimit).mockResolvedValue({ ok: false, reason: "ip" });
    const response = await POST(request(FAKE_PLAN_REQUEST));
    expect(response.status).toBe(200);
    expect(PlanResponseSchema.parse(await response.json())).toMatchObject({ limited: true, categories: [] });
    expect(runPlan).not.toHaveBeenCalled();
    expect(setJson).not.toHaveBeenCalled();
  });

  it("skips only per-IP limits for canonical presets", async () => {
    await POST(request({ ...FAKE_PLAN_REQUEST, presetId: "denver-demo" }));
    expect(checkLimit).toHaveBeenCalledWith("plan", "unknown", { skipIp: true });
  });

  it("skips only the per-IP limit for a valid judge code", async () => {
    vi.stubEnv("JUDGE_BYPASS_CODE", "fake-judge-code"); resetEnvForTests();
    const input = request(FAKE_PLAN_REQUEST); input.headers.set("x-judge-code", "fake-judge-code");
    expect((await POST(input)).status).toBe(200);
    expect(checkLimit).toHaveBeenCalledWith("plan", "unknown", { skipIp: true });
    vi.mocked(checkLimit).mockResolvedValue({ ok: false, reason: "global" });
    const blocked = request(FAKE_PLAN_REQUEST); blocked.headers.set("x-judge-code", "fake-judge-code");
    expect(await (await POST(blocked)).json()).toMatchObject({ limited: true });
    expect(runPlan).toHaveBeenCalledOnce();
  });
});

describe("safe plan errors", () => {
  const cases: { code: QlooErrorCode; status: number; responseCode: string }[] = [
    { code: "config", status: 503, responseCode: "config" }, { code: "auth", status: 502, responseCode: "auth" },
    { code: "quota", status: 503, responseCode: "quota" }, { code: "timeout", status: 502, responseCode: "upstream" },
    { code: "network", status: 502, responseCode: "upstream" }, { code: "upstream", status: 502, responseCode: "upstream" },
    { code: "bad_request", status: 502, responseCode: "upstream" },
  ];
  it.each(cases)("maps $code to $status without leaking the upstream message", async ({ code, status, responseCode }) => {
    vi.mocked(runPlan).mockRejectedValue(createQlooError(code, 400, "private upstream detail fake-route-key"));
    const response = await POST(request(FAKE_PLAN_REQUEST));
    const body = await response.json();
    expect(response.status).toBe(status);
    expect(body.error).toBe(responseCode);
    expect(JSON.stringify(body)).not.toContain("private upstream detail");
    expect(JSON.stringify(body)).not.toContain("fake-route-key");
  });

  it("returns a static internal error for unexpected exceptions", async () => {
    vi.mocked(runPlan).mockRejectedValue(new Error("private internal detail"));
    const response = await POST(request(FAKE_PLAN_REQUEST));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal", message: "Something went wrong." });
    expect(setJson).not.toHaveBeenCalled();
  });

  it("validates agent output before returning or caching it", async () => {
    vi.mocked(runPlan).mockResolvedValue({
      ...FAKE_PLAN_RESPONSE, categories: [{ ...FAKE_PLAN_RESPONSE.categories[0], tagId: "not-a-category" }],
    });
    const response = await POST(request(FAKE_PLAN_REQUEST));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal", message: "Something went wrong." });
    expect(setJson).not.toHaveBeenCalled();
  });
});
