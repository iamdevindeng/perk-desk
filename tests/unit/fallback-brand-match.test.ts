// Checks fallback name ranking with hand-written candidates and synthetic entity IDs.
// Called by: npm test; no Qloo data or network calls are used.
import { describe, expect, it } from "vitest";
import { selectFallbackBrand } from "@/lib/fallback/fallback-plan";
import type { BrandCandidate } from "@/lib/types";

const EXACT: BrandCandidate = {
  entityId: "00000000-0000-4000-8000-000000000071", name: "REI", popularity: 0.1,
  shortDescription: "Hand-written exact-match candidate.", tags: [],
};
const PREFIX: BrandCandidate = {
  entityId: "00000000-0000-4000-8000-000000000072", name: "REI Co-op", popularity: 0.2,
  shortDescription: "Hand-written prefix candidate.", tags: [],
};
const ACRONYM: BrandCandidate = {
  entityId: "00000000-0000-4000-8000-000000000073", name: "Recreational Equipment Inc.", popularity: 0.8,
  shortDescription: "Hand-written acronym candidate.", tags: [],
};
const UNRELATED: BrandCandidate = {
  entityId: "00000000-0000-4000-8000-000000000074", name: "Real Madrid CF", popularity: 1,
  shortDescription: "Hand-written unrelated candidate.", tags: [],
};

describe("fallback brand name ranking", () => {
  it("prefers an exact normalized match over more popular prefix, acronym, and unrelated names", () => {
    expect(selectFallbackBrand("  rei  ", [UNRELATED, ACRONYM, PREFIX, EXACT])).toBe(EXACT);
  });

  it("prefers REI Co-op over a more popular acronym and unrelated entity", () => {
    expect(selectFallbackBrand("REI", [UNRELATED, ACRONYM, PREFIX])).toBe(PREFIX);
  });

  it("keeps Inc. in the acronym so REI can match Recreational Equipment Inc.", () => {
    expect(selectFallbackBrand("REI", [UNRELATED, ACRONYM])).toBe(ACRONYM);
  });

  it("accepts the input extending a candidate name at a word boundary", () => {
    const candidate = { ...EXACT, name: "Fake Outdoor" };
    expect(selectFallbackBrand("Fake Outdoor Equipment", [UNRELATED, candidate])).toBe(candidate);
  });

  it("uses popularity to break ties among names with the same match level", () => {
    const popularPrefix = { ...PREFIX, name: "REI Outfitters", popularity: 0.9 };
    expect(selectFallbackBrand("REI", [PREFIX, popularPrefix, UNRELATED])).toBe(popularPrefix);
  });

  it("uses popularity for equal exact matches after normalization", () => {
    const popularExact = { ...EXACT, name: "The REI", popularity: 0.9 };
    expect(selectFallbackBrand("REI", [EXACT, popularExact])).toBe(popularExact);
  });

  it("leaves unrelated names and partial-word prefixes unchosen", () => {
    const partialPrefix = { ...PREFIX, name: "Reiss" };
    expect(selectFallbackBrand("REI", [UNRELATED, partialPrefix])).toBeUndefined();
  });

  it("does not treat a candidate as a prefix inside a longer word", () => {
    expect(selectFallbackBrand("REISS", [EXACT])).toBeUndefined();
  });

  it("leaves an empty normalized input or empty candidate list unchosen", () => {
    expect(selectFallbackBrand("...", [EXACT])).toBeUndefined();
    expect(selectFallbackBrand("REI", [])).toBeUndefined();
  });

  it("keeps the original candidate order unchanged", () => {
    const candidates = [UNRELATED, ACRONYM, PREFIX, EXACT];
    selectFallbackBrand("REI", candidates);
    expect(candidates).toEqual([UNRELATED, ACRONYM, PREFIX, EXACT]);
  });
});
