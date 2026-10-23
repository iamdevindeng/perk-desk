// Verifies deterministic rank merging, normalization, brand shares, and nearest-branch deduplication.
// Called by: npm test
import { describe, expect, it } from "vitest";
import {
  assignNearestBranch, compareCandidates, computeBrandShares, countIndependents,
  mergeSeededAndBaseline, scoreCandidates,
} from "@/lib/merchants/scoring";
import { FAKE_BRANCHES, FAKE_CATEGORIES, makeFakeCandidate, makeFakePlace } from "../fixtures/fake-places";

const BRANCH = FAKE_BRANCHES[0];
const CATEGORY = FAKE_CATEGORIES[0];
const BRANDS = [
  { entityId: "00000000-0000-4000-8000-000000000091", name: "Fake Alpha" },
  { entityId: "00000000-0000-4000-8000-000000000092", name: "Fake Beta" },
  { entityId: "00000000-0000-4000-8000-000000000093", name: "Fake Gamma" },
];

describe("seeded and baseline merging", () => {
  it("unions distinct entities and uses baseline length plus one for missing ranks", () => {
    const seeded = [makeFakePlace(1, { affinity: 0.2 }), makeFakePlace(2, { affinity: 0.1 })];
    const baseline = [makeFakePlace(2), makeFakePlace(3)];
    const candidates = mergeSeededAndBaseline(seeded, baseline, BRANCH, CATEGORY);
    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatchObject({ seededRank: 1, baselineRank: null, rankLift: 2, baselineLength: 2, tasteSignal: true });
    expect(candidates[1]).toMatchObject({ seededRank: 2, baselineRank: 1, rankLift: -1, affinity: 0.1 });
    expect(candidates[2]).toMatchObject({ seededRank: null, baselineRank: 2, rankLift: null, affinity: null, tasteSignal: false });
    expect(candidates[0]).toMatchObject({ branchId: BRANCH.id, categoryTagId: CATEGORY.tagId, score: 0, businessMember: false, brandShares: [] });
  });

  it("preserves seeded fields and first ranks when the upstream list repeats an entity", () => {
    const seeded = makeFakePlace(1, { affinity: 0.2, explain: [{ entityId: BRANDS[0].entityId, score: 1 }] });
    const result = mergeSeededAndBaseline([seeded, seeded], [makeFakePlace(1, { affinity: 0.9 })], BRANCH, CATEGORY);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ seededRank: 1, baselineRank: 1, affinity: 0.2, explain: seeded.explain, distanceMeters: 0 });
    expect(result[0].place).toBe(seeded);
  });

  it("handles an empty seeded list and an entirely empty query", () => {
    expect(mergeSeededAndBaseline([], [makeFakePlace(1)], BRANCH, CATEGORY)[0].tasteSignal).toBe(false);
    expect(mergeSeededAndBaseline([], [], BRANCH, CATEGORY)).toEqual([]);
  });
});

