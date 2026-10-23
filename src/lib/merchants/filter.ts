// Removes ineligible merchants and counts each candidate's first exclusion reason.
// Called by: merchant research tools, fallback research, and filter unit tests.
import { RADIUS_SLACK } from "@/lib/config";
import { getBlacklist } from "@/lib/data";
import { isNationalChain } from "@/lib/merchants/chains";
import { nameMatches } from "@/lib/merchants/name-match";
import type { MerchantCandidate, RunResult } from "@/lib/types";

export type FilterRules = { signedNames: string[]; excludeEntityIds: string[] };
type ExcludedCounts = RunResult["excludedCounts"];
export type FilteredPlaces = { kept: MerchantCandidate[]; excludedCounts: ExcludedCounts };

function exclusionReason(candidate: MerchantCandidate, rules: FilterRules): keyof ExcludedCounts | null {
  const place = candidate.place;
  if (place.isClosed) return "closed";
  // Keep the full remainder: nested genres are not merely their final segment.
  const genre = place.primaryGenreId?.replace(/^urn:tag:genre:place:/, "");
  if (genre && getBlacklist().noisePrimaryGenres.includes(genre)) return "noiseGenre";
  if (rules.excludeEntityIds.includes(place.entityId) || nameMatches(place.name, rules.signedNames)) {
    return "signedOrExcluded";
  }
  if (isNationalChain(place.name)) return "nationalChain";
  return null;
}

export function filterPlaces(candidates: MerchantCandidate[], rules: FilterRules): FilteredPlaces {
  const excludedCounts: ExcludedCounts = { nationalChain: 0, noiseGenre: 0, closed: 0, signedOrExcluded: 0 };
  const kept: MerchantCandidate[] = [];
  for (const candidate of candidates) {
    const reason = exclusionReason(candidate, rules);
    if (reason) {
      excludedCounts[reason] += 1;
      continue;
    }
    // Radius is a query guard, not an extra report field (ARCHITECTURE §3 and §6.2).
    if (candidate.distanceMeters > candidate.radiusMeters * RADIUS_SLACK) continue;
    kept.push(candidate);
  }
  return { kept, excludedCounts };
}
