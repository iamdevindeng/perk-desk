// Exercises complete research with fake Qloo places and scripted models, without network access.
// Called by: npm test
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { runResearch } from "@/lib/agent/run-agent";
import { checkPitch } from "@/lib/agent/guards";
import { writePitches } from "@/lib/agent/pitch-writer";
import { getCategoryDefaults } from "@/lib/data";
import { hasDeepSeekKey, isAgentDisabled } from "@/lib/env";
import { createQlooError } from "@/lib/qloo/client";
import { findPlaces } from "@/lib/qloo/insights";
import { searchBrandExact } from "@/lib/qloo/search";
import { RunResultSchema, StepIdSchema, type TraceEvent } from "@/lib/types";
import { FAKE_BRAND, FAKE_CATEGORY_ID, FAKE_RUN_REQUEST } from "../fixtures/fake-plan";
import { makeFakePlace } from "../fixtures/fake-places";

vi.mock("@/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env")>();
  return { ...original, hasDeepSeekKey: vi.fn(), isAgentDisabled: vi.fn() };
});
vi.mock("@/lib/qloo/insights", () => ({ findPlaces: vi.fn() }));
vi.mock("@/lib/qloo/search", () => ({ searchBrandExact: vi.fn() }));
vi.mock("@/lib/agent/pitch-writer", () => ({ writePitches: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(async () => null), setJson: vi.fn() }));

function toolReply(toolName: string, input: unknown) {
  return {
    content: [{ type: "tool-call" as const, toolCallId: toolName, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: "tool_calls" }, warnings: [],
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
  };
}

function researchModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: [
    toolReply("findMerchants", { tagId: FAKE_CATEGORY_ID }), toolReply("finishResearch", { note: "Confirmed category checked." }),
  ] });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasDeepSeekKey).mockReturnValue(false);
  vi.mocked(isAgentDisabled).mockReturnValue(true);
  vi.mocked(writePitches).mockResolvedValue(new Map());
  vi.mocked(searchBrandExact).mockImplementation(async (_name, options) => {
    options?.onCall?.({ endpoint: "/search", summary: "Brand check", ms: 1, cached: false });
    return null;
  });
  vi.mocked(findPlaces).mockImplementation(async (query, options) => {
    options?.onCall?.({ endpoint: "/v2/insights", summary: "Place query", ms: 1, cached: false });
    return Array.from({ length: 12 }, (_, index) => makeFakePlace(index + 1, {
      affinity: query.brandIds.length ? (index + 1) / 100 : undefined,
      explain: query.brandIds.length ? [{ entityId: FAKE_BRAND.entityId, score: 1 }] : [],
      googlePlaceId: `fake-place-${index + 1}`,
    }));
  });
});

describe("deterministic research", () => {
  it("returns at most ten grounded cards with all six progress pairs and no terminal events", async () => {
    const events: TraceEvent[] = [];
    const result = await runResearch(FAKE_RUN_REQUEST, (event) => events.push(event));
    expect(result.mode).toBe("fallback");
    expect(result.merchants).toHaveLength(10);
    expect(RunResultSchema.safeParse(result).success).toBe(true);
    expect(result.merchants.every((card) => card.pitchSource === "template" && checkPitch(card.pitch, card))).toBe(true);
    expect(result.qlooCalls).toBe(12);
    expect(writePitches).not.toHaveBeenCalled();
    for (const step of StepIdSchema.options) {
      expect(events.filter((event) => event.type === "step" && event.step === step).map((event) => event.type === "step" && event.status)).toEqual(["start", "done"]);
    }
    expect(events.some((event) => ["result", "done", "error"].includes(event.type))).toBe(false);
    const card = result.merchants[0];
    expect(new URL(card.googleMapsUrl).searchParams.get("query")).toBe(`${card.place.name} ${card.place.address}`);
    expect(new URL(card.googleMapsUrl).searchParams.get("query_place_id")).toBe(card.place.googlePlaceId);
  });

  it("tries only the first adjacent category for a thin confirmed category", async () => {
    const adjacent = getCategoryDefaults().categories.find((category) => category.tagId === FAKE_CATEGORY_ID)!.adjacent[0];
    vi.mocked(findPlaces).mockImplementation(async (query) => [makeFakePlace(query.tagId === FAKE_CATEGORY_ID ? 1 : 2, { affinity: 0.1 })]);
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined);
    expect(findPlaces).toHaveBeenCalledTimes(4);
    expect(new Set(vi.mocked(findPlaces).mock.calls.map(([query]) => query.tagId))).toEqual(new Set([FAKE_CATEGORY_ID, adjacent]));
    expect(result.categories.find((category) => category.tagId === FAKE_CATEGORY_ID)).toMatchObject({ status: "replaced", replacedBy: adjacent });
    expect(result.categories.find((category) => category.tagId === adjacent)?.status).toBe("thin");
  });

  it("keeps available baseline results after a taste-query failure", async () => {
    vi.mocked(findPlaces).mockRejectedValueOnce(new Error("private backend detail"));
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined);
    expect(result.merchants).toHaveLength(10);
    expect(result.merchants.every((merchant) => !merchant.tasteSignal)).toBe(true);
    expect(result.warnings.join(" ")).toContain("taste lookup failed");
    expect(JSON.stringify(result)).not.toContain("private backend detail");
  });

  it("marks exact popular brand matches without removing the merchant", async () => {
    vi.mocked(searchBrandExact).mockImplementation(async (name) => ({ ...FAKE_BRAND, name, popularity: 0.8 }));
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined);
    expect(result.merchants).toHaveLength(10);
    expect(result.merchants.every((merchant) => merchant.multiLocation)).toBe(true);
    expect(result.categories[0].independentCount).toBe(2);
    expect(searchBrandExact).toHaveBeenCalledTimes(10);
  });

  it("requires an exact normalized brand match and the popularity threshold", async () => {
    vi.mocked(searchBrandExact).mockImplementation(async (name) => ({ ...FAKE_BRAND, name: `${name} Reserve`, popularity: 1 }));
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined);
    expect(result.merchants.some((merchant) => merchant.multiLocation)).toBe(false);
  });

  it("excludes signed/status-selected merchants before the shortlist", async () => {
    const first = makeFakePlace(1);
    const result = await runResearch({ ...FAKE_RUN_REQUEST, excludeEntityIds: [first.entityId], signedNames: [makeFakePlace(2).name] }, () => undefined);
    expect(result.merchants.some((merchant) => [first.entityId, makeFakePlace(2).entityId].includes(merchant.place.entityId))).toBe(false);
    expect(result.excludedCounts.signedOrExcluded).toBeGreaterThanOrEqual(2);
  });
});

