// Checks merchant exclusions, deterministic counts, radius slack, and input immutability.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it } from "vitest";
import { markDuplicateNames } from "@/lib/merchants/chains";
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

  it("excludes Rack Attack and stadium/team stores while retaining ordinary local stores", () => {
    const names = ["Rack Attack Denver", "Denver Broncos Stadium Store", "Fake Owls TEAM-STORE", "Fake Stadium Coffee", "Fake Steam Store"];
    const candidates = names.map((name, index) => makeFakeCandidate(index + 1, { place: makeFakePlace(index + 1, { name }) }));
    const result = filterPlaces(candidates, EMPTY_RULES);
    expect(result.kept.map((candidate) => candidate.place.name)).toEqual(names.slice(3));
    expect(result.excludedCounts).toEqual({ nationalChain: 1, noiseGenre: 2, closed: 0, signedOrExcluded: 0 });
  });

  it("keeps local merchants and their multi-location flags when excluding national chains", () => {
    const candidates = markDuplicateNames([
      makeFakeCandidate(1, { place: makeFakePlace(1, { name: "Fake Corner Coffee" }) }),
      makeFakeCandidate(2, { place: makeFakePlace(2, { name: "Fake Corner Coffee LLC" }) }),
      makeFakeCandidate(3, { place: makeFakePlace(3, { name: "Fake Trail Gear" }), multiLocation: true }),
      makeFakeCandidate(4, { place: makeFakePlace(4, { name: "Fake Neighborhood Bakery" }) }),
      makeFakeCandidate(5, { place: makeFakePlace(5, { name: "Fleet Feet Fake Branch" }) }),
    ]);
    const result = filterPlaces(candidates, EMPTY_RULES);
    expect(result.kept).toEqual(candidates.slice(0, 4));
    expect(result.kept.map((candidate) => candidate.multiLocation)).toEqual([true, true, true, false]);
    expect(result.excludedCounts).toEqual({ nationalChain: 1, noiseGenre: 0, closed: 0, signedOrExcluded: 0 });
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

  it("keeps valid mixed categories unchanged and counts category mismatches once", () => {
    const gym = { categoryTagId: "urn:tag:category:place:gym", categoryLabel: "Gym" };
    const candidates = [
      makeFakeCandidate(1, { place: makeFakePlace(1, { name: "Fake Espresso Bar" }), score: 0.8 }),
      makeFakeCandidate(2, { ...gym, place: makeFakePlace(2, { name: "Fake Local Fitness" }), score: 0.7 }),
      makeFakeCandidate(3, { place: makeFakePlace(3, { name: "Fake Candy Shop" }) }),
      makeFakeCandidate(4, { ...gym, place: makeFakePlace(4, { name: "Fake Campus Gym" }) }),
      makeFakeCandidate(5, { ...gym, place: makeFakePlace(5, { name: "Fake Country Club", isClosed: true }) }),
      makeFakeCandidate(6, { place: makeFakePlace(6, { name: "Fake Signed Cafe" }) }),
    ];
    const result = filterPlaces(candidates, { signedNames: ["Fake Campus Gym", "Fake Signed Cafe"], excludeEntityIds: [] });
    expect(result.kept).toEqual(candidates.slice(0, 2));
    expect(result.kept[0]).toBe(candidates[0]);
    expect(result.kept[1]).toBe(candidates[1]);
    expect(result.excludedCounts).toEqual({ nationalChain: 0, noiseGenre: 2, closed: 1, signedOrExcluded: 1 });
  });
});
