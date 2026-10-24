// Verifies run deadlines, phase time guards, cancellation, and partial-result completion.
// Called by: npm test; providers and clocks are fake
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { runResearch } from "@/lib/agent/run-agent";
import { writePitches } from "@/lib/agent/pitch-writer";
import { RUN_DEADLINE_MS } from "@/lib/config";
import { isAgentDisabled } from "@/lib/env";
import { createQlooError } from "@/lib/qloo/client";
import { findPlaces } from "@/lib/qloo/insights";
import { searchBrandExact } from "@/lib/qloo/search";
import { setJson } from "@/lib/store/cache";
import { RunResultSchema, type TraceEvent } from "@/lib/types";
import { FAKE_CATEGORY_ID, FAKE_RUN_REQUEST } from "../fixtures/fake-plan";
import { makeFakePlace } from "../fixtures/fake-places";

vi.mock("@/lib/env", () => ({ hasDeepSeekKey: () => false, isAgentDisabled: vi.fn() }));
vi.mock("@/lib/qloo/insights", () => ({ findPlaces: vi.fn() }));
vi.mock("@/lib/qloo/search", () => ({ searchBrandExact: vi.fn() }));
vi.mock("@/lib/agent/pitch-writer", () => ({ writePitches: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(async () => null), setJson: vi.fn() }));

const PLACES = Array.from({ length: 4 }, (_, index) => makeFakePlace(index + 1, { affinity: 0.1 }));

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(0);
  vi.mocked(isAgentDisabled).mockReturnValue(true);
  vi.mocked(findPlaces).mockResolvedValue(PLACES);
  vi.mocked(searchBrandExact).mockResolvedValue(null);
  vi.mocked(writePitches).mockResolvedValue(new Map());
});
afterEach(() => { vi.useRealTimers(); });

function toolReply(toolName: string, input: unknown) {
  return {
    content: [{ type: "tool-call" as const, toolCallId: toolName, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: "tool_calls" }, warnings: [],
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
  };
}

function waitForAbort(signal?: AbortSignal): Promise<never> {
  expect(signal).toBeInstanceOf(AbortSignal);
  return new Promise((_resolve, reject) => {
    if (signal!.aborted) reject(signal!.reason);
    else signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
  });
}

function deadlineController(): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException("Fake deadline", "TimeoutError")), RUN_DEADLINE_MS);
  return controller;
}

it("finishes gathered merchants when slow Qloo work reaches the overall deadline", async () => {
  expect(RUN_DEADLINE_MS).toBe(240000);
  const controller = deadlineController();
  vi.mocked(findPlaces).mockResolvedValueOnce(PLACES)
    .mockImplementation(async (_query, options) => await waitForAbort(options?.signal));
  const events: TraceEvent[] = [];
  const onCacheable = vi.fn();
  const work = runResearch(FAKE_RUN_REQUEST, (event) => events.push(event), {
    signal: controller.signal, deadlineAt: RUN_DEADLINE_MS, onCacheable,
  });
  await vi.advanceTimersByTimeAsync(RUN_DEADLINE_MS);
  const result = await work;
  expect(RunResultSchema.safeParse(result).success).toBe(true);
  expect(result.merchants).toHaveLength(PLACES.length);
  expect(result.durationMs).toBeLessThanOrEqual(RUN_DEADLINE_MS);
  expect(result.merchants.every((merchant) => merchant.pitchSource === "template")).toBe(true);
  expect(onCacheable).toHaveBeenCalledExactlyOnceWith(false);
  expect(events.some((event) => event.type === "agent_note")).toBe(true);
  expect(findPlaces).toHaveBeenCalledTimes(2);
  expect(searchBrandExact).not.toHaveBeenCalled();
  expect(writePitches).not.toHaveBeenCalled();
});

it("returns a clean upstream error when the deadline leaves no gathered candidates", async () => {
  const controller = deadlineController();
  vi.mocked(findPlaces).mockImplementation(async (_query, options) => await waitForAbort(options?.signal));
  const work = expect(runResearch(FAKE_RUN_REQUEST, () => undefined, {
    signal: controller.signal, deadlineAt: RUN_DEADLINE_MS,
  })).rejects.toMatchObject({ code: "upstream", message: "Qloo is having trouble; try again in a minute." });
  await Promise.all([vi.advanceTimersByTimeAsync(RUN_DEADLINE_MS), work]);
  expect(findPlaces).toHaveBeenCalledTimes(1);
  expect(searchBrandExact).not.toHaveBeenCalled();
  expect(writePitches).not.toHaveBeenCalled();
});

