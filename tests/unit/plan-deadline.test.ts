// Verifies an interrupted planning model preserves observed evidence without more live lookups.
// Called by: npm test; provider responses and clocks are fake
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { runPlan } from "@/lib/agent/plan-agent";
import { PLAN_DEADLINE_MS } from "@/lib/config";
import { searchBrands } from "@/lib/qloo/search";
import { searchPlaceCategories } from "@/lib/qloo/tags";
import { PlanResponseSchema } from "@/lib/types";
import { FAKE_BRAND, FAKE_BRAND_ID, FAKE_CATEGORY_ID, FAKE_PLAN_REQUEST, FAKE_TAG } from "../fixtures/fake-plan";

vi.mock("@/lib/env", () => ({ hasDeepSeekKey: () => false, isAgentDisabled: () => false }));
vi.mock("@/lib/qloo/search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/qloo/search")>();
  return { ...original, searchBrands: vi.fn() };
});
vi.mock("@/lib/qloo/tags", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/qloo/tags")>();
  return { ...original, searchPlaceCategories: vi.fn() };
});
vi.mock("@/lib/qloo/insights", () => ({ resolveLocality: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(async () => null), setJson: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(0);
  vi.mocked(searchBrands).mockResolvedValue([FAKE_BRAND]);
  vi.mocked(searchPlaceCategories).mockResolvedValue([{ tagId: FAKE_CATEGORY_ID, label: "Coffee shop" }]);
});
afterEach(() => { vi.useRealTimers(); });

function toolReply(toolName: string, input: unknown) {
  return {
    content: [{ type: "tool-call" as const, toolCallId: toolName, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: "tool_calls" }, warnings: [],
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
  };
}

it("uses the two-minute deadline to retain a partial plan without caching or later lookups", async () => {
  expect(PLAN_DEADLINE_MS).toBe(120000);
  const controller = new AbortController();
  const replies = [
    toolReply("resolveBrands", { names: [FAKE_BRAND.name] }),
    toolReply("searchCategories", { query: "coffee" }),
    toolReply("submitPlan", { categories: [{ tagId: FAKE_CATEGORY_ID, evidence: [{
      brandEntityId: FAKE_BRAND_ID, brandTagId: FAKE_TAG.id, reason: "Coffee tags support local cafes.",
    }] }] }),
  ];
  const model = new MockLanguageModelV4({ doGenerate: async (options) => {
    const reply = replies.shift();
    if (reply) return reply;
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    return await new Promise<never>((_resolve, reject) => {
      options.abortSignal!.addEventListener("abort", () => reject(options.abortSignal!.reason), { once: true });
    });
  } });
  setTimeout(() => controller.abort(new DOMException("Fake deadline", "TimeoutError")), PLAN_DEADLINE_MS);
  const onCacheable = vi.fn();
  const work = runPlan(FAKE_PLAN_REQUEST, { model, signal: controller.signal, deadlineAt: PLAN_DEADLINE_MS, onCacheable });
  await vi.advanceTimersByTimeAsync(PLAN_DEADLINE_MS);
  const result = await work;
  expect(PlanResponseSchema.safeParse(result).success).toBe(true);
  expect(result.brands.map((brand) => brand.entityId)).toEqual([FAKE_BRAND_ID]);
  expect(result.categories.map((category) => category.tagId)).toEqual([FAKE_CATEGORY_ID]);
  expect(result.trace.some((event) => event.type === "agent_note")).toBe(true);
  expect(model.doGenerateCalls).toHaveLength(4);
  expect(searchBrands).toHaveBeenCalledTimes(1);
  expect(searchPlaceCategories).toHaveBeenCalledTimes(1);
  expect(onCacheable).toHaveBeenCalledExactlyOnceWith(false);
});
