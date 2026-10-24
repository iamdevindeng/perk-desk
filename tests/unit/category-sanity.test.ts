// Checks conservative category contradictions with fictional places and owner-confirmed name rules.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it } from "vitest";
import { isCategoryMismatch } from "@/lib/merchants/category-sanity";
import { makeFakePlace } from "../fixtures/fake-places";

const COFFEE = "urn:tag:category:place:coffee_shop";
const GYM = "urn:tag:category:place:gym";

describe("category genre sanity", () => {
  it.each(["cocktail_bar", "bar", "candy", "candy_store", "restaurant:cocktail_bar"])(
    "rejects the contradictory coffee genre %s", (genre) => {
      const place = makeFakePlace(1, { primaryGenreId: `urn:tag:genre:place:${genre}` });
      expect(isCategoryMismatch(place, COFFEE)).toBe(true);
    },
  );

  it.each(["country_club", "university", "campus", "university:gym", "university_campus"])(
    "rejects the contradictory gym genre %s", (genre) => {
      const place = makeFakePlace(1, { name: "Fake Fitness Studio", primaryGenreId: `urn:tag:genre:place:${genre}` });
      expect(isCategoryMismatch(place, GYM)).toBe(true);
    },
  );

  it.each(["coffee_shop", "coffee_bar", "espresso_bar", "barbecue_restaurant", "barista_training"])(
    "keeps the noncontradictory coffee genre %s", (genre) => {
      const place = makeFakePlace(1, { primaryGenreId: `urn:tag:genre:place:${genre}` });
      expect(isCategoryMismatch(place, COFFEE)).toBe(false);
    },
  );

  it("does not broaden the deny rules to other categories", () => {
    const place = makeFakePlace(1, { name: "Fake Cocktail Bar", primaryGenreId: "urn:tag:genre:place:cocktail_bar" });
    expect(isCategoryMismatch(place, "urn:tag:category:place:cocktail_bar")).toBe(false);
    expect(isCategoryMismatch(place, "urn:tag:category:place:bakery")).toBe(false);
  });
});

describe("category name sanity", () => {
  it.each(["Fake Cocktail Bar", "Fake Bar", "Fake Candy Shop", "Fake Candies", "Fake Coffee Bar and Cocktail Bar"])(
    "rejects the coffee contradiction %s without a genre", (name) => {
      expect(isCategoryMismatch(makeFakePlace(1, { name, primaryGenreId: undefined }), COFFEE)).toBe(true);
    },
  );

  it.each(["Fake Country Club", "Fake University Gym", "Fake Campus Fitness"])(
    "rejects the gym contradiction %s without a genre", (name) => {
      expect(isCategoryMismatch(makeFakePlace(1, { name, primaryGenreId: undefined }), GYM)).toBe(true);
    },
  );

  it.each(["Fake Coffee Bar", "Fake Espresso Bar", "Fake Barista Cafe", "Fake Candyland Cafe", "Fake Barberry Coffee"])(
    "keeps ambiguous or ordinary coffee names such as %s", (name) => {
      expect(isCategoryMismatch(makeFakePlace(1, { name, primaryGenreId: undefined }), COFFEE)).toBe(false);
    },
  );

  it.each(["Fake Athletic Club", "Fake Fitness Studio", "Fake Country Fitness", "Fake Campuswide Training"])(
    "keeps ordinary gym names such as %s", (name) => {
      expect(isCategoryMismatch(makeFakePlace(1, { name, primaryGenreId: undefined }), GYM)).toBe(false);
    },
  );

  it.each([
    ["Death & Co Denver", COFFEE], ["DEATH and CO. DENVER", COFFEE], ["Enstrom Candies", COFFEE],
    ["Denver Country Club", GYM], ["The Denver Athletic Club", GYM], ["Gregory Gym", GYM],
  ])("uses the owner-confirmed name rule for %s", (name, category) => {
    expect(isCategoryMismatch(makeFakePlace(1, { name, primaryGenreId: undefined }), category)).toBe(true);
  });

  it("does not expand the confirmed exact names to unrelated businesses", () => {
    for (const name of ["Fake Gregory Gym", "Fake Denver Athletic Clubhouse", "Fake Death and Co Denver Cafe"]) {
      const place = makeFakePlace(1, { name, primaryGenreId: undefined });
      expect(isCategoryMismatch(place, COFFEE)).toBe(false);
      expect(isCategoryMismatch(place, GYM)).toBe(false);
    }
  });
});