it("skips top-ups and brand checks and uses template pitches with under fifty seconds left", async () => {
  vi.mocked(isAgentDisabled).mockReturnValue(false);
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    if (!vi.mocked(findPlaces).mock.calls.length) return toolReply("findMerchants", { tagId: FAKE_CATEGORY_ID });
    vi.setSystemTime(RUN_DEADLINE_MS - 49000);
    return toolReply("finishResearch", { note: "The first category is ready." });
  } });
  const onCacheable = vi.fn();
  const request = { ...FAKE_RUN_REQUEST, categories: [
    ...FAKE_RUN_REQUEST.categories, { tagId: "urn:tag:category:place:bakery", label: "Bakery" },
  ] };
  const result = await runResearch(request, () => undefined, { model, deadlineAt: RUN_DEADLINE_MS, onCacheable });
  expect(result.merchants).toHaveLength(PLACES.length);
  expect(result.merchants.every((merchant) => merchant.pitchSource === "template")).toBe(true);
  expect(result.categories.find((category) => category.label === "Bakery")?.status).toBe("incomplete");
  expect(findPlaces).toHaveBeenCalledTimes(2);
  expect(searchBrandExact).not.toHaveBeenCalled();
  expect(writePitches).not.toHaveBeenCalled();
  expect(onCacheable).toHaveBeenCalledExactlyOnceWith(false);
});

it("aborts a pending model turn and stops later provider calls after the client disconnects", async () => {
  vi.mocked(isAgentDisabled).mockReturnValue(false);
  const controller = new AbortController();
  const model = new MockLanguageModelV4({ doGenerate: async (options) => {
    if (!vi.mocked(findPlaces).mock.calls.length) return toolReply("findMerchants", { tagId: FAKE_CATEGORY_ID });
    setTimeout(() => controller.abort(), 20);
    return await waitForAbort(options.abortSignal);
  } });
  const onCacheable = vi.fn();
  const work = runResearch(FAKE_RUN_REQUEST, () => undefined, { model, signal: controller.signal, onCacheable });
  await vi.advanceTimersByTimeAsync(20);
  const result = await work;
  expect(result.merchants).toHaveLength(PLACES.length);
  expect(model.doGenerateCalls).toHaveLength(2);
  expect(findPlaces).toHaveBeenCalledTimes(2);
  expect(searchBrandExact).not.toHaveBeenCalled();
  expect(writePitches).not.toHaveBeenCalled();
  expect(onCacheable).toHaveBeenCalledExactlyOnceWith(false);
});

it("keeps gathered candidates and stops research after three Qloo failures", async () => {
  vi.mocked(findPlaces).mockResolvedValueOnce(PLACES).mockImplementation(async () => {
    throw createQlooError("timeout", null, "Qloo is having trouble; try again in a minute.");
  });
  const request = { ...FAKE_RUN_REQUEST, branches: Array.from({ length: 3 }, (_, index) => ({
    ...FAKE_RUN_REQUEST.branches[0], id: `fake-${index}`, name: `Fake Branch ${index}`,
  })) };
  const events: TraceEvent[] = [];
  const onCacheable = vi.fn();
  const result = await runResearch(request, (event) => events.push(event), { onCacheable });
  expect(result.merchants).toHaveLength(PLACES.length);
  expect(findPlaces).toHaveBeenCalledTimes(4);
  expect(searchBrandExact).not.toHaveBeenCalled();
  expect(writePitches).not.toHaveBeenCalled();
  expect(onCacheable).toHaveBeenCalledExactlyOnceWith(false);
  expect(events.some((event) => event.type === "agent_note")).toBe(true);
});

it("returns an upstream error when an empty successful lookup precedes the breaker", async () => {
  vi.mocked(findPlaces).mockResolvedValueOnce([]).mockImplementation(async () => {
    throw createQlooError("timeout", null, "Qloo is having trouble; try again in a minute.");
  });
  const request = { ...FAKE_RUN_REQUEST, branches: Array.from({ length: 3 }, (_, index) => ({
    ...FAKE_RUN_REQUEST.branches[0], id: `fake-${index}`, name: `Fake Branch ${index}`,
  })) };
  await expect(runResearch(request, () => undefined)).rejects.toMatchObject({
    code: "upstream", message: "Qloo is having trouble; try again in a minute.",
  });
  expect(findPlaces).toHaveBeenCalledTimes(4);
  expect(writePitches).not.toHaveBeenCalled();
});

it("does not rewrite an earlier category's density after aborting a later category", async () => {
  const controller = new AbortController();
  let writesBeforeAbort = 0;
  vi.mocked(findPlaces).mockImplementation(async (query) => {
    if (query.tagId === FAKE_CATEGORY_ID) return PLACES;
    writesBeforeAbort = vi.mocked(setJson).mock.calls.length;
    vi.mocked(setJson).mockClear();
    controller.abort();
    throw controller.signal.reason;
  });
  const request = { ...FAKE_RUN_REQUEST, categories: [
    ...FAKE_RUN_REQUEST.categories, { tagId: "urn:tag:category:place:bakery", label: "Bakery" },
  ] };
  const onCacheable = vi.fn();
  const result = await runResearch(request, () => undefined, { signal: controller.signal, onCacheable });
  expect(writesBeforeAbort).toBeGreaterThan(0);
  expect(setJson).not.toHaveBeenCalled();
  expect(result.merchants).toHaveLength(PLACES.length);
  expect(findPlaces).toHaveBeenCalledTimes(3);
  expect(onCacheable).toHaveBeenCalledExactlyOnceWith(false);
});
