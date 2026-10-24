// Tests research request boundaries, cache replay, limits, and safe stream outcomes.
// Called by: npm test
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, maxDuration } from "@/app/api/run/route";
import { runResearch } from "@/lib/agent/run-agent";
import { RESULT_TTL_S } from "@/lib/config";
import { resetEnvForTests } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { createQlooError } from "@/lib/qloo/client";
import { getJson, setJson } from "@/lib/store/cache";
import { checkLimit, hasJudgeBypass, isPresetRun } from "@/lib/store/rate-limit";
import { TraceEventSchema, type TraceEvent } from "@/lib/types";
import { FAKE_RUN_REQUEST, FAKE_RUN_RESULT } from "../fixtures/fake-plan";

vi.mock("@/lib/agent/run-agent", () => ({ runResearch: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(), setJson: vi.fn() }));
vi.mock("@/lib/store/rate-limit", () => ({
  checkLimit: vi.fn(), getClientIp: () => "fake-ip", hasJudgeBypass: vi.fn(), isPresetRun: vi.fn(),
}));

function request(body: unknown = FAKE_RUN_REQUEST): Request {
  return new Request("http://localhost/api/run", { method: "POST", body: JSON.stringify(body) });
}

async function traceFor(body: unknown = FAKE_RUN_REQUEST): Promise<TraceEvent[]> {
  const response = await POST(request(body));
  return (await response.text()).trim().split("\n").map((line) => TraceEventSchema.parse(JSON.parse(line)));
}

beforeEach(() => {
  vi.mocked(runResearch).mockReset().mockImplementation(async (_request, emit, options) => {
    options?.onCacheable?.(true);
    emit({ type: "step", at: 0, step: "find_merchants", status: "start", summary: "Finding merchants" });
    return FAKE_RUN_RESULT;
  });
  vi.mocked(getJson).mockReset().mockResolvedValue(null);
  vi.mocked(setJson).mockReset().mockResolvedValue(undefined);
  vi.mocked(checkLimit).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(hasJudgeBypass).mockReset().mockReturnValue(false);
  vi.mocked(isPresetRun).mockReset().mockResolvedValue(false);
  vi.stubEnv("QLOO_API_KEY", "fake-run-key"); resetEnvForTests();
});
afterEach(() => { vi.unstubAllEnvs(); resetEnvForTests(); });

describe("run route boundaries", () => {
  it("streams steps, a result and done; caches events without done", async () => {
    const trace = await traceFor();
    expect(trace.map((event) => event.type)).toEqual(["step", "result", "done"]);
    expect(setJson).toHaveBeenCalledWith(cacheKey("run", FAKE_RUN_REQUEST), { complete: true, events: expect.any(Array) }, RESULT_TTL_S);
    const saved = vi.mocked(setJson).mock.calls[0][1] as { events: TraceEvent[] };
    expect(saved.events.map((event) => event.type)).toEqual(["step", "result"]);
    expect(checkLimit).toHaveBeenCalledWith("run", "fake-ip", { skipIp: false });
    expect(maxDuration).toBe(300);
  });

  it.each([{}, null, { ...FAKE_RUN_REQUEST, categories: [] }, { ...FAKE_RUN_REQUEST, brands: [] }])("returns 400 JSON before streaming invalid input", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(getJson).not.toHaveBeenCalled();
    expect(checkLimit).not.toHaveBeenCalled();
  });

  it.each([{ lat: 400 }, { lon: 1000 }, { lat: -91 }, { lon: -181 }])("rejects invalid coordinates before cache, limits, or research", async (point) => {
    const body = { ...FAKE_RUN_REQUEST, branches: [{ ...FAKE_RUN_REQUEST.branches[0], ...point }] };
    expect((await POST(request(body))).status).toBe(400);
    expect(getJson).not.toHaveBeenCalled(); expect(checkLimit).not.toHaveBeenCalled(); expect(runResearch).not.toHaveBeenCalled();
  });

  it("handles malformed JSON without returning its contents", async () => {
    const response = await POST(new Request("http://localhost/api/run", { method: "POST", body: "private broken body" }));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private broken body");
  });

  it.each(["urn:tag:category:place:music_school", "urn:tag:category:place:hospital", "urn:tag:genre:brand:coffee", "not-a-tag"])(
    "rejects disallowed category %s before cache, limits, or research", async (tagId) => {
      const response = await POST(request({ ...FAKE_RUN_REQUEST, categories: [{ tagId, label: "Coffee shop" }] }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_request",
        message: "Choose valid place categories that are allowed for merchant research.",
      });
      expect(getJson).not.toHaveBeenCalled(); expect(checkLimit).not.toHaveBeenCalled();
      expect(runResearch).not.toHaveBeenCalled(); expect(setJson).not.toHaveBeenCalled();
    },
  );

  it("streams a missing-key error with status 200", async () => {
    vi.stubEnv("QLOO_API_KEY", ""); resetEnvForTests();
    const response = await POST(request());
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"code":"config"');
    expect(text.trim().split("\n")).toHaveLength(2);
    expect(runResearch).not.toHaveBeenCalled();
  });

  it("sanitizes fatal research errors and does not cache failures", async () => {
    vi.mocked(runResearch).mockRejectedValue(createQlooError("quota", 429, "private detail"));
    const trace = await traceFor();
    expect(trace.map((event) => event.type)).toEqual(["error", "done"]);
    expect(trace[0]).toMatchObject({ code: "quota" });
    expect(JSON.stringify(trace)).not.toContain("private detail");
    expect(setJson).not.toHaveBeenCalled();
  });

  it("validates returned results before streaming or caching them", async () => {
    vi.mocked(runResearch).mockResolvedValue({ ...FAKE_RUN_RESULT, mode: "invalid" } as unknown as typeof FAKE_RUN_RESULT);
    const trace = await traceFor();
    expect(trace.map((event) => event.type)).toEqual(["error", "done"]);
    expect(setJson).not.toHaveBeenCalled();
  });
});

