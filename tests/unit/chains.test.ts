// Checks national-chain boundaries and duplicate-name detection across branches and categories.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it } from "vitest";
import { isNationalChain, markDuplicateNames } from "@/lib/merchants/chains";
import { makeFakeCandidate, makeFakePlace } from "../fixtures/fake-places";

describe("isNationalChain", () => {
  it("recognizes chain names only at normalized word boundaries", () => {
    expect(isNationalChain("Starbucks Reserve")).toBe(true);
    expect(isNationalChain("The Starbucks Coffee Co.")).toBe(true);
    expect(isNationalChain("Starbuck Lane Books")).toBe(false);
    expect(isNationalChain("Reiss Fake Shop")).toBe(false);
    expect(isNationalChain("Fake REI Shop")).toBe(true);
    expect(isNationalChain("")).toBe(false);
  });

  it("normalizes punctuation in both chain entries and incoming names", () => {
    expect(isNationalChain("Ben and Jerry's Fake Branch")).toBe(true);
    expect(isNationalChain("Baskin Robbins Fake Branch")).toBe(true);
  });
});

describe("markDuplicateNames", () => {
  it("marks distinct entity IDs with equivalent names without changing inputs", () => {
    const candidates = [
      makeFakeCandidate(1, { place: makeFakePlace(1, { name: "The Fake Coffee Co." }) }),
      makeFakeCandidate(2, { place: makeFakePlace(2, { name: "Fake Coffee LLC" }) }),
      makeFakeCandidate(3, { place: makeFakePlace(3, { name: "Fake Tea" }) }),
    ];
    const marked = markDuplicateNames(candidates);
    expect(marked.map((candidate) => candidate.multiLocation)).toEqual([true, true, false]);
    expect(candidates.every((candidate) => candidate.multiLocation === false)).toBe(true);
    expect(marked[0]).not.toBe(candidates[0]);
  });

  it("does not mistake the same place in two branches for two locations", () => {
    const first = makeFakeCandidate(1);
    const second = { ...first, branchId: "second-branch" };
    expect(markDuplicateNames([first, second]).every((candidate) => !candidate.multiLocation)).toBe(true);
  });

  it("preserves a location flag already established by a brand check", () => {
    const candidate = makeFakeCandidate(1, { multiLocation: true });
    expect(markDuplicateNames([candidate])[0].multiLocation).toBe(true);
  });
});
