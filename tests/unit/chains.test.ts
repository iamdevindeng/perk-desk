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
    expect(isNationalChain("Fake REI Shop")).toBe(false);
    expect(isNationalChain("")).toBe(false);
  });

  it("normalizes punctuation in both chain entries and incoming names", () => {
    expect(isNationalChain("Ben and Jerry's Fake Branch")).toBe(true);
    expect(isNationalChain("Baskin Robbins Fake Branch")).toBe(true);
  });

  it("excludes Rack Attack branches at word boundaries", () => {
    expect(isNationalChain("Rack Attack Denver")).toBe(true);
    expect(isNationalChain("Rack-Attack")).toBe(true);
    expect(isNationalChain("Fake Rack Attacker Shop")).toBe(false);
  });

  it.each(["Neiman Marcus", "Neiman Marcus Fake Branch", "NEIMAN-MARCUS", "Neiman Marcus Last Call"])(
    "excludes the full department-store brand %s", (name) => {
      expect(isNationalChain(name)).toBe(true);
    },
  );

  it.each(["Fake Neiman Cafe", "Fake Marcus Books", "Fake Neiman Marcusson Cafe", "Fake Neimans Marcus Books"])(
    "preserves independent names that only resemble the department-store brand: %s", (name) => {
      expect(isNationalChain(name)).toBe(false);
    },
  );

  it.each([
    "Urban Outfitters", "Madewell", "Rainbow Shops", "Fleet Feet", "GANNI", "Tecovas",
    "Anthropologie", "Free People", "J.Crew", "JCrew", "Old Navy", "Banana Republic",
    "H&M", "Zara", "Uniqlo", "Lululemon", "Athleta", "Foot Locker", "Running Warehouse",
    "The North Face", "Petco", "PetSmart", "Pet Supplies Plus",
    "Orangetheory", "F45", "Planet Fitness", "CorePower Yoga", "Pure Barre", "Club Pilates",
    "Abercrombie & Fitch", "American Eagle Outfitters", "Aeropostale", "Famous Footwear",
    "Shoe Carnival", "Sportsman's Warehouse", "Petsense", "Snap Fitness", "Solidcore",
    "Three Dog Bakery", "K&G Fashion Superstore", "Boot Barn",
  ])("excludes category chain %s and its branch names", (name) => {
    expect(isNationalChain(name)).toBe(true);
    expect(isNationalChain(`${name} Fake Branch`)).toBe(true);
  });

  it.each([
    "URBAN-OUTFITTERS (Fake Branch)", "Fleet-Feet", "Rainbow—Shops", "J. Crew Fake Branch",
    "Abercrombie and Fitch Fake Branch", "Sportsman’s Warehouse", "Columbia-Sportswear",
  ])("normalizes punctuation and case in %s", (name) => {
    expect(isNationalChain(name)).toBe(true);
  });

  it.each([
    "Mind the Gap Cafe", "Columbia Coffee", "Marmot Mountain Cafe", "Chico's Cafe",
    "Fake Urban Outfittersmith", "Fake Madewells Bakery", "Fake Rainbow Shopscape",
    "Fake Fleet Feetish Cafe", "Fake Athletarium", "Fake Pet Supplies Plusmore", "Fake Gannicus Cafe",
  ])("preserves the independent name %s", (name) => {
    expect(isNationalChain(name)).toBe(false);
  });

  it.each([
    "Gap", "Gap Factory", "Chico's", "Columbia", "Columbia Sportswear", "Marmot",
    "REI", "DSW", "Patagonia", "Sprouts", "Sprouts Farmers Market",
  ])("blocks the exact chain %s and its retail suffixes", (name) => {
    for (const suffix of ["", " Store", " Outlet", " Factory Store"]) {
      expect(isNationalChain(`${name}${suffix}`)).toBe(true);
    }
    // R18 restores word-boundary matching for these unambiguous multi-word names.
    const unambiguous = ["Gap Factory", "Columbia Sportswear", "Sprouts Farmers Market"].includes(name);
    expect(isNationalChain(`${name} Fake Branch`)).toBe(unambiguous);
  });

  it.each(["  GAP  ", "Chico’s", "CHICO'S OUTLET!", "Columbia-Sportswear Store", "ＧＡＰ", "Sprouts   Farmers Market"])(
    "normalizes exact-name case, punctuation, and spacing in %s", (name) => {
      expect(isNationalChain(name)).toBe(true);
    },
  );

  it.each([
    "Mind the Gap Cafe", "Chico's Cafe", "Columbia Street Bakery", "Rei Sushi", "Patagonia Grill",
    "Sprouts Juice Bar", "Gap Outlet Books",
    "Fake DSW", "Sprouts Farmers Marketplace", "Store", "!!!",
  ])("keeps the full independent name %s", (name) => {
    expect(isNationalChain(name)).toBe(false);
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
