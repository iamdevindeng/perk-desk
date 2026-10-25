// Checks invented Qloo branch filtering, name matching, suggestions, and city resolution.
// Called by: npm test without live services
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupBranches } from "@/lib/branch-lookup";
import { getCities } from "@/lib/data";
import { resolveLocality } from "@/lib/qloo/insights";
import { searchPlacesByName } from "@/lib/qloo/search";
import type { Place } from "@/lib/types";
import { makeFakePlace } from "../fixtures/fake-places";

vi.mock("@/lib/qloo/insights", () => ({ resolveLocality: vi.fn() }));
vi.mock("@/lib/qloo/search", () => ({ searchPlacesByName: vi.fn() }));
const CITY = getCities()[0];
const INPUT = { name: "Fake Grove Credit Union", city: CITY.label };

function branch(index: number, overrides: Partial<Place> = {}): Place {
  return makeFakePlace(index, {
    name: INPUT.name, primaryGenreId: "urn:tag:genre:place:credit_union", lat: CITY.lat + index / 1000, lon: CITY.lon,
    ...overrides,
  });
}

beforeEach(() => {
  vi.mocked(resolveLocality).mockReset().mockResolvedValue(null);
  vi.mocked(searchPlacesByName).mockReset().mockResolvedValue([]);
});

describe("branch lookup cities", () => {
  it("uses the exact known-city center without a locality call", async () => {
    const signal = new AbortController().signal;
    expect(await lookupBranches(INPUT, { signal })).toEqual({ status: "none", query: INPUT.name, cityLabel: CITY.label, places: [], suggestions: [] });
    expect(resolveLocality).not.toHaveBeenCalled();
    expect(searchPlacesByName).toHaveBeenCalledExactlyOnceWith(INPUT.name, CITY.lat, CITY.lon, { signal });
  });

  it("uses a resolved custom city's label and coordinates", async () => {
    vi.mocked(resolveLocality).mockResolvedValue({ name: "Fake Grove City, ST", lat: 12.3, lon: 45.6 });
    const result = await lookupBranches({ ...INPUT, city: "Fake Grove City" });
    expect(resolveLocality).toHaveBeenCalledExactlyOnceWith("Fake Grove City", {});
    expect(searchPlacesByName).toHaveBeenCalledExactlyOnceWith(INPUT.name, 12.3, 45.6, {});
    expect(result.cityLabel).toBe("Fake Grove City, ST");
  });

  it("returns city_not_found without searching places when the locality is absent", async () => {
    const result = await lookupBranches({ ...INPUT, city: "Fake Missing City" });
    expect(result).toEqual({ status: "city_not_found", query: INPUT.name, cityLabel: "Fake Missing City", places: [], suggestions: [] });
    expect(searchPlacesByName).not.toHaveBeenCalled();
  });
});

describe("branch filtering and matching", () => {
  it.each(["atm", "stadium", "gym", "mortgage_lender", "financial_institution", "restaurant"])("drops the %s genre", async (genre) => {
    vi.mocked(searchPlacesByName).mockResolvedValue([branch(1, { primaryGenreId: `urn:tag:genre:place:${genre}` })]);
    expect((await lookupBranches(INPUT)).status).toBe("none");
  });

  it.each(["ATM", "Corporate", "Administrative", "Office", "Offices", "Headquarters", "No Branch", "Mortgage"])("drops a branch-like name containing %s", async (suffix) => {
    vi.mocked(searchPlacesByName).mockResolvedValue([branch(1, { name: `${INPUT.name} ${suffix}` })]);
    expect((await lookupBranches(INPUT)).status).toBe("none");
  });

  it("drops closed, distant, and missing-genre places", async () => {
    vi.mocked(searchPlacesByName).mockResolvedValue([
      branch(1, { isClosed: true }), branch(2, { lat: CITY.lat + 1 }), branch(3, { primaryGenreId: undefined }),
    ]);
    expect((await lookupBranches(INPUT)).status).toBe("none");
  });

  it("matches normalized exact names and branch suffixes across all allowed genres", async () => {
    vi.mocked(searchPlacesByName).mockResolvedValue([
      branch(1, { name: "FAKE GROVE CREDIT UNION" }),
      branch(2, { name: `${INPUT.name} - Drive Thru Only`, primaryGenreId: "urn:tag:genre:place:bank" }),
      branch(3, { name: `${INPUT.name} Green Mountain Branch`, primaryGenreId: "urn:tag:genre:place:federal_credit_union" }),
      branch(4, { name: `${INPUT.name}ist` }), branch(5, { name: `${INPUT.name} ATM` }),
    ]);
    const result = await lookupBranches(INPUT);
    expect(result.status).toBe("found");
    expect(result.places.map((place) => place.entityId)).toEqual([branch(1).entityId, branch(2).entityId, branch(3).entityId]);
    expect(result.places[0]).toMatchObject({ address: "1 Example Lane", lat: CITY.lat + 0.001, lon: CITY.lon });
    expect(result.suggestions).toEqual([]);
  });

  it("deduplicates IDs and returns at most 20 nearest places in distance order", async () => {
    const places = Array.from({ length: 25 }, (_, index) => branch(index + 1));
    vi.mocked(searchPlacesByName).mockResolvedValue([...places.toReversed(), places[0]]);
    const result = await lookupBranches(INPUT);
    expect(result.places).toHaveLength(20);
    expect(result.places.map((place) => place.entityId)).toEqual(places.slice(0, 20).map((place) => place.entityId));
    expect(result.places.map((place) => place.distanceMeters)).toEqual(result.places.map((place) => place.distanceMeters).sort((a, b) => a - b));
  });

  it("does not interpret punctuation-only names as a wildcard", async () => {
    vi.mocked(searchPlacesByName).mockResolvedValue([branch(1)]);
    expect((await lookupBranches({ ...INPUT, name: "---" })).status).toBe("other_names");
  });
});

describe("nearby institution suggestions", () => {
  it("groups base names, strips trailing branch, and counts unique locations", async () => {
    const first = branch(1, { name: "Fake Birch Bank - East" });
    vi.mocked(searchPlacesByName).mockResolvedValue([
      first, first, branch(2, { name: "Fake Birch Bank Branch" }),
      branch(3, { name: "Fake Ash Bank" }), branch(4, { name: "Fake Cedar Bank - West" }),
    ]);
    expect(await lookupBranches(INPUT)).toEqual({
      status: "other_names", query: INPUT.name, cityLabel: CITY.label, places: [],
      suggestions: [{ name: "Fake Birch Bank", locations: 2 }, { name: "Fake Ash Bank", locations: 1 }, { name: "Fake Cedar Bank", locations: 1 }],
    });
  });

  it("returns the top eight groups ordered by count then name", async () => {
    const names = ["Ivy", "Hazel", "Grove", "Fir", "Elm", "Dogwood", "Cedar", "Birch", "Ash"];
    const places = names.map((name, index) => branch(index + 1, { name: `Fake ${name} Bank` }));
    places.push(branch(10, { name: "Fake Ivy Bank - West" }));
    vi.mocked(searchPlacesByName).mockResolvedValue(places);
    const result = await lookupBranches(INPUT);
    expect(result.suggestions).toHaveLength(8);
    expect(result.suggestions.map((suggestion) => suggestion.name)).toEqual([
      "Fake Ivy Bank", "Fake Ash Bank", "Fake Birch Bank", "Fake Cedar Bank", "Fake Dogwood Bank", "Fake Elm Bank", "Fake Fir Bank", "Fake Grove Bank",
    ]);
  });
});
