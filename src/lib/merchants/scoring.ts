// Merges place rankings, scores candidates, allocates brand shares, and assigns nearest branches.
// Called by: find-merchants, shortlist, and deterministic scoring unit tests
import { DEFAULT_RATING_NORM, RANK_LIFT_OFFSET, RANK_LIFT_RANGE, RATING_MAX, SCORE_DECIMALS, SCORE_WEIGHTS } from "@/lib/config";
import { haversineMeters } from "@/lib/merchants/distance";
import type { Branch, CategoryTag, MerchantCandidate, MerchantResult, Place, RunRequest } from "@/lib/types";

type LocatedBranch = Branch & { lat: number; lon: number };
type RankedPlace = { place: Place; rank: number };

function indexPlaces(places: Place[]): Map<string, RankedPlace> {
  const indexed = new Map<string, RankedPlace>();
  places.forEach((place, index) => {
    if (!indexed.has(place.entityId)) indexed.set(place.entityId, { place, rank: index + 1 });
  });
  return indexed;
}

export function mergeSeededAndBaseline(
  seeded: Place[], baseline: Place[] | null, branch: LocatedBranch, category: CategoryTag,
): MerchantCandidate[] {
  const seededPlaces = indexPlaces(seeded);
  const baselinePlaces = indexPlaces(baseline ?? []);
  const entityIds = new Set([...seededPlaces.keys(), ...baselinePlaces.keys()]);
  return Array.from(entityIds, (entityId) => {
    const seededPlace = seededPlaces.get(entityId);
    const baselinePlace = baselinePlaces.get(entityId);
    const place = (seededPlace ?? baselinePlace)!.place;
    const seededRank = seededPlace?.rank ?? null;
    const baselineRank = baselinePlace?.rank ?? null;
    return {
      place, categoryTagId: category.tagId, categoryLabel: category.label,
      branchId: branch.id, branchName: branch.name, radiusMeters: branch.radiusMeters,
      distanceMeters: haversineMeters(branch, place), seededRank, baselineRank, baselineLength: baseline?.length ?? 0,
      // A failed baseline is unavailable evidence, not a successful empty ranking.
      rankLift: seededRank === null || baseline === null ? null : (baselineRank ?? baseline.length + 1) - seededRank,
      affinity: seededPlace?.place.affinity ?? null, explain: seededPlace?.place.explain ?? [],
      tasteSignal: seededRank !== null, multiLocation: false, businessMember: false, score: 0, brandShares: [],
    };
  });
}

function normalizedAffinity(candidate: MerchantCandidate, candidates: MerchantCandidate[]): number {
  if (candidate.affinity === null || candidate.seededRank === null) return 0;
  const affinities = candidates.filter((other) => other.branchId === candidate.branchId &&
    other.categoryTagId === candidate.categoryTagId && other.seededRank !== null && other.affinity !== null)
    .map((other) => other.affinity as number);
  const minimum = Math.min(...affinities);
  const maximum = Math.max(...affinities);
  return maximum === minimum ? 1 : (candidate.affinity - minimum) / (maximum - minimum);
}

function candidateScore(candidate: MerchantCandidate, candidates: MerchantCandidate[], radiusMeters: number): number {
  const affinity = normalizedAffinity(candidate, candidates);
  const lift = candidate.rankLift === null ? 0 : Math.max(0, Math.min((candidate.rankLift + RANK_LIFT_OFFSET) / RANK_LIFT_RANGE, 1));
  const distance = 1 - Math.min(candidate.distanceMeters / radiusMeters, 1);
  const ratingValue = candidate.place.businessRating ?? candidate.place.tripadvisorRating;
  const rating = ratingValue === undefined ? DEFAULT_RATING_NORM : ratingValue / RATING_MAX;
  const score = affinity * SCORE_WEIGHTS.affinity + lift * SCORE_WEIGHTS.lift +
    distance * SCORE_WEIGHTS.distance + rating * SCORE_WEIGHTS.rating;
  return Number(score.toFixed(SCORE_DECIMALS));
}

export function compareCandidates(first: MerchantCandidate, second: MerchantCandidate): number {
  return Number(second.tasteSignal) - Number(first.tasteSignal) || second.score - first.score ||
    first.place.name.localeCompare(second.place.name, "en");
}

export function scoreCandidates(candidates: MerchantCandidate[], branch: Branch): MerchantCandidate[] {
  // Score the complete merged list before filtering; original seeded affinity bounds matter (ARCHITECTURE.md §6.2).
  return candidates.map((candidate) => ({
    ...candidate, score: candidateScore(candidate, candidates, branch.radiusMeters),
  })).sort(compareCandidates);
}

function shareRows(explain: Place["explain"], brands: RunRequest["brands"]): { brandName: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const contribution of explain) {
    if (!Number.isFinite(contribution.score) || contribution.score <= 0) continue;
    scores.set(contribution.entityId, (scores.get(contribution.entityId) ?? 0) + contribution.score);
  }
  return brands.filter((brand) => scores.has(brand.entityId))
    .map((brand) => ({ brandName: brand.name, score: scores.get(brand.entityId)! }));
}

export function computeBrandShares(explain: Place["explain"], brands: RunRequest["brands"]): MerchantResult["brandShares"] {
  const rows = shareRows(explain, brands);
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  if (total === 0) return [];
  const shares = rows.map((row) => {
    const exact = row.score / total * 100;
    return { brandName: row.brandName, sharePercent: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  // Largest remainder prevents independent rounding from yielding 99% or 101%. See QLOO_API.md §6.
  shares.sort((first, second) => second.remainder - first.remainder || first.brandName.localeCompare(second.brandName, "en"));
  const remaining = 100 - shares.reduce((sum, share) => sum + share.sharePercent, 0);
  for (let i = 0; i < remaining; i++) shares[i].sharePercent += 1;
  return shares.filter((share) => share.sharePercent > 0)
    .sort((first, second) => second.sharePercent - first.sharePercent || first.brandName.localeCompare(second.brandName, "en"))
    .map(({ brandName, sharePercent }) => ({ brandName, sharePercent }));
}

function preferCandidate(candidate: MerchantCandidate, current: MerchantCandidate): boolean {
  if (candidate.distanceMeters !== current.distanceMeters) return candidate.distanceMeters < current.distanceMeters;
  if (candidate.branchId !== current.branchId) return candidate.branchId.localeCompare(current.branchId, "en") < 0;
  if (candidate.score !== current.score) return candidate.score > current.score;
  return candidate.categoryTagId.localeCompare(current.categoryTagId, "en") < 0;
}

export function assignNearestBranch(candidates: MerchantCandidate[]): MerchantCandidate[] {
  const nearest = new Map<string, MerchantCandidate>();
  for (const candidate of candidates) {
    const current = nearest.get(candidate.place.entityId);
    if (!current || preferCandidate(candidate, current)) nearest.set(candidate.place.entityId, candidate);
  }
  return Array.from(nearest.values()).sort(compareCandidates);
}

export function countIndependents(candidates: MerchantCandidate[]): number {
  return new Set(candidates.filter((candidate) => !candidate.multiLocation).map((candidate) => candidate.place.entityId)).size;
}
