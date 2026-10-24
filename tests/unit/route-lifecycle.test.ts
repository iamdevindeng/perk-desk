// Verifies deadline propagation and disconnect handling without real provider calls.
// Called by: npm test with fake clocks, research orchestration, and cache storage
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as runPost } from "@/app/api/run/route";
import { POST as planPost } from "@/app/api/plan/route";
import { runResearch } from "@/lib/agent/run-agent";
import { runPlan } from "@/lib/agent/plan-agent";
import { PLAN_DEADLINE_MS, RUN_DEADLINE_MS } from "@/lib/config";
import { getJson, setJson } from "@/lib/store/cache";
import { checkLimit } from "@/lib/store/rate-limit";
import { FAKE_PLAN_REQUEST, FAKE_PLAN_RESPONSE, FAKE_RUN_REQUEST, FAKE_RUN_RESULT } from "../fixtures/fake-plan";

vi.mock("@/lib/env", () => ({ hasQlooKey: () => true }));
vi.mock("@/lib/agent/run-agent", () => ({ runResearch: vi.fn() }));
vi.mock("@/lib/agent/plan-agent", () => ({ expandPlanRequest: (request: unknown) => request, runPlan: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(), setJson: vi.fn() }));
vi.mock("@/lib/store/rate-limit", () => ({ checkLimit: vi.fn(), getClientIp: () => "fake-ip" }));

function request(scope: "plan" | "run", signal?: AbortSignal): Request {
  return new Request(`http://localhost/api/${scope}`, {
    method: "POST", body: JSON.stringify(scope === "plan" ? FAKE_PLAN_REQUEST : FAKE_RUN_REQUEST), signal,
  });
}

async function untilAborted(signal?: AbortSignal): Promise<void> {
  if (!signal || signal.aborted) return;
  await new Promise<void>((resolve) => { signal.addEventListener("abort", () => resolve(), { once: true }); });
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
    return abort.signal;
  });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.mocked(getJson).mockReset().mockResolvedValue(null);
  vi.mocked(setJson).mockReset().mockResolvedValue(undefined);
  vi.mocked(checkLimit).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(runResearch).mockReset(); vi.mocked(runPlan).mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("run request lifetime", () => {
  it("passes the absolute deadline and preserves a healthy event sequence and cache", async () => {
    vi.mocked(runResearch).mockImplementation(async (_request, emit, options) => {
      expect(options?.deadlineAt).toBe(RUN_DEADLINE_MS); expect(options?.signal?.aborted).toBe(false);
      options?.onCacheable?.(true);
      emit({ type: "agent_note", at: 0, text: "Fake research" });
      return FAKE_RUN_RESULT;
    });
    const text = await (await runPost(request("run"))).text();
    expect(text.trim().split("\n").map((line) => JSON.parse(line).type)).toEqual(["agent_note", "result", "done"]);
    expect(setJson).toHaveBeenCalledOnce();
    const signal = vi.mocked(runResearch).mock.calls[0][2]?.signal;
    expect(vi.mocked(getJson).mock.calls[0][1]).toBe(signal);
    expect(vi.mocked(setJson).mock.calls[0][3]).toBe(signal);
  });

  it("returns a partial result at the deadline without writing the result cache", async () => {
    vi.mocked(runResearch).mockImplementation(async (_request, emit, options) => {
      await untilAborted(options?.signal);
      options?.onCacheable?.(true);
      emit({ type: "agent_note", at: 0, text: "Stopped early to finish within the time limit." });
      return FAKE_RUN_RESULT;
    });
    const response = await runPost(request("run"));
    const result = response.text();
    await vi.advanceTimersByTimeAsync(RUN_DEADLINE_MS);
    expect((await result).trim().split("\n").map((line) => JSON.parse(line).type)).toEqual(["agent_note", "result", "done"]);
    expect(setJson).not.toHaveBeenCalled();
  });

  it("suppresses further events and cache writes after request abort", async () => {
    const abort = new AbortController();
    vi.mocked(runResearch).mockImplementation(async (_request, emit, options) => {
      emit({ type: "agent_note", at: 0, text: "Started" });
      await untilAborted(options?.signal);
      emit({ type: "agent_note", at: 0, text: "Must not arrive" });
      options?.onCacheable?.(true); return FAKE_RUN_RESULT;
    });
    const response = await runPost(request("run", abort.signal));
    abort.abort(); await vi.advanceTimersByTimeAsync(0);
    const text = await response.text();
    expect(text.trim().split("\n").map((line) => JSON.parse(line).type)).toEqual(["agent_note"]);
    expect(text).not.toContain("Must not arrive"); expect(setJson).not.toHaveBeenCalled();
  });

  it("aborts the provider signal when the reader cancels", async () => {
    let providerSignal: AbortSignal | undefined;
    vi.mocked(runResearch).mockImplementation(async (_request, _emit, options) => {
      providerSignal = options?.signal;
      await untilAborted(providerSignal);
      options?.onCacheable?.(true); return FAKE_RUN_RESULT;
    });
    const response = await runPost(request("run"));
    await response.body?.cancel(); await vi.advanceTimersByTimeAsync(0);
    expect(providerSignal?.aborted).toBe(true); expect(setJson).not.toHaveBeenCalled();
  });
});

describe("plan request lifetime", () => {
  it("passes its deadline and caches a complete plan", async () => {
    vi.mocked(runPlan).mockImplementation(async (_request, options) => {
      expect(options?.deadlineAt).toBe(PLAN_DEADLINE_MS); expect(options?.signal?.aborted).toBe(false);
      options?.onCacheable?.(true); return FAKE_PLAN_RESPONSE;
    });
    expect(await (await planPost(request("plan"))).json()).toEqual(FAKE_PLAN_RESPONSE);
    expect(setJson).toHaveBeenCalledOnce();
    const signal = vi.mocked(runPlan).mock.calls[0][1]?.signal;
    expect(vi.mocked(getJson).mock.calls[0][1]).toBe(signal);
    expect(vi.mocked(setJson).mock.calls[0][3]).toBe(signal);
  });

  it("serves deadline-limited plan data without writing the plan cache", async () => {
    vi.mocked(runPlan).mockImplementation(async (_request, options) => {
      await untilAborted(options?.signal); options?.onCacheable?.(true); return FAKE_PLAN_RESPONSE;
    });
    const response = planPost(request("plan"));
    await vi.advanceTimersByTimeAsync(PLAN_DEADLINE_MS);
    expect(await (await response).json()).toEqual(FAKE_PLAN_RESPONSE);
    expect(setJson).not.toHaveBeenCalled();
  });

  it("returns no body or cache entry after a client abort", async () => {
    const abort = new AbortController();
    vi.mocked(runPlan).mockImplementation(async (_request, options) => {
      await untilAborted(options?.signal); options?.onCacheable?.(true); return FAKE_PLAN_RESPONSE;
    });
    const pending = planPost(request("plan", abort.signal));
    await vi.advanceTimersByTimeAsync(0); abort.abort();
    const response = await pending;
    expect(response.status).toBe(204); expect(await response.text()).toBe("");
    expect(setJson).not.toHaveBeenCalled();
  });

  it("keeps a recovered partial plan out of the cache before its deadline", async () => {
    vi.mocked(runPlan).mockImplementation(async (_request, options) => {
      options?.onCacheable?.(false); return FAKE_PLAN_RESPONSE;
    });
    expect((await planPost(request("plan"))).status).toBe(200);
    expect(setJson).not.toHaveBeenCalled();
  });
});
