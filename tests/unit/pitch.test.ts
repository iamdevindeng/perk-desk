// Checks the closed pitch grammar, factual eligibility, and deterministic template fallback.
// Called by: npm test with fictional cards and no model or network calls.
import { describe, expect, it } from "vitest";
import { checkPitch } from "@/lib/agent/guards";
import { PITCH_MAX_CHARACTERS } from "@/lib/config";
import { buildTemplatePitch, getPitchFacts, renderFactPitch } from "@/lib/fallback/pitch-template";
import { FAKE_MERCHANT } from "../fixtures/fake-plan";

const INSTITUTION = "Fake Community CU";

describe("pitch guard", () => {
  it("rejects invented numbers, four sentences, absent names, and oversized text", () => {
    expect(checkPitch("Fake Corner Cafe offers 20% off.", FAKE_MERCHANT)).toBe(false);
    expect(checkPitch("Fake Corner Cafe is nearby. It serves coffee. Members like coffee. Call us?", FAKE_MERCHANT)).toBe(false);
    expect(checkPitch("A local cafe is nearby.", FAKE_MERCHANT)).toBe(false);
    expect(checkPitch(`Fake Corner Cafe ${"x".repeat(PITCH_MAX_CHARACTERS)}`, FAKE_MERCHANT)).toBe(false);
    expect(checkPitch("", FAKE_MERCHANT)).toBe(false);
  });

  it("rejects free prose even when every number appears on the card", () => {
    const card = { ...FAKE_MERCHANT, rankLift: -2 };
    const pitch = "Fake Corner Cafe has a 4.5 rating and 12 reviews, 0.1 km away. Its brand share is 100% and rank shift is 2. Discuss a 10-minute call?";
    expect(checkPitch(pitch, card)).toBe(false);
  });

  it.each([
    "has agreed to offer 10% off", "offers 10% off", "offers 10 percent off",
    "offers a 10% discount", "offers a discount of 10 percent", "offers $10 off",
    "has a confirmed partnership", "has an agreed partnership", "has already partnered with our credit union",
    "is our partner", "has a partnership that is confirmed", "has agreed to join our program",
    "has agreed to participate", "lets members save 10%", "offers a 10-percent discount", "offers 10 PERCENT OFF",
    "offers a 10% member discount", "offers a 10 percent exclusive discount",
    "offers a 10-percent member-only discount", "offers a $10 loyalty discount",
    "lets members save up to 10%", "offers a discount worth 10%",
    "has agreed to be partners", "and our credit union are confirmed partners",
  ])("rejects unsupported agreements and discounts: %s", (claim) => {
    expect(checkPitch(`Fake Corner Cafe ${claim}.`, FAKE_MERCHANT)).toBe(false);
  });

  it.each([
    "is a proven favorite of your members", "is a favourite among our members",
    "is your members' favorite", "is a place your members love", "matches your members' tastes",
    "has a proven taste link to your members", "is a preference match for members",
    "is loved by our members", "is popular with your members", "is a place our members enjoy",
    "matches the tastes of your members", "is a favorite local spot for your members",
    "matches the preferences of our members", "is a favourite local shop among our members",
  ])("rejects unsupported baseline taste claims: %s", (claim) => {
    expect(checkPitch(`Fake Corner Cafe ${claim}.`, { ...FAKE_MERCHANT, tasteSignal: false })).toBe(false);
  });

  it("rejects unrecognized prose even when it sounds like a safe invitation", () => {
    expect(checkPitch("Fake Corner Cafe is nearby. Would you discuss a possible partnership on a 10-minute call?", FAKE_MERCHANT)).toBe(false);
    expect(checkPitch("Fake Corner Cafe is 20 km away.", FAKE_MERCHANT)).toBe(false);
  });

  it.each([
    ["10", "offers 10% off"], ["10% off", "offers 10% off"],
    ["partnership", "has a confirmed partnership"], ["confirmed partnership", "has a confirmed partnership"],
    ["tastes", "matches the tastes of your members"], ["favorite local spot for your members", "is a favorite local spot for your members"],
  ])("does not let a branch named %s hide an unsupported claim", (branchName, claim) => {
    const card = { ...FAKE_MERCHANT, branchName, tasteSignal: false };
    expect(checkPitch(`Fake Corner Cafe ${claim}.`, card)).toBe(false);
  });

  it("checks claims after an exempt merchant name, including repeated discount text", () => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name: "10% Off Cafe" } };
    expect(checkPitch(buildTemplatePitch(card, INSTITUTION), card, INSTITUTION)).toBe(true);
    expect(checkPitch("10% Off Cafe offers 10% off.", card)).toBe(false);
    expect(checkPitch("10% Off Cafe offers a 10% member discount.", card)).toBe(false);
  });

  it("allows numbers in exact card identities without allowing unsupported numeric claims", () => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name: "Dr. 42 Bean!" }, branchName: "Branch 4" };
    expect(checkPitch(buildTemplatePitch(card, INSTITUTION), card, INSTITUTION)).toBe(true);
    expect(checkPitch("Dr. 42 Bean! offers 40% off near Branch 4.", card)).toBe(false);
    expect(checkPitch("Dr. 42 Bean! offers 42% off near Branch 4.", card)).toBe(false);
  });
});

