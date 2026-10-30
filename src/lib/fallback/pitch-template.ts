// Renders a finite set of recruiting pitches from verified card facts, with a short fallback.
// Called by: pitch prompts, pitch-writer, pitch guards, research assembly, and cached replay.
import { z } from "zod";
import { PITCH_CALL_MINUTES, PITCH_MAX_CHARACTERS, RATING_MAX } from "@/lib/config";
import type { MerchantResult } from "@/lib/types";

export const PitchFactSchema = z.enum(["category", "taste", "distance", "rating"]);
export type PitchFact = z.infer<typeof PitchFactSchema>;
type PitchFactOption = { fact: PitchFact; sentence: string };

function quotedLabel(label: string): string {
  // Quotes and escaped controls keep names visibly separate from our assertions (ARCHITECTURE §6.3).
  return JSON.stringify(label).replace(/[\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function ratingSentence(card: MerchantResult): string | null {
  const ratings = [
    { value: card.place.businessRating, source: "business" },
    { value: card.place.tripadvisorRating, source: "Tripadvisor" },
  ];
  const rating = ratings.find(({ value }) => value !== undefined && Number.isFinite(value) && value >= 0 && value <= RATING_MAX);
  return rating ? `Qloo lists a ${rating.value}-star ${rating.source} rating for your business.` : null;
}

export function getPitchFacts(card: MerchantResult): PitchFactOption[] {
  const facts: PitchFactOption[] = [];
  const brands = card.brandShares.filter((brand) => brand.brandName.trim() && Number.isFinite(brand.sharePercent) && brand.sharePercent > 0);
  if (card.tasteSignal && brands.length) {
    facts.push({ fact: "taste", sentence: `Qloo's taste results connect your business with the supplied brands ${brands.map((brand) => quotedLabel(brand.brandName)).join(", ")}.` });
  }
  if (card.categoryLabel.trim() && card.branchName.trim()) {
    facts.push({ fact: "category", sentence: `Qloo lists your business as a ${quotedLabel(card.categoryLabel)} option near our ${quotedLabel(card.branchName)} branch.` });
  }
  if (Number.isFinite(card.distanceMeters) && card.distanceMeters >= 0 && card.branchName.trim()) {
    facts.push({ fact: "distance", sentence: `Your business is about ${(card.distanceMeters / 1000).toFixed(1)} km from our ${quotedLabel(card.branchName)} branch.` });
  }
  const rating = ratingSentence(card);
  if (rating) facts.push({ fact: "rating", sentence: rating });
  return facts;
}

function invitation(): string {
  return `Would you be open to a ${PITCH_CALL_MINUTES}-minute call about a possible member offer?`;
}

function shortPitch(card: MerchantResult): string {
  return `Hi ${quotedLabel(card.place.name)} team. We are exploring a local member-perks program. ${invitation()}`;
}

export function renderFactPitch(card: MerchantResult, institutionName: string, fact: PitchFact): string | null {
  const selected = getPitchFacts(card).find((option) => option.fact === fact);
  if (!selected || !card.place.name.trim()) return null;
  const institution = institutionName.trim() ? quotedLabel(institutionName) : "our credit union";
  const pitch = `Hi ${quotedLabel(card.place.name)} team, ${institution} is exploring a local member-perks program. ${selected.sentence} ${invitation()}`;
  return pitch.length <= PITCH_MAX_CHARACTERS ? pitch : null;
}

export function buildTemplatePitch(card: MerchantResult, institutionName: string): string {
  for (const option of getPitchFacts(card)) {
    const pitch = renderFactPitch(card, institutionName, option.fact);
    if (pitch) return pitch;
  }
  // Preserve the full identity; the caller leaves the pitch empty if even this exceeds the limit.
  return shortPitch(card);
}

export function isControlledPitch(pitch: string, card: MerchantResult, institutionName: string): boolean {
  if (!card.place.name.trim() || !pitch || pitch.length > PITCH_MAX_CHARACTERS) return false;
  // Every candidate is exactly three code-owned sentences; punctuation inside quoted labels is data.
  return pitch === shortPitch(card) || getPitchFacts(card).some((option) => renderFactPitch(card, institutionName, option.fact) === pitch);
}
