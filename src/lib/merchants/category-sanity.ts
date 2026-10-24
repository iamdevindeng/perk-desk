// Rejects clear category contradictions using only existing place genres and names.
// Called by: merchant filtering, cached-run validation, and category-sanity unit tests.
import { normalizeName } from "@/lib/merchants/name-match";
import type { Place } from "@/lib/types";

type CategoryDenyRule = { hints: RegExp; allowedPhrases?: RegExp; knownNames: string[] };

const CATEGORY_DENY_RULES: Record<string, CategoryDenyRule> = {
  "urn:tag:category:place:coffee_shop": {
    hints: /\b(?:bars?|candy|candies)\b/,
    allowedPhrases: /\b(?:coffee|espresso) bars?\b/g,
    // These names were confirmed by the owner in FIXES-R6 R27; no response data is retained.
    knownNames: ["Death & Co Denver"].map(normalizeName),
  },
  "urn:tag:category:place:gym": {
    hints: /\b(?:country clubs?|university|universities|campus)\b/,
    knownNames: ["Denver Country Club", "The Denver Athletic Club", "Gregory Gym"].map(normalizeName),
  },
};

function hasDenyHint(value: string, rule: CategoryDenyRule): boolean {
  // Separators delimit genre words too, including nested genre IDs. Whole words avoid "barista".
  const normalized = normalizeName(value.replace(/[:_]/g, " "));
  const words = rule.allowedPhrases ? normalized.replace(rule.allowedPhrases, " ") : normalized;
  return rule.hints.test(words);
}

export function isCategoryMismatch(place: Place, categoryTagId: string): boolean {
  const rule = CATEGORY_DENY_RULES[categoryTagId];
  if (!rule) return false;
  if (rule.knownNames.includes(normalizeName(place.name))) return true;
  return hasDenyHint(place.primaryGenreId ?? "", rule) || hasDenyHint(place.name, rule);
}
