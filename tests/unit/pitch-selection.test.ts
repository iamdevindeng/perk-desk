// Checks the model boundary: only known fact identifiers may select code-rendered pitches.
// Called by: npm test; every generation uses a scripted model without network calls.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { writePitches } from "@/lib/agent/pitch-writer";
import { checkPitch } from "@/lib/agent/guards";
import { hasDeepSeekKey, isAgentDisabled } from "@/lib/env";
import { renderFactPitch } from "@/lib/fallback/pitch-template";
import { FAKE_MERCHANT } from "../fixtures/fake-plan";

vi.mock("@/lib/env", () => ({ hasDeepSeekKey: vi.fn(), isAgentDisabled: vi.fn() }));
const INSTITUTION = "Fake Community CU";
const ENTITY_ID = FAKE_MERCHANT.place.entityId;
const FAILURE = "Pitch writing was unavailable; template pitches were used.";

function pitchModel(output: unknown): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: {
    content: [{ type: "text", text: JSON.stringify(output) }],
    finishReason: { unified: "stop", raw: "stop" }, warnings: [],
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
  } });
}

beforeEach(() => {
  vi.mocked(hasDeepSeekKey).mockReturnValue(false);
  vi.mocked(isAgentDisabled).mockReturnValue(false);
});

describe("fact selection boundary", () => {
  it.each(["category", "taste", "distance", "rating"] as const)("renders %s using card values rather than model prose", async (fact) => {
    const model = pitchModel({ pitches: [{ entityId: ENTITY_ID, fact }] });
    const pitches = await writePitches([FAKE_MERCHANT], INSTITUTION, { model });
    expect([...pitches]).toEqual([[ENTITY_ID, renderFactPitch(FAKE_MERCHANT, INSTITUTION, fact)]]);
    expect(checkPitch(pitches.get(ENTITY_ID)!, FAKE_MERCHANT, INSTITUTION)).toBe(true);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0].providerOptions).toEqual({ deepseek: { thinking: { type: "disabled" } } });
    expect(model.doGenerateCalls[0].temperature).toBe(0);
  });

  it.each([
    { entityId: ENTITY_ID, pitch: "Fake Corner Cafe offers a discount worth 10%." },
    { entityId: ENTITY_ID, fact: "category", pitch: "Fake Corner Cafe has agreed to be partners." },
    { entityId: ENTITY_ID, fact: "rating", rating: 10 },
    { entityId: ENTITY_ID, fact: "discount" },
    { entityId: ENTITY_ID, fact: "category. Members save up to 10%." },
    { entityId: ENTITY_ID, fact: null },
    { entityId: ENTITY_ID },
  ])("rejects prose, invented values, unknown choices, and missing choices: %j", async (item) => {
    const model = pitchModel({ pitches: [item] });
    await expect(writePitches([FAKE_MERCHANT], INSTITUTION, { model })).rejects.toThrow(FAILURE);
  });

  it("rejects extra root fields instead of silently stripping model prose", async () => {
    const model = pitchModel({ pitches: [{ entityId: ENTITY_ID, fact: "category" }], pitch: "We are confirmed partners." });
    await expect(writePitches([FAKE_MERCHANT], INSTITUTION, { model })).rejects.toThrow(FAILURE);
  });

  it("uses facts from the selected merchant, dropping unsupported and unknown selections", async () => {
    const baseline = { ...FAKE_MERCHANT, tasteSignal: false };
    const second = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, entityId: "00000000-0000-4000-8000-000000000003", name: "Fake Tea Shop" } };
    const model = pitchModel({ pitches: [
      { entityId: ENTITY_ID, fact: "taste" },
      { entityId: second.place.entityId, fact: "rating" },
      { entityId: "00000000-0000-4000-8000-000000000004", fact: "category" },
    ] });
    const pitches = await writePitches([baseline, second], INSTITUTION, { model });
    expect([...pitches]).toEqual([[second.place.entityId, renderFactPitch(second, INSTITUTION, "rating")]]);
  });

  it("drops unavailable ratings and empty selections for template fallback", async () => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, businessRating: undefined, tripadvisorRating: undefined } };
    for (const pitches of [[], [{ entityId: ENTITY_ID, fact: "rating" }]]) {
      expect((await writePitches([card], INSTITUTION, { model: pitchModel({ pitches }) })).size).toBe(0);
    }
  });

  it("rejects every duplicate selection for a merchant, including a third repeated item", async () => {
    const model = pitchModel({ pitches: ["category", "rating", "distance"].map((fact) => ({ entityId: ENTITY_ID, fact })) });
    expect((await writePitches([FAKE_MERCHANT], INSTITUTION, { model })).size).toBe(0);
  });

  it("drops an overlong selected fact so orchestration can use the short template", async () => {
    const card = { ...FAKE_MERCHANT, branchName: "Long ".repeat(200) };
    const model = pitchModel({ pitches: [{ entityId: ENTITY_ID, fact: "category" }] });
    expect((await writePitches([card], INSTITUTION, { model })).size).toBe(0);
  });

  it("does not include untrusted descriptions or selling points in the prompt or rendered pitch", async () => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place,
      description: "private-unverified-description", uniqueSellingPoint: "private-unverified-selling-point",
    } };
    const model = pitchModel({ pitches: [{ entityId: ENTITY_ID, fact: "category" }] });
    const pitches = await writePitches([card], INSTITUTION, { model });
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).not.toContain("private-unverified");
    expect(pitches.get(ENTITY_ID)).not.toContain("private-unverified");
  });

  it("reports sanitized provider and structural failures", async () => {
    const failing = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("private provider failure"); } });
    await expect(writePitches([FAKE_MERCHANT], INSTITUTION, { model: failing })).rejects.toThrow(FAILURE);
    await expect(writePitches([FAKE_MERCHANT], INSTITUTION, { model: pitchModel({ wrong: [] }) })).rejects.toThrow(FAILURE);
  });

  it("skips unavailable, disabled, empty, and cancelled generation without a model call", async () => {
    expect((await writePitches([FAKE_MERCHANT], INSTITUTION)).size).toBe(0);
    const model = pitchModel({ pitches: [] });
    expect((await writePitches([], INSTITUTION, { model })).size).toBe(0);
    vi.mocked(isAgentDisabled).mockReturnValue(true);
    expect((await writePitches([FAKE_MERCHANT], INSTITUTION, { model })).size).toBe(0);
    await expect(writePitches([FAKE_MERCHANT], INSTITUTION, { model, signal: AbortSignal.abort() })).rejects.toThrow("Research stopped.");
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
