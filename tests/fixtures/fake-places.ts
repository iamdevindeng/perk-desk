// Creates hand-written fictional places and candidates for deterministic merchant tests.
// Called by: merchant filtering, scoring, chain, and shortlist unit tests
import type { Branch, CategoryTag, MerchantCandidate, Place } from "@/lib/types";

export const FAKE_BRANCHES: (Branch & { lat: number; lon: number })[] = [
  { id: "north", name: "Fake North Branch", address: "1 Example Lane", lat: 39.75, lon: -104.99, radiusMeters: 6000 },
  { id: "central", name: "Fake Central Branch", address: "2 Example Lane", lat: 39.74, lon: -104.99, radiusMeters: 6000 },
  { id: "south", name: "Fake South Branch", address: "3 Example Lane", lat: 39.73, lon: -104.99, radiusMeters: 6000 },
];
export const FAKE_CATEGORIES: CategoryTag[] = [
  { tagId: "urn:tag:category:place:coffee_shop", label: "Coffee shop" },
  { tagId: "urn:tag:category:place:bakery", label: "Bakery" },
];

export function makeFakePlace(index: number, overrides: Partial<Place> = {}): Place {
  if (!Number.isInteger(index) || index < 1 || index > 99) throw new Error("Fake place index must be between 1 and 99.");
  return {
    entityId: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`,
    name: `Fake Coffee Shop ${index}`, address: `${index} Example Lane`, lat: 39.75, lon: -104.99,
    businessRating: 4, primaryGenreId: "urn:tag:genre:place:coffee_shop", isClosed: false, explain: [], ...overrides,
  };
}

export function makeFakeCandidate(index: number, overrides: Partial<MerchantCandidate> = {}): MerchantCandidate {
  const branch = FAKE_BRANCHES[0];
  const category = FAKE_CATEGORIES[0];
  return {
    place: makeFakePlace(index), categoryTagId: category.tagId, categoryLabel: category.label,
    branchId: branch.id, branchName: branch.name, radiusMeters: branch.radiusMeters, distanceMeters: 100,
    tasteSignal: true, seededRank: index, baselineRank: index + 1, baselineLength: 30, rankLift: 1,
    affinity: 0.1, explain: [], brandShares: [], multiLocation: false, businessMember: false, score: 0.5,
    ...overrides,
  };
}