describe("verified facts and templates", () => {
  it.each(["category", "taste", "distance", "rating"] as const)("renders the supplied %s fact using the current card", (fact) => {
    const pitch = renderFactPitch(FAKE_MERCHANT, INSTITUTION, fact);
    expect(pitch).not.toBeNull();
    expect(checkPitch(pitch!, FAKE_MERCHANT, INSTITUTION)).toBe(true);
    expect(pitch).toContain('Hi "Fake Corner Cafe" team');
    expect(pitch).toContain("10-minute call about a possible member offer?");
    expect(checkPitch(`${pitch} We are confirmed partners.`, FAKE_MERCHANT, INSTITUTION)).toBe(false);
    expect(checkPitch(pitch!, FAKE_MERCHANT, "Another CU")).toBe(false);
  });

  it("uses source-specific facts and rejects numbers copied into another meaning", () => {
    const facts = getPitchFacts(FAKE_MERCHANT);
    expect(facts).toContainEqual({ fact: "distance", sentence: 'Your business is about 0.1 km from our "Fake Central Branch" branch.' });
    expect(facts).toContainEqual({ fact: "rating", sentence: "Qloo lists a 4.5-star business rating for your business." });
    const pitch = renderFactPitch(FAKE_MERCHANT, INSTITUTION, "distance")!;
    expect(checkPitch(pitch.replace("0.1 km", "4.5 km"), FAKE_MERCHANT, INSTITUTION)).toBe(false);
    expect(checkPitch(pitch.replace("10-minute call", "10% discount"), FAKE_MERCHANT, INSTITUTION)).toBe(false);
  });

  it.each([false, true])("requires a taste signal and supporting brands (signal=%s)", (tasteSignal) => {
    const card = { ...FAKE_MERCHANT, tasteSignal, brandShares: [] };
    expect(getPitchFacts(card).some((option) => option.fact === "taste")).toBe(false);
    expect(renderFactPitch(card, INSTITUTION, "taste")).toBeNull();
    const baseline = { ...FAKE_MERCHANT, tasteSignal: false };
    const pitch = buildTemplatePitch(baseline, INSTITUTION);
    expect(checkPitch(pitch, baseline, INSTITUTION)).toBe(true);
    expect(pitch).toContain('as a "Coffee shop" option');
    expect(pitch).not.toContain("taste");
  });

  it.each([undefined, -1, 6, NaN, Infinity])("omits unsupported ratings (%s) without inventing a default", (businessRating) => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, businessRating, tripadvisorRating: undefined } };
    expect(renderFactPitch(card, INSTITUTION, "rating")).toBeNull();
    expect(checkPitch(buildTemplatePitch(card, INSTITUTION), card, INSTITUTION)).toBe(true);
  });

  it("can use a valid Tripadvisor rating, including a zero value", () => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, businessRating: undefined, tripadvisorRating: 0 } };
    expect(getPitchFacts(card)).toContainEqual({ fact: "rating", sentence: "Qloo lists a 0-star Tripadvisor rating for your business." });
  });

  it.each([-1, NaN, Infinity])("does not expose an invalid distance (%s)", (distanceMeters) => {
    expect(renderFactPitch({ ...FAKE_MERCHANT, distanceMeters }, INSTITUTION, "distance")).toBeNull();
  });

  it.each(["Dr. 42 Bean, Co.", "10% Off Cafe", "Confirmed Partnership Cafe", "Members' Favorite Cafe", 'Fake "Cafe". We are partners.\n'])
  ("keeps %s inside the quoted identity, with no global name masking", (name) => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name }, branchName: "10% off", tasteSignal: false };
    const pitch = buildTemplatePitch(card, 'CU 99 "Partners"');
    expect(checkPitch(pitch, card, 'CU 99 "Partners"')).toBe(true);
    expect(pitch).toContain(JSON.stringify(name));
    expect(pitch).toContain('our "10% off" branch');
    expect(pitch).not.toContain("\n");
    expect(checkPitch(pitch.replace("a possible member offer", "confirmed partners"), card, 'CU 99 "Partners"')).toBe(false);
  });

  it("escapes bidi controls instead of letting a name rearrange controlled sentences", () => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name: "Fake\u202e Cafe" } };
    const pitch = buildTemplatePitch(card, INSTITUTION);
    expect(pitch).toContain("Fake\\u202e Cafe");
    expect(pitch).not.toContain("\u202e");
    expect(checkPitch(pitch, card, INSTITUTION)).toBe(true);
  });

  it("uses a short template for long context while preserving the merchant identity", () => {
    const card = { ...FAKE_MERCHANT, branchName: "Fake ".repeat(100) };
    const pitch = buildTemplatePitch(card, "Long ".repeat(100));
    expect(pitch).toBe('Hi "Fake Corner Cafe" team. We are exploring a local member-perks program. Would you be open to a 10-minute call about a possible member offer?');
    expect(checkPitch(pitch, card, "Long ".repeat(100))).toBe(true);
  });

  it("does not truncate an impossible over-limit merchant identity", () => {
    const name = "Fake ".repeat(PITCH_MAX_CHARACTERS);
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name } };
    const pitch = buildTemplatePitch(card, INSTITUTION);
    expect(pitch).toContain(name);
    expect(checkPitch(pitch, card, INSTITUTION)).toBe(false);
  });

  it("accepts the exact length limit and rejects one extra identity character", () => {
    const longInstitution = "Long ".repeat(200);
    const short = buildTemplatePitch(FAKE_MERCHANT, longInstitution);
    const name = "N".repeat(PITCH_MAX_CHARACTERS - short.length + FAKE_MERCHANT.place.name.length);
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name } };
    const pitch = buildTemplatePitch(card, longInstitution);
    expect(pitch.length).toBe(PITCH_MAX_CHARACTERS);
    expect(checkPitch(pitch, card, longInstitution)).toBe(true);
    const longer = { ...card, place: { ...card.place, name: `${name}N` } };
    expect(checkPitch(buildTemplatePitch(longer, longInstitution), longer, longInstitution)).toBe(false);
  });

  it("rejects a once-valid pitch when its supporting card fact changes", () => {
    const pitch = renderFactPitch(FAKE_MERCHANT, INSTITUTION, "rating")!;
    const changed = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, businessRating: 3 } };
    expect(checkPitch(pitch, changed, INSTITUTION)).toBe(false);
  });
});