describe("research model and completion", () => {
  it("runs a scripted model with no real key and accepts valid generated pitches", async () => {
    vi.mocked(isAgentDisabled).mockReturnValue(false);
    const place = makeFakePlace(12);
    const pitch = `${place.name} offers coffee. Members enjoy coffee. Discuss a member offer.`;
    vi.mocked(writePitches).mockResolvedValue(new Map([[place.entityId, pitch]]));
    const model = researchModel();
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined, { model });
    expect(result.mode).toBe("agent");
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(result.merchants.find((card) => card.place.entityId === place.entityId)?.pitchSource).toBe("agent");
    expect(writePitches).toHaveBeenCalledWith(expect.any(Array), FAKE_RUN_REQUEST.institutionName, { model, signal: expect.any(AbortSignal) });
  });

  it("researches omitted confirmed categories even when the model finishes immediately", async () => {
    vi.mocked(isAgentDisabled).mockReturnValue(false);
    const model = new MockLanguageModelV4({ doGenerate: toolReply("finishResearch", { note: "Finished early." }) });
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined, { model });
    expect(result.mode).toBe("agent");
    expect(findPlaces).toHaveBeenCalledTimes(2);
    expect(result.merchants).toHaveLength(10);
  });

  it("falls back safely after a model exception", async () => {
    vi.mocked(isAgentDisabled).mockReturnValue(false);
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("private model failure"); } });
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined, { model });
    expect(result.mode).toBe("fallback");
    expect(result.merchants).toHaveLength(10);
    expect(JSON.stringify(result)).not.toContain("private model failure");
  });

  it("uses templates when pitch writing fails", async () => {
    vi.mocked(isAgentDisabled).mockReturnValue(false);
    vi.mocked(writePitches).mockRejectedValueOnce(new Error("private pitch failure"));
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined, { model: researchModel() });
    expect(result.merchants.every((card) => card.pitchSource === "template")).toBe(true);
    expect(result.warnings.join(" ")).toContain("template pitches");
  });

  it.each(["auth", "quota", "config"] as const)("stops promptly on a fatal Qloo %s tool error", async (code) => {
    vi.mocked(isAgentDisabled).mockReturnValue(false);
    const error = createQlooError(code, null, "Qloo unavailable");
    vi.mocked(findPlaces).mockRejectedValue(error);
    const model = researchModel();
    await expect(runResearch(FAKE_RUN_REQUEST, () => undefined, { model })).rejects.toBe(error);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(writePitches).not.toHaveBeenCalled();
  });
});

// Direct callers receive the same coordinate protection as the HTTP boundary.
it.each([{ lat: 400 }, { lon: 1000 }])("rejects invalid direct research coordinates", async (point) => {
  const emit = vi.fn();
  await expect(runResearch({ ...FAKE_RUN_REQUEST, branches: [{ ...FAKE_RUN_REQUEST.branches[0], ...point }] }, emit)).rejects.toThrow();
  expect(findPlaces).not.toHaveBeenCalled(); expect(emit).not.toHaveBeenCalled();
});
