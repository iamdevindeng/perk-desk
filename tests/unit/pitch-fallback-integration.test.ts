// Verifies that real pitch generation failures change mode and trace without losing researched merchants.
// Called by: npm test; scripted language models and fictional Qloo lookups never use network
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { runResearch } from "@/lib/agent/run-agent";
import { checkPitch } from "@/lib/agent/guards";
import { findPlaces } from "@/lib/qloo/insights";
import type { TraceEvent } from "@/lib/types";
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
function modelFor(outcome: string, pitch = "Fake Merchant 10 gives 97% off."): MockLanguageModelV4 {
  let calls = 0;
  return new MockLanguageModelV4({ doGenerate: async () => {
    calls += 1;
    if (calls === 1) return toolReply("findMerchants", { tagId: FAKE_CATEGORY_ID });
    if (calls === 2) return toolReply("finishResearch", { note: "Fake research complete" });
    if (outcome === "provider") throw new Error("private provider detail");
    const output = outcome === "invalid-output" ? { wrong: "private structured output" }
      : { pitches: [{ entityId: makeFakePlace(10).entityId, pitch }] };
    return { content: [{ type: "text", text: JSON.stringify(output) }], finishReason: { unified: "stop", raw: "stop" }, warnings: [], usage: USAGE };
  } });
}
beforeEach(() => { vi.mocked(findPlaces).mockReset().mockResolvedValue(Array.from({ length: 6 }, (_, index) => makeFakePlace(index + 10))); });

describe("pitch batch failures", () => {
  it.each(["provider", "invalid-output"])("reports %s failure truthfully and preserves grounded template pitches", async (outcome) => {
    const events: TraceEvent[] = []; const onCacheable = vi.fn(); const model = modelFor(outcome);
    const result = await runResearch(FAKE_RUN_REQUEST, (event) => events.push(event), { model, onCacheable });
    expect(result.merchants).toHaveLength(6);
    expect(result.merchants.every((merchant) => merchant.pitchSource === "template" && checkPitch(merchant.pitch, merchant))).toBe(true);
    expect(result.mode).toBe("fallback");
    expect(result.warnings).toContain("Pitch writing was unavailable; template pitches were used.");
    expect(events).toContainEqual(expect.objectContaining({ type: "fallback", reason: "Pitch writing was unavailable; template pitches were used." }));
    expect(JSON.stringify({ result, events })).not.toContain("private");
    expect(onCacheable).toHaveBeenCalledWith(false); expect(model.doGenerateCalls).toHaveLength(3);
  });

  it("keeps ordinary per-card guard rejection separate from a failed pitch batch", async () => {
    const events: TraceEvent[] = []; const onCacheable = vi.fn();
    const result = await runResearch(FAKE_RUN_REQUEST, (event) => events.push(event), { model: modelFor("guard"), onCacheable });
    expect(result.merchants).toHaveLength(6); expect(result.mode).toBe("agent");
    expect(result.warnings).toEqual([]); expect(events.some((event) => event.type === "fallback")).toBe(false);
    expect(result.merchants.every((merchant) => merchant.pitchSource === "template" && checkPitch(merchant.pitch, merchant))).toBe(true);
    expect(onCacheable).toHaveBeenCalledWith(true);
  });

  it.each([
    { name: "a qualified numeric discount", claim: "offers a 10% member discount", branchName: "Fake Central Branch", baselineOnly: false },
    { name: "a discount matching a branch label", claim: "offers 10% off", branchName: "10", baselineOnly: false },
    { name: "a baseline taste claim", claim: "matches the tastes of your members", branchName: "Fake Central Branch", baselineOnly: true },
    { name: "a baseline favorite claim", claim: "is a favorite local spot for your members", branchName: "Fake Central Branch", baselineOnly: true },
  ])("replaces $name with a grounded template before returning results", async ({ claim, branchName, baselineOnly }) => {
    const places = Array.from({ length: 6 }, (_, index) => makeFakePlace(index + 10));
    vi.mocked(findPlaces).mockImplementation(async (query) => baselineOnly && query.brandIds.length > 0 ? [] : places);
    const rejectedPitch = `${places[0].name} ${claim}.`;
    const model = modelFor("guard", rejectedPitch);
    const request = { ...FAKE_RUN_REQUEST, branches: [{ ...FAKE_RUN_REQUEST.branches[0], name: branchName }] };
    const result = await runResearch(request, () => undefined, { model });
    const merchant = result.merchants.find((card) => card.place.entityId === places[0].entityId);
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(result.mode).toBe("agent"); expect(result.warnings).toEqual([]);
    expect(merchant).toMatchObject({ branchName, tasteSignal: !baselineOnly, pitchSource: "template" });
    expect(merchant?.pitch).not.toBe(rejectedPitch);
    expect(result.merchants).toHaveLength(6);
    expect(result.merchants.every((card) => card.pitchSource === "template" && checkPitch(card.pitch, card))).toBe(true);
  });
});
