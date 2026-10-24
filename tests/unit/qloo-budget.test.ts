// Verifies Qloo transport caps and isolated plan/run accounting without live provider requests.
// Called by: npm test; all credentials and HTTP responses are fictional
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_QLOO_CALL_CAP, RUN_QLOO_CALL_CAP } from "@/lib/config";

vi.mock("@/lib/env", () => ({ getEnv: () => ({
  QLOO_API_KEY: "fake-test-placeholder", QLOO_BASE_URL: "https://hackathon.api.qloo.com",
}) }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(async () => null), setJson: vi.fn() }));

let client: typeof import("@/lib/qloo/client");
let usage: typeof import("@/lib/store/usage");
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  fetchMock.mockReset().mockImplementation(async () => Response.json({ results: [] }));
  vi.stubGlobal("fetch", fetchMock);
  client = await import("@/lib/qloo/client");
  usage = await import("@/lib/store/usage");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function expectUsage(scope: "run" | "plan", count: number): void {
  expect(console.info).toHaveBeenCalledWith(expect.stringMatching(
    new RegExp(`^\\[usage\\] scope=${scope} ip_hash=[a-f0-9]{12} qloo_calls=${count} llm_calls=0$`),
  ));
}

describe("per-request Qloo budget", () => {
  it.each([{ scope: "run" as const, cap: 120 }, { scope: "plan" as const, cap: 30 }])(
    "rejects the first excess $scope attempt before fetching",
    async ({ scope, cap }) => {
      expect(scope === "run" ? RUN_QLOO_CALL_CAP : PLAN_QLOO_CALL_CAP).toBe(cap);
      const work = usage.withRunUsage("192.0.2.1", async () => {
        expect(usage.isQlooBudgetReached()).toBe(false);
        for (let index = 0; index < cap; index += 1) await client.qlooGet("/search", {});
        expect(usage.isQlooBudgetReached()).toBe(true);
        await expect(client.qlooGet("/search", {})).rejects.toMatchObject({ code: "budget", status: null });
      }, scope);
      await vi.runAllTimersAsync();
      await work;
      expect(fetchMock).toHaveBeenCalledTimes(cap);
      expectUsage(scope, cap);
      expect(usage.isQlooBudgetReached()).toBe(false);
    },
  );

  it("keeps simultaneous requests within the same hard cap", async () => {
    const work = usage.withRunUsage("192.0.2.1", async () => {
      const attempts = Array.from({ length: PLAN_QLOO_CALL_CAP + 1 }, () => client.qlooGet("/search", {}));
      const results = await Promise.allSettled(attempts);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(PLAN_QLOO_CALL_CAP);
      expect(results.at(-1)).toMatchObject({ status: "rejected", reason: { code: "budget" } });
    }, "plan");
    await vi.runAllTimersAsync();
    await work;
    expect(fetchMock).toHaveBeenCalledTimes(PLAN_QLOO_CALL_CAP);
  });

  it("does not fetch a rate-limit retry after the last available attempt", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 429 }));
    const work = usage.withRunUsage("192.0.2.1", async () => {
      for (let index = 0; index < PLAN_QLOO_CALL_CAP - 1; index += 1) usage.recordUsageCall("qloo");
      await expect(client.qlooGet("/search", {})).rejects.toMatchObject({ code: "budget" });
    }, "plan");
    await vi.runAllTimersAsync();
    await work;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectUsage("plan", PLAN_QLOO_CALL_CAP);
  });

  it("keeps an exhausted plan separate from an interleaved run", async () => {
    let resumePlan = (): void => undefined;
    const pausePlan = new Promise<void>((resolve) => { resumePlan = resolve; });
    const plan = usage.withRunUsage("192.0.2.1", async () => {
      for (let index = 0; index < PLAN_QLOO_CALL_CAP; index += 1) usage.recordUsageCall("qloo");
      await pausePlan;
      await expect(client.qlooGet("/search", {})).rejects.toMatchObject({ code: "budget" });
    }, "plan");
    const run = usage.withRunUsage("192.0.2.2", async () => {
      expect(usage.isQlooBudgetReached()).toBe(false);
      await client.qlooGet("/search", {});
      expect(usage.isQlooBudgetReached()).toBe(false);
    });
    await vi.runAllTimersAsync();
    await run;
    resumePlan();
    await vi.runAllTimersAsync();
    await plan;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectUsage("plan", PLAN_QLOO_CALL_CAP);
    expectUsage("run", 1);
  });
});
