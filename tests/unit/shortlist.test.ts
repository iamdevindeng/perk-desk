// Tests fair branch allocation, category diversity, and unique merchant assignment.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { buildShortlist } from "@/lib/merchants/shortlist";
import { normalizeName } from "@/lib/merchants/name-match";
import type { MerchantCandidate } from "@/lib/types";
import { FAKE_BRANCHES, FAKE_CATEGORIES, makeFakeCandidate, makeFakePlace } from "../fixtures/fake-places";

function plentyOfCandidates(): Map<string, MerchantCandidate[]> {
  const byCategory = new Map<string, MerchantCandidate[]>();
  for (const [categoryIndex, category] of FAKE_CATEGORIES.entries()) {
    const candidates = FAKE_BRANCHES.flatMap((branch, branchIndex) => Array.from({ length: 6 }, (_, index) => {
      const candidateIndex = categoryIndex * 18 + branchIndex * 6 + index + 1;
      return makeFakeCandidate(candidateIndex, {
        branchId: branch.id, branchName: branch.name, categoryTagId: category.tagId, categoryLabel: category.label,
        score: 1 - index / 10,
      });
    }));
    byCategory.set(category.tagId, candidates);
  }
  return byCategory;
}

describe("balanced shortlist", () => {
  it("selects 10 unique merchants and at least 3 per branch from 3 branches and 2 categories", () => {
    const result = buildShortlist(plentyOfCandidates(), FAKE_BRANCHES);
    expect(result).toHaveLength(10);
    expect(new Set(result.map((candidate) => candidate.place.entityId)).size).toBe(10);
    for (const branch of FAKE_BRANCHES) {
      const branchCandidates = result.filter((candidate) => candidate.branchId === branch.id);
      expect(branchCandidates.length).toBeGreaterThanOrEqual(3);
      expect(branchCandidates.length).toBeLessThanOrEqual(4);
      expect(new Set(branchCandidates.map((candidate) => candidate.categoryTagId)).size).toBe(2);
    }
  });

  it("fills an empty branch's quota from the remaining best merchants", () => {
    const categories = plentyOfCandidates();
    for (const [tagId, candidates] of categories) categories.set(tagId, candidates.filter((candidate) => candidate.branchId !== FAKE_BRANCHES[2].id));
    const result = buildShortlist(categories, FAKE_BRANCHES);
    expect(result).toHaveLength(10);
    expect(result.some((candidate) => candidate.branchId === FAKE_BRANCHES[2].id)).toBe(false);
    expect(result.filter((candidate) => candidate.branchId === FAKE_BRANCHES[0].id).length).toBeGreaterThanOrEqual(4);
    expect(result.filter((candidate) => candidate.branchId === FAKE_BRANCHES[1].id).length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the nearest branch and then the highest scoring category for duplicate entities", () => {
    const common = makeFakeCandidate(1, { branchId: FAKE_BRANCHES[0].id, distanceMeters: 100 });
    const preferred = { ...common, score: 0.8, categoryTagId: FAKE_CATEGORIES[1].tagId };
    const farther = { ...common, branchId: FAKE_BRANCHES[1].id, distanceMeters: 200, score: 1 };
    const categories = new Map([
      [FAKE_CATEGORIES[0].tagId, [{ ...common, score: 0.2 }, farther]],
      [FAKE_CATEGORIES[1].tagId, [preferred]],
    ]);
    expect(buildShortlist(categories, FAKE_BRANCHES)).toEqual([preferred]);
  });

  it("round-robins categories even when one category has all the higher scores", () => {
    const categories = plentyOfCandidates();
    const lowCategory = FAKE_CATEGORIES[1].tagId;
    categories.set(lowCategory, categories.get(lowCategory)!.map((candidate) => ({ ...candidate, score: 0.01 })));
    const result = buildShortlist(categories, [FAKE_BRANCHES[0]], 4);
    expect(result.filter((candidate) => candidate.categoryTagId === lowCategory)).toHaveLength(2);
  });

  it("sorts the selected set by taste signal, score, and then name", () => {
    const branchId = FAKE_BRANCHES[0].id;
    const candidates = [
      makeFakeCandidate(1, { branchId, tasteSignal: false, score: 1 }),
      makeFakeCandidate(2, { branchId, tasteSignal: true, score: 0.5, place: makeFakePlace(2, { name: "Fake Zebra" }) }),
      makeFakeCandidate(3, { branchId, tasteSignal: true, score: 0.5, place: makeFakePlace(3, { name: "Fake Apple" }) }),
      makeFakeCandidate(4, { branchId, tasteSignal: true, score: 0.8 }),
    ];
    const result = buildShortlist(new Map([[FAKE_CATEGORIES[0].tagId, candidates]]), [FAKE_BRANCHES[0]]);
    expect(result.map((candidate) => candidate.place.entityId)).toEqual([3, 2, 1, 0].map((index) => candidates[index].place.entityId));
  });

  it("never mutates caller arrays, candidates, or category order", () => {
    const categories = plentyOfCandidates();
    const before = structuredClone(categories);
    buildShortlist(categories, FAKE_BRANCHES);
    expect(categories).toEqual(before);
    expect(buildShortlist(categories, FAKE_BRANCHES)).toEqual(buildShortlist(categories, FAKE_BRANCHES));
  });

  it("handles empty branches, no candidates, and a zero total", () => {
    expect(buildShortlist(new Map(), FAKE_BRANCHES)).toEqual([]);
    expect(buildShortlist(plentyOfCandidates(), [])).toEqual([]);
    expect(buildShortlist(plentyOfCandidates(), FAKE_BRANCHES, 0)).toEqual([]);
  });

  it("keeps the best normalized name across branches and categories and backfills ten merchants", () => {
    const branches = FAKE_BRANCHES.slice(0, 2);
    const lower = makeFakeCandidate(12, { score: 0.99, branchId: branches[0].id,
      place: makeFakePlace(12, { name: "The Fake Harbor Co." }) });
    const higher = makeFakeCandidate(13, { score: 1, branchId: branches[1].id,
      categoryTagId: FAKE_CATEGORIES[1].tagId, categoryLabel: FAKE_CATEGORIES[1].label,
      place: makeFakePlace(13, { name: "Fake Harbor LLC" }) });
    const northern = Array.from({ length: 3 }, (_, index) => makeFakeCandidate(index + 1, { score: 0.8, branchId: branches[0].id }));
    const southern = Array.from({ length: 8 }, (_, index) => makeFakeCandidate(index + 4, {
      score: 0.8, branchId: branches[1].id, categoryTagId: FAKE_CATEGORIES[1].tagId,
    }));
    const result = buildShortlist(new Map([
      [FAKE_CATEGORIES[0].tagId, [lower, ...northern]], [FAKE_CATEGORIES[1].tagId, [higher, ...southern]],
    ]), branches);
    expect(result).toHaveLength(10);
    expect(new Set(result.map((merchant) => normalizeName(merchant.place.name))).size).toBe(10);
    expect(result).toContain(higher);
    expect(result).not.toContain(lower);
    expect(result.filter((merchant) => merchant.branchId === branches[0].id)).toHaveLength(3);
    expect(result.filter((merchant) => merchant.branchId === branches[1].id)).toHaveLength(7);
  });

  it("uses taste-signal precedence when choosing between names at different locations", () => {
    const baseline = makeFakeCandidate(1, { tasteSignal: false, score: 1, place: makeFakePlace(1, { name: "Fake Harbor" }) });
    const taste = makeFakeCandidate(2, { tasteSignal: true, score: 0.01, branchId: FAKE_BRANCHES[1].id,
      categoryTagId: FAKE_CATEGORIES[1].tagId, place: makeFakePlace(2, { name: "The Fake Harbor LLC" }) });
    expect(buildShortlist(new Map([
      [FAKE_CATEGORIES[0].tagId, [baseline]], [FAKE_CATEGORIES[1].tagId, [taste]],
    ]), FAKE_BRANCHES)).toEqual([taste]);
  });
});
