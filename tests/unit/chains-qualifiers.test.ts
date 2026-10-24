// Verifies chain location qualifiers while preserving independent and cached demo merchant names.
// Called by: npm test; names come from the written R18 specification, not provider responses
import { describe, expect, it } from "vitest";
import { isNationalChain, isTeamStore } from "@/lib/merchants/chains";

const CACHED_DEMO_NAMES = [
  "Bull & Bush Brewery", "Death & Co Denver", "Denver ChopHouse & Brewery", "Denver Country Club",
  "Enstrom Candies Arvada", "Flat Track Coffee", "Gregory Gym", "High Ride Cycle - Sloan's Lake",
  "JuiceLand", "Knotty Tie Co.", "Monkies Vintage & Thrift", "Odell Brewing Sloan's Lake Brewhouse & Pizzeria",
  "Salita", "The Denver Athletic Club", "The Well - 2nd St", "The Yard", "Tom's Dive & Swim",
  "Tomlinson's Feed", "University Co-op",
];

describe("chain qualifier regressions", () => {
  it.each([
    "REI Co-op", "REI Denver Flagship", "REI Austin", "Patagonia Denver",
    "Columbia Sportswear Company", "Columbia Sportswear Employee Store", "Marmot Boulder",
    "DSW Designer Shoe Warehouse", "Sprouts Farmers Market - Highlands",
    "Gap Kids", "GapKids", "Chico's Off The Rack", "The Gap",
  ])("blocks the R18 chain example %s", (name) => {
    expect(isNationalChain(name)).toBe(true);
  });

  it.each([
    "The REI Austin Co-op Company Outlet", "REI Denver Flagship Store", "Patagonia Austin Factory Store",
    "The Gap Kids Outlet", "Chico's Company Outlet", "Marmot Boulder Employee Store", "DSW Coop Store",
    "Columbia Denver Factory Store Outlet", "Gap Company",
  ])("removes only recognized trailing qualifiers repeatedly in %s", (name) => {
    expect(isNationalChain(name)).toBe(true);
  });

  it.each([
    "REI - Denver", "Patagonia | Austin", "Chico's (North Shop)", "Marmot, Boulder",
    "REI - Denver | Flagship (Example)", "The Gap, Fake Mall | Store",
  ])("compares the chain core before the first supported delimiter in %s", (name) => {
    expect(isNationalChain(name)).toBe(true);
  });

  it.each([
    "Fake Columbia Sportswear", "Gap Factory Store Cafe", "Fake Sprouts Farmers Market Branch",
    "DSW Designer Shoe Warehouse Fake Branch", "REI Co-op Fake Branch", "Gap Kids Fake Branch",
    "GapKids Fake Branch", "Chico's Off The Rack Fake Branch",
  ])("matches restored unambiguous chain words in %s", (name) => {
    expect(isNationalChain(name)).toBe(true);
  });

  it("adds request city and neighbourhood words without treating unknown words as qualifiers", () => {
    expect(isNationalChain("REI Boise Store")).toBe(false);
    expect(isNationalChain("REI Boise ID Store", "Boise, ID")).toBe(true);
    expect(isNationalChain("Patagonia North End Outlet", "Boise, ID - North End")).toBe(true);
    expect(isNationalChain("Marmot Unknown Store", "Boise, ID")).toBe(false);
    expect(isNationalChain("Rei Sushi Boise Store", "Boise, ID")).toBe(false);
  });
});

describe("independent merchant preservation", () => {
  it.each([
    "Mind the Gap Cafe", "Chico's Cafe", "Columbia Street Bakery", "Rei Sushi", "Patagonia Grill",
    "Sprouts Juice Bar", "Marmot Mountain Cafe", "The Rei Sushi Denver Store", "Columbia Street Bakery Austin",
    "Patagonia Unknown Store", "Reiss Denver Store", "Sprouts Farmers Marketplace", "University Co-op",
  ])("keeps the independent merchant %s", (name) => {
    expect(isNationalChain(name)).toBe(false);
  });

  it.each(CACHED_DEMO_NAMES)("keeps the cached demo merchant %s eligible", (name) => {
    expect(isNationalChain(name)).toBe(false);
    expect(isNationalChain(name, "Denver, CO")).toBe(false);
    expect(isNationalChain(name, "Austin, TX")).toBe(false);
    expect(isTeamStore(name)).toBe(false);
  });

  it("covers every cached demo merchant listed in the specification", () => {
    expect(CACHED_DEMO_NAMES).toHaveLength(19);
  });
});
