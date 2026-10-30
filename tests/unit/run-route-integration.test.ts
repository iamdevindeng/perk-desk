// Exercises the complete deterministic research route with only hand-written fake Qloo data.
// Called by: npm test; all network boundaries are mocked
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/run/route";
import { checkPitch } from "@/lib/agent/guards";
import { resetEnvForTests } from "@/lib/env";
import { findPlaces } from "@/lib/qloo/insights";
import { searchBrandExact } from "@/lib/qloo/search";
import { clearMemoryCacheForTests } from "@/lib/store/cache";
import { resetMemoryLimitsForTests } from "@/lib/store/rate-limit";
import { TraceEventSchema, type TraceEvent } from "@/lib/types";
import { FAKE_PLACE, FAKE_RUN_REQUEST } from "../fixtures/fake-plan";

vi.mock("@/lib/qloo/insights", () => ({ findPlaces: vi.fn() }));
vi.mock("@/lib/qloo/search", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/qloo/search")>(), searchBrandExact: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv("QLOO_API_KEY", "fake-integration-key");
  vi.stubEnv("PD_AGENT_DISABLED", "1"); vi.stubEnv("DEEPSEEK_API_KEY", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  resetEnvForTests(); clearMemoryCacheForTests(); resetMemoryLimitsForTests();
  vi.mocked(findPlaces).mockReset().mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({
    ...FAKE_PLACE, entityId: `00000000-0000-4000-8000-0000000000${String(index + 10).padStart(2, "0")}`,
    name: `Fake Coffee Shop ${index}`, lat: FAKE_PLACE.lat + index / 10000,
  })));
  vi.mocked(searchBrandExact).mockReset().mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); resetEnvForTests(); clearMemoryCacheForTests(); resetMemoryLimitsForTests(); });

it("streams all six steps and a grounded shortlist when the model is disabled", async () => {
  const response = await POST(new Request("http://localhost/api/run", {
    method: "POST", body: JSON.stringify(FAKE_RUN_REQUEST),
  }));
  expect(response.status).toBe(200);
  const trace: TraceEvent[] = (await response.text()).trim().split("\n").map((line) => TraceEventSchema.parse(JSON.parse(line)));
  expect(trace.at(-1)?.type).toBe("done");
  expect(trace.filter((event) => event.type === "step" && event.status === "done")).toHaveLength(6);
  expect(trace.filter((event) => event.type === "result")).toHaveLength(1);
  const terminal = trace.find((event) => event.type === "result");
  expect(terminal?.type).toBe("result");
  if (terminal?.type !== "result") throw new Error("Expected result");
  expect(terminal.result.mode).toBe("fallback");
  expect(terminal.result.merchants).toHaveLength(8);
  expect(terminal.result.merchants.every((merchant) => merchant.pitchSource === "template" && checkPitch(merchant.pitch, merchant, FAKE_RUN_REQUEST.institutionName))).toBe(true);
  expect(findPlaces).toHaveBeenCalledTimes(2);
});
