// Verifies fact selection and safe pitch fallback through real research orchestration.
// Called by: npm test; scripted language models and fictional Qloo lookups never use network.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { runResearch } from "@/lib/agent/run-agent";
import { checkPitch } from "@/lib/agent/guards";
import { buildTemplatePitch, renderFactPitch, type PitchFact } from "@/lib/fallback/pitch-template";
import { findPlaces } from "@/lib/qloo/insights";
import type { MerchantResult, TraceEvent } from "@/lib/types";
import { FAKE_CATEGORY_ID, FAKE_RUN_REQUEST } from "../fixtures/fake-plan";
import { makeFakePlace } from "../fixtures/fake-places";

vi.mock("@/lib/env", () => ({ hasDeepSeekKey: () => false, isAgentDisabled: () => false }));
vi.mock("@/lib/qloo/insights", () => ({ findPlaces: vi.fn() }));
vi.mock("@/lib/qloo/search", () => ({ searchBrandExact: async () => null }));
vi.mock("@/lib/store/cache", () => ({ getJson: async () => null, setJson: async () => undefined }));
const USAGE = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
function toolReply(toolName: string, input: unknown) {
  return { content: [{ type: "tool-call" as const, toolCallId: toolName, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: "tool_calls" }, warnings: [], usage: USAGE };
}
function selection(fact: string, index = 10): { entityId: string; fact: string } {
  return { entityId: makeFakePlace(index).entityId, fact };
}
function modelFor(output: unknown, providerFailure = false): MockLanguageModelV4 {
  let calls = 0;
  return new MockLanguageModelV4({ doGenerate: async () => {
    calls += 1;
    if (calls === 1) return toolReply("findMerchants", { tagId: FAKE_CATEGORY_ID });
    if (calls === 2) return toolReply("finishResearch", { note: "Fake research complete" });
    if (providerFailure) throw new Error("private provider detail");
    return { content: [{ type: "text", text: JSON.stringify(output) }], finishReason: { unified: "stop", raw: "stop" }, warnings: [], usage: USAGE };
  } });
}
function validPitches(merchants: MerchantResult[]): boolean {
  return merchants.every((card) => checkPitch(card.pitch, card, FAKE_RUN_REQUEST.institutionName));
}
beforeEach(() => {
  vi.mocked(findPlaces).mockReset().mockResolvedValue(Array.from({ length: 6 }, (_, index) => makeFakePlace(index + 10, {
    explain: [{ entityId: FAKE_RUN_REQUEST.brands[0].entityId, score: 1 }],
  })));
});

describe("pitch batch failures", () => {
  it.each([
    { name: "provider failure", output: { pitches: [] }, providerFailure: true },
    { name: "missing selections", output: { wrong: "private structured output" }, providerFailure: false },
    { name: "unknown fact", output: { pitches: [selection("discount")] }, providerFailure: false },
    { name: "invented amount", output: { pitches: [{ ...selection("rating"), amount: 10 }] }, providerFailure: false },
  ])("reports $name and preserves grounded templates", async ({ output, providerFailure }) => {
    const events: TraceEvent[] = []; const onCacheable = vi.fn(); const model = modelFor(output, providerFailure);
    const result = await runResearch(FAKE_RUN_REQUEST, (event) => events.push(event), { model, onCacheable });
    expect(result.merchants).toHaveLength(6);
    expect(result.merchants.every((merchant) => merchant.pitchSource === "template")).toBe(true);
    expect(validPitches(result.merchants)).toBe(true);
    expect(result.mode).toBe("fallback");
    expect(result.warnings).toContain("Pitch writing was unavailable; template pitches were used.");
    expect(events).toContainEqual(expect.objectContaining({ type: "fallback", reason: "Pitch writing was unavailable; template pitches were used." }));
    expect(JSON.stringify({ result, events })).not.toContain("private");
    expect(onCacheable).toHaveBeenCalledWith(false); expect(model.doGenerateCalls).toHaveLength(3);
  });

  it.each([
    { claim: "offers a 10% member discount", branchName: "Fake Central Branch" },
    { claim: "offers 10% off", branchName: "10" },
    { claim: "matches the tastes of your members", branchName: "Fake Central Branch" },
    { claim: "is a favorite local spot for your members", branchName: "Fake Central Branch" },
    { claim: "lets members save up to 10%", branchName: "Fake Central Branch" },
    { claim: "offers a discount worth 10%", branchName: "Fake Central Branch" },
    { claim: "and our credit union are confirmed partners", branchName: "Fake Central Branch" },
    { claim: "has agreed to be partners", branchName: "Fake Central Branch" },
  ])("never returns or caches old free-text output: $claim", async ({ claim, branchName }) => {
    const rejectedPitch = `${makeFakePlace(10).name} ${claim}.`;
    const model = modelFor({ pitches: [{ entityId: makeFakePlace(10).entityId, pitch: rejectedPitch }] });
    const request = { ...FAKE_RUN_REQUEST, branches: [{ ...FAKE_RUN_REQUEST.branches[0], name: branchName }] };
    const onCacheable = vi.fn();
    const result = await runResearch(request, () => undefined, { model, onCacheable });
    expect(result.merchants).toHaveLength(6);
    expect(result.merchants.every((card) => card.pitchSource === "template")).toBe(true);
    expect(validPitches(result.merchants)).toBe(true);
    expect(result.merchants.some((card) => card.pitch === rejectedPitch)).toBe(false);
    expect(result.mode).toBe("fallback");
    expect(onCacheable).toHaveBeenCalledWith(false);
  });

  it("rejects prose smuggled alongside an otherwise valid fact", async () => {
    const injected = "Members save up to 10% through our confirmed partnership.";
    const model = modelFor({ pitches: [{ ...selection("category"), pitch: injected }] });
    const onCacheable = vi.fn();
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined, { model, onCacheable });
    expect(result.mode).toBe("fallback");
    expect(result.merchants.every((card) => card.pitchSource === "template")).toBe(true);
    expect(validPitches(result.merchants)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(injected);
    expect(onCacheable).toHaveBeenCalledWith(false);
  });
});

describe("verified fact selection", () => {
  it.each<PitchFact>(["category", "taste", "distance", "rating"])("renders an available %s fact as an agent-selected pitch", async (fact) => {
    const model = modelFor({ pitches: [selection(fact)] }); const onCacheable = vi.fn();
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined, { model, onCacheable });
    const card = result.merchants.find((merchant) => merchant.place.entityId === makeFakePlace(10).entityId)!;
    expect(card.pitchSource).toBe("agent");
    expect(card.pitch).toBe(renderFactPitch(card, FAKE_RUN_REQUEST.institutionName, fact));
    expect(result.merchants.filter((merchant) => merchant.pitchSource === "template")).toHaveLength(5);
    expect(validPitches(result.merchants)).toBe(true);
    expect(result.mode).toBe("agent"); expect(result.warnings).toEqual([]);
    expect(onCacheable).toHaveBeenCalledWith(true); expect(model.doGenerateCalls).toHaveLength(3);
  });

  it.each(["taste", "rating"])("falls back only the card with an unavailable %s fact", async (fact) => {
    const places = Array.from({ length: 6 }, (_, index) => makeFakePlace(index + 10, { businessRating: undefined }));
    vi.mocked(findPlaces).mockImplementation(async (query) => query.brandIds.length > 0 ? [] : places);
    const model = modelFor({ pitches: [selection(fact), selection("distance", 11)] });
    const events: TraceEvent[] = []; const onCacheable = vi.fn();
    const result = await runResearch(FAKE_RUN_REQUEST, (event) => events.push(event), { model, onCacheable });
    const card = result.merchants.find((merchant) => merchant.place.entityId === places[0].entityId)!;
    expect(card).toMatchObject({ tasteSignal: false, pitchSource: "template" });
    expect(card.pitch).toBe(buildTemplatePitch(card, FAKE_RUN_REQUEST.institutionName));
    expect(result.merchants.find((merchant) => merchant.place.entityId === places[1].entityId)?.pitchSource).toBe("agent");
    expect(result.mode).toBe("agent"); expect(result.warnings).toEqual([]);
    expect(events.some((event) => event.type === "fallback")).toBe(false);
    expect(validPitches(result.merchants)).toBe(true); expect(onCacheable).toHaveBeenCalledWith(true);
  });

  it("ignores unknown IDs and rejects repeated selections without dropping other cards", async () => {
    const model = modelFor({ pitches: [selection("category"), selection("taste"), selection("distance"), selection("rating", 11), selection("rating", 99)] });
    const onCacheable = vi.fn();
    const result = await runResearch(FAKE_RUN_REQUEST, () => undefined, { model, onCacheable });
    expect(result.merchants).toHaveLength(6);
    expect(result.merchants.find((card) => card.place.entityId === makeFakePlace(10).entityId)?.pitchSource).toBe("template");
    expect(result.merchants.find((card) => card.place.entityId === makeFakePlace(11).entityId)?.pitchSource).toBe("agent");
    expect(result.mode).toBe("agent"); expect(result.warnings).toEqual([]);
    expect(validPitches(result.merchants)).toBe(true); expect(onCacheable).toHaveBeenCalledWith(true);
  });
});