describe("candidate scoring", () => {
  it("uses the documented weighted min-max score and three decimal places", () => {
    const seeded = [makeFakePlace(1, { affinity: 0.3 }), makeFakePlace(2, { affinity: 0.1 })];
    const merged = mergeSeededAndBaseline(seeded, seeded, BRANCH, CATEGORY);
    const scored = scoreCandidates(merged, BRANCH);
    expect(scored[0].score).toBe(0.845);
    expect(scored[1].score).toBe(0.445);
    expect(merged[0].score).toBe(0);
  });

  it("normalizes within each branch and category, including the all-equal rule", () => {
    const candidates = [
      makeFakeCandidate(1, { affinity: 0.1 }), makeFakeCandidate(2, { affinity: 0.2 }),
      makeFakeCandidate(3, { affinity: 0.15, categoryTagId: FAKE_CATEGORIES[1].tagId }),
      makeFakeCandidate(4, { affinity: 0.05, branchId: FAKE_BRANCHES[1].id }),
    ];
    const scored = scoreCandidates(candidates, BRANCH);
    const scores = new Map(scored.map((candidate) => [candidate.place.entityId, candidate.score]));
    expect(scores.get(candidates[1].place.entityId)).toBe(scores.get(candidates[2].place.entityId));
    expect(scores.get(candidates[1].place.entityId)).toBe(scores.get(candidates[3].place.entityId));
    expect(scores.get(candidates[1].place.entityId)! - scores.get(candidates[0].place.entityId)!).toBeCloseTo(0.4);
  });

  it("sorts all taste-signaled places before a higher-scoring baseline-only place", () => {
    const taste = makeFakeCandidate(1, { affinity: null, rankLift: -10, distanceMeters: 6000, place: makeFakePlace(1, { businessRating: 0 }) });
    const baseline = makeFakeCandidate(2, { seededRank: null, tasteSignal: false, affinity: null, rankLift: null, distanceMeters: 0, place: makeFakePlace(2, { businessRating: 5 }) });
    const scored = scoreCandidates([baseline, taste], BRANCH);
    expect(scored.map((candidate) => candidate.place.entityId)).toEqual([taste.place.entityId, baseline.place.entityId]);
    expect(scored[0].score).toBeLessThan(scored[1].score);
  });

  it("uses name order for score ties and does not mutate its input", () => {
    const alpha = makeFakeCandidate(1, { place: makeFakePlace(1, { name: "Fake Alpha" }) });
    const zulu = makeFakeCandidate(2, { place: makeFakePlace(2, { name: "Fake Zulu" }) });
    const original = [zulu, alpha];
    expect(scoreCandidates(original, BRANCH).map((candidate) => candidate.place.name)).toEqual(["Fake Alpha", "Fake Zulu"]);
    expect(original[0]).toBe(zulu);
    expect(compareCandidates(alpha, zulu)).toBeLessThan(0);
  });

  it("clamps rank lift and distance and uses the rating fallback", () => {
    const base = makeFakeCandidate(1, { affinity: null, distanceMeters: 9000, rankLift: 30, place: makeFakePlace(1, { businessRating: undefined, tripadvisorRating: undefined }) });
    expect(scoreCandidates([base], BRANCH)[0].score).toBe(0.325);
    expect(scoreCandidates([{ ...base, rankLift: -30 }], BRANCH)[0].score).toBe(0.075);
    expect(scoreCandidates([{ ...base, rankLift: null }], BRANCH)[0].score).toBe(0.075);
    expect(scoreCandidates([{ ...base, place: { ...base.place, tripadvisorRating: 4 } }], BRANCH)[0].score).toBe(0.37);
    expect(scoreCandidates([{ ...base, place: { ...base.place, businessRating: 5, tripadvisorRating: 1 } }], BRANCH)[0].score).toBe(0.4);
  });
});

describe("brand share allocation", () => {
  it("distributes rounding remainders deterministically and totals exactly 100", () => {
    const shares = computeBrandShares(BRANDS.map((brand) => ({ entityId: brand.entityId, score: 1 })), BRANDS);
    expect(shares).toEqual([{ brandName: "Fake Alpha", sharePercent: 34 }, { brandName: "Fake Beta", sharePercent: 33 }, { brandName: "Fake Gamma", sharePercent: 33 }]);
    expect(shares.reduce((sum, share) => sum + share.sharePercent, 0)).toBe(100);
  });

  it("aggregates repeated contributions and excludes unknown or nonpositive signals", () => {
    const shares = computeBrandShares([
      { entityId: BRANDS[0].entityId, score: 1 }, { entityId: BRANDS[0].entityId, score: 2 },
      { entityId: BRANDS[1].entityId, score: 1 }, { entityId: BRANDS[2].entityId, score: -1 },
      { entityId: "00000000-0000-4000-8000-000000000099", score: 100 },
    ], BRANDS);
    expect(shares).toEqual([{ brandName: "Fake Alpha", sharePercent: 75 }, { brandName: "Fake Beta", sharePercent: 25 }]);
    expect(computeBrandShares([], BRANDS)).toEqual([]);
    expect(computeBrandShares([{ entityId: BRANDS[0].entityId, score: 0 }], BRANDS)).toEqual([]);
  });
});

describe("nearest branch and independent count", () => {
  it("keeps the nearest branch even when another branch scored higher", () => {
    const farther = makeFakeCandidate(1, { distanceMeters: 1000, score: 0.9 });
    const nearer = { ...farther, branchId: FAKE_BRANCHES[1].id, distanceMeters: 100, score: 0.2 };
    expect(assignNearestBranch([farther, nearer])).toEqual([nearer]);
    expect(assignNearestBranch([nearer, farther])).toEqual([nearer]);
  });

  it("keeps the higher-scoring category at the chosen branch", () => {
    const first = makeFakeCandidate(1, { score: 0.2 });
    const second = { ...first, categoryTagId: FAKE_CATEGORIES[1].tagId, categoryLabel: "Bakery", score: 0.9 };
    expect(assignNearestBranch([first, second])).toEqual([second]);
    expect(assignNearestBranch([second, first])).toEqual([second]);
  });

  it("counts each independent entity once and excludes multi-location candidates", () => {
    const first = makeFakeCandidate(1);
    expect(countIndependents([first, first, makeFakeCandidate(2), makeFakeCandidate(3, { multiLocation: true })])).toBe(2);
    expect(countIndependents([])).toBe(0);
    expect(assignNearestBranch([])).toEqual([]);
  });
});
