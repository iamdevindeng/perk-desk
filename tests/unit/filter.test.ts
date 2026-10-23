// Checks merchant exclusions, deterministic counts, radius slack, and input immutability.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it } from "vitest";
import { filterPlaces } from "@/lib/merchants/filter";
import { makeFakeCandidate, makeFakePlace } from "../fixtures/fake-places";

const EMPTY_RULES = { signedNames: [], excludeEntityIds: [] };

describe("filterPlaces", () => {
  it("counts closed, noise, signed, excluded-ID, and national-chain candidates", () => {
    const candidates = [
      makeFakeCandidate(1, { place: makeFakePlace(1, { isClosed: true }) }),
      makeFakeCandidate(2, { place: makeFakePlace(2, { primaryGenreId: "urn:tag:genre:place:shopping_mall" }) }),
      makeFakeCandidate(3, { place: makeFakePlace(3, { name: "Sweet Fake Ice Cream" }) }),
      makeFakeCandidate(4),
      makeFakeCandidate(5, { place: makeFakePlace(5, { name: "Starbucks Reserve" }) }),
      makeFakeCandidate(6),
    ];
    const result = filterPlaces(candidates, {
      signedNames: ["Sweet Fake Ice Cream LLC"], excludeEntityIds: [candidates[3].place.entityId],
    });
    expect(result.kept).toEqual([candidates[5]]);
    expect(result.excludedCounts).toEqual({ nationalChain: 1, noiseGenre: 1, closed: 1, signedOrExcluded: 2 });
    expect(candidates).toHaveLength(6);
  });

  it("drops locations outside radius times 1.1 and keeps the exact boundary", () => {
    const inside = makeFakeCandidate(1, { distanceMeters: 6600, radiusMeters: 6000 });
    const outside = makeFakeCandidate(2, { distanceMeters: 6601, radiusMeters: 6000 });
    const result = filterPlaces([inside, outside], EMPTY_RULES);
    expect(result.kept).toEqual([inside]);
    expect(result.excludedCounts).toEqual({ nationalChain: 0, noiseGenre: 0, closed: 0, signedOrExcluded: 0 });
  });

  it("compares the full genre remainder rather than only its last segment", () => {
    const candidate = makeFakeCandidate(1, {
      place: makeFakePlace(1, { primaryGenreId: "urn:tag:genre:place:restaurant:shopping_mall" }),
    });
    expect(filterPlaces([candidate], EMPTY_RULES).kept).toEqual([candidate]);
  });

  it("counts an overlapping rejection once with the documented precedence", () => {
    const candidate = makeFakeCandidate(1, { place: makeFakePlace(1, {
      isClosed: true, name: "Starbucks", primaryGenreId: "urn:tag:genre:place:supermarket",
    }) });
    const result = filterPlaces([candidate], { signedNames: ["Starbucks"], excludeEntityIds: [] });
    expect(result.kept).toEqual([]);
    expect(result.excludedCounts).toEqual({ nationalChain: 0, noiseGenre: 0, closed: 1, signedOrExcluded: 0 });
  });

  it("keeps unknown genres and does not let a short signed name exclude them", () => {
    const candidate = makeFakeCandidate(1, { place: makeFakePlace(1, { name: "Cafe Fake Corner" }) });
    expect(filterPlaces([candidate], { signedNames: ["Cafe"], excludeEntityIds: [] }).kept).toEqual([candidate]);
  });
});
