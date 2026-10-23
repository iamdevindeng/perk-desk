// Builds short recruiting pitches from card facts, with an honest category-only fallback.
// Called by: research result assembly when an agent pitch is missing or rejected.
import { PITCH_CALL_MINUTES } from "@/lib/config";
import { checkPitch } from "@/lib/agent/guards";
import type { MerchantResult } from "@/lib/types";

function matchSentence(card: MerchantResult): string {
  const brands = card.brandShares.map((brand) => brand.brandName).join(", ");
  const rating = card.place.businessRating === undefined ? "" : `, and your ${card.place.businessRating}-star rating stands out`;
  if (card.tasteSignal && brands) {
    return `Qloo taste data links our members' favorite brands (${brands}) to ${card.categoryLabel} spots like yours${rating}.`;
  }
  return `Qloo lists your business as a nearby ${card.categoryLabel} option${rating}.`;
}

export function buildTemplatePitch(card: MerchantResult, institutionName: string): string {
  // The guard knows card labels, but cannot validate digits/periods in an institution label.
  const institution = !institutionName.trim() || /[\d.!?]/.test(institutionName) ? "our credit union" : institutionName;
  const invitation = `Would you be open to a ${PITCH_CALL_MINUTES}-minute call about featuring a member offer?`;
  const full = `Hi ${card.place.name} team, ${institution} is building a local perks program for members near our ${card.branchName} branch. ${matchSentence(card)} ${invitation}`;
  if (checkPitch(full, card)) return full;
  // Long labels must not silently change the merchant's identity; omit optional context instead.
  return `Hi ${card.place.name} team. We are building a local member-perks program. ${invitation}`;
}