describe("run cache and limits", () => {
  const stored: TraceEvent[] = [
    { type: "qloo_call", at: 1000, endpoint: "/search", summary: "Lookup", ms: 10, cached: false },
    { type: "result", at: 2000, result: FAKE_RUN_RESULT },
  ];

  it("replays cached results before key and limit checks, marking lookups cached", async () => {
    vi.mocked(getJson).mockResolvedValue({ complete: true, events: stored });
    vi.stubEnv("QLOO_API_KEY", ""); resetEnvForTests();
    const trace = await traceFor();
    expect(trace.map((event) => event.type)).toEqual(["agent_note", "qloo_call", "result", "done"]);
    expect(trace[1]).toMatchObject({ cached: true });
    expect(trace[1].at).toBeLessThan(1000);
    expect(checkLimit).not.toHaveBeenCalled();
    expect(hasJudgeBypass).not.toHaveBeenCalled();
    expect(runResearch).not.toHaveBeenCalled();
  });

  it.each([{ events: [] }, { events: [stored[0]] }, { events: [stored[1], stored[1]] }, { events: [stored[1], { type: "done", at: 0 }] }])("treats incomplete or corrupt traces as misses", async (value) => {
    vi.mocked(getJson).mockResolvedValue({ complete: true, ...value });
    await traceFor(); expect(runResearch).toHaveBeenCalledOnce();
  });

  it.each(["Rack Attack Denver", "Denver Broncos Stadium Store", "Fake Owls Team Store"])("refreshes cached runs containing excluded merchant %s", async (name) => {
    const merchant = FAKE_RUN_RESULT.merchants[0];
    const result = { ...FAKE_RUN_RESULT, merchants: [{ ...merchant, place: { ...merchant.place, name } }] };
    vi.mocked(getJson).mockResolvedValue({ complete: true, events: [{ type: "result", at: 0, result }] });
    const trace = await traceFor();
    expect(runResearch).toHaveBeenCalledOnce();
    expect(setJson).toHaveBeenCalledWith(cacheKey("run", FAKE_RUN_REQUEST), { complete: true, events: expect.any(Array) }, RESULT_TTL_S);
    expect(trace.find((event) => event.type === "result")?.result.merchants[0].place.name).toBe(merchant.place.name);
  });

  it("returns limited and done with HTTP 200 when a limit blocks", async () => {
    vi.mocked(checkLimit).mockResolvedValue({ ok: false, reason: "ip" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const trace = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(trace.map((event) => event.type)).toEqual(["limited", "done"]);
    expect(runResearch).not.toHaveBeenCalled();
    expect(setJson).not.toHaveBeenCalled();
  });

  it("skips all limit checks for a validated judge code", async () => {
    vi.mocked(hasJudgeBypass).mockReturnValue(true);
    await traceFor();
    expect(checkLimit).not.toHaveBeenCalled(); expect(isPresetRun).not.toHaveBeenCalled();
    expect(runResearch).toHaveBeenCalledOnce();
  });

  it("skips only per-IP limits for a validated preset", async () => {
    vi.mocked(isPresetRun).mockResolvedValue(true);
    await traceFor({ ...FAKE_RUN_REQUEST, presetId: "denver-demo" });
    expect(checkLimit).toHaveBeenCalledWith("run", "fake-ip", { skipIp: true });
  });
});
