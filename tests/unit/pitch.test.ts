// Checks grounded pitch validation, safe templates, and batched generation with a scripted model.
// Called by: npm test; all generation uses MockLanguageModelV4 without network calls.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { checkPitch } from "@/lib/agent/guards";
import { writePitches } from "@/lib/agent/pitch-writer";
import { PITCH_MAX_CHARACTERS } from "@/lib/config";
import { hasDeepSeekKey, isAgentDisabled } from "@/lib/env";
import { buildTemplatePitch } from "@/lib/fallback/pitch-template";
import { FAKE_MERCHANT } from "../fixtures/fake-plan";

vi.mock("@/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env")>();
  return { ...original, hasDeepSeekKey: vi.fn(), isAgentDisabled: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasDeepSeekKey).mockReturnValue(false);
  vi.mocked(isAgentDisabled).mockReturnValue(false);
});

function pitchModel(output: unknown): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: {
    content: [{ type: "text", text: JSON.stringify(output) }],
    finishReason: { unified: "stop", raw: "stop" }, warnings: [],
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
  } });
}

describe("pitch guard", () => {
  it("rejects invented numbers, four sentences, absent names, and oversized text", () => {
    expect(checkPitch("Fake Corner Cafe offers 20% off.", FAKE_MERCHANT)).toBe(false);
    expect(checkPitch("Fake Corner Cafe is nearby. It serves coffee. Members like coffee. Call us?", FAKE_MERCHANT)).toBe(false);
    expect(checkPitch("A local cafe is nearby.", FAKE_MERCHANT)).toBe(false);
    expect(checkPitch(`Fake Corner Cafe ${"x".repeat(PITCH_MAX_CHARACTERS)}`, FAKE_MERCHANT)).toBe(false);
    expect(checkPitch("", FAKE_MERCHANT)).toBe(false);
  });

  it("accepts card ratings, count, rounded distance, rank lift, brand shares, and the call length", () => {
    const card = { ...FAKE_MERCHANT, rankLift: -2 };
    const pitch = "Fake Corner Cafe has a 4.5 rating and 12 reviews, 0.1 km away. Its brand share is 100% and rank shift is 2. Discuss a 10-minute call?";
    expect(checkPitch(pitch, card)).toBe(true);
  });

  it("allows numbers in exact card identities without allowing unsupported numeric claims", () => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name: "Dr. 42 Bean!" }, branchName: "Branch 4" };
    expect(checkPitch("Dr. 42 Bean! is near Branch 4. Discuss a 10-minute call?", card)).toBe(true);
    expect(checkPitch("Dr. 42 Bean! offers 40% off near Branch 4.", card)).toBe(false);
    expect(checkPitch("Dr. 42 Bean! offers 42% off near Branch 4.", card)).toBe(false);
  });
});

describe("pitch templates", () => {
  it("produces a valid three-sentence pitch from supported taste and rating fields", () => {
    const pitch = buildTemplatePitch(FAKE_MERCHANT, "Fake Community CU");
    expect(checkPitch(pitch, FAKE_MERCHANT)).toBe(true);
    expect(pitch).toContain(FAKE_MERCHANT.place.name);
    expect(pitch).toContain("Qloo taste data links");
    expect(pitch).toContain("4.5-star rating");
  });

  it("uses category language for baseline-only merchants and omits absent ratings", () => {
    const card = { ...FAKE_MERCHANT, tasteSignal: false, place: { ...FAKE_MERCHANT.place, businessRating: undefined } };
    const pitch = buildTemplatePitch(card, "Fake Community CU");
    expect(checkPitch(pitch, card)).toBe(true);
    expect(pitch).toContain("Qloo lists your business");
    expect(pitch).not.toContain("taste data links");
    expect(pitch).not.toContain("star rating");
  });

  it("preserves numbered/punctuated merchant labels and substitutes unsafe institution labels", () => {
    const card = {
      ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name: "Dr. 42 Bean, Co." }, branchName: "St. 7 Branch",
      brandShares: [{ brandName: "Coffee 31 Co.", sharePercent: 100 }],
    };
    const pitch = buildTemplatePitch(card, "CU 99 Inc.");
    expect(checkPitch(pitch, card)).toBe(true);
    expect(pitch).toContain("Dr. 42 Bean, Co.");
    expect(pitch).toContain("our credit union");
    expect(pitch).not.toContain("CU 99");
  });

  it("omits long optional context while preserving the merchant identity", () => {
    const card = { ...FAKE_MERCHANT, branchName: "Fake ".repeat(100) };
    const pitch = buildTemplatePitch(card, "Long ".repeat(100));
    expect(checkPitch(pitch, card)).toBe(true);
    expect(pitch).toContain(FAKE_MERCHANT.place.name);
    expect(pitch.length).toBeLessThanOrEqual(PITCH_MAX_CHARACTERS);
  });

  it("does not truncate an impossible over-limit merchant identity", () => {
    const name = "Fake ".repeat(PITCH_MAX_CHARACTERS);
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name } };
    const pitch = buildTemplatePitch(card, "Fake CU");
    expect(pitch).toContain(name);
    expect(checkPitch(pitch, card)).toBe(false);
  });
});

describe("batched pitch writing", () => {
  it("keeps valid known merchant pitches and ignores unsupported claims or unknown IDs", async () => {
    const firstPitch = buildTemplatePitch(FAKE_MERCHANT, "Fake CU");
    const second = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, entityId: "00000000-0000-4000-8000-000000000003", name: "Fake Tea Shop" } };
    const model = pitchModel({ pitches: [
      { entityId: FAKE_MERCHANT.place.entityId, pitch: firstPitch },
      { entityId: second.place.entityId, pitch: "Fake Tea Shop offers 20% off." },
      { entityId: "00000000-0000-4000-8000-000000000004", pitch: firstPitch },
    ] });
    const pitches = await writePitches([FAKE_MERCHANT, second], "Fake CU", { model });
    expect([...pitches]).toEqual([[FAKE_MERCHANT.place.entityId, firstPitch]]);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0].providerOptions).toEqual({ deepseek: { thinking: { type: "disabled" } } });
    expect(model.doGenerateCalls[0].temperature).toBe(0);
  });

  it("reports sanitized failure when generation or structured-output validation fails", async () => {
    const failing = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("private provider failure"); } });
    await expect(writePitches([FAKE_MERCHANT], "Fake CU", { model: failing })).rejects.toThrow("Pitch writing was unavailable; template pitches were used.");
    await expect(writePitches([FAKE_MERCHANT], "Fake CU", { model: pitchModel({ wrong: [] }) })).rejects.toThrow("Pitch writing was unavailable; template pitches were used.");
  });

  it("skips unavailable, disabled, or empty generation without a model call", async () => {
    expect((await writePitches([FAKE_MERCHANT], "Fake CU")).size).toBe(0);
    const model = pitchModel({ pitches: [] });
    expect((await writePitches([], "Fake CU", { model })).size).toBe(0);
    vi.mocked(isAgentDisabled).mockReturnValue(true);
    expect((await writePitches([FAKE_MERCHANT], "Fake CU", { model })).size).toBe(0);
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
