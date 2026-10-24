// Checks the frozen genre families with fictional places and the existing confirmed-name exceptions.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it } from "vitest";
import { isCategoryMismatch } from "@/lib/merchants/category-sanity";
import { makeFakePlace } from "../fixtures/fake-places";

const COFFEE = "urn:tag:category:place:coffee_shop";
const GYM = "urn:tag:category:place:gym";

function mismatch(genre: string, category: string, name = "Fake Local Shop"): boolean {
  const place = makeFakePlace(1, { name, primaryGenreId: `urn:tag:genre:place:${genre}` });
  return isCategoryMismatch(place, `urn:tag:category:place:${category}`);
}

describe("frozen category genre families", () => {
  it.each(["bar", "cocktail_bar", "pub", "tavern", "brewery", "brewpub", "wine_bar", "winery", "nightclub", "lounge"])(
    "rejects drinking genre %s in coffee shops", (genre) => {
      expect(mismatch(genre, "coffee_shop")).toBe(true);
    },
  );

  it.each(["cafe", "tea_house", "bakery", "dessert_shop", "gym", "day_spa", "hair_salon", "clothing_store", "pet_supply_store"])(
    "rejects nested drinking genres in %s", (category) => {
      expect(mismatch("restaurant:cocktail_bar", category)).toBe(true);
    },
  );

  it.each(["bar", "bar_grill", "beer_garden", "brewery", "cocktail_bar", "wine_bar", "winery", "wine_store",
    "restaurant", "american_restaurant", "food_court"])("keeps drinking places in %s", (category) => {
    expect(mismatch("cocktail_bar", category)).toBe(false);
    expect(mismatch("brewery", category, "Denver ChopHouse & Brewery")).toBe(false);
  });

  it("rejects the brewery genre for The Yard in Gym", () => {
    expect(mismatch("brewery", "gym", "The Yard")).toBe(true);
  });

  it.each(["country_club", "athletic_club", "golf_club", "social_club", "private_club", "university", "college", "campus", "school"])(
    "rejects club or education genre %s across categories", (genre) => {
      for (const category of ["gym", "coffee_shop", "restaurant", "gift_shop", genre]) {
        expect(mismatch(genre, category)).toBe(true);
      }
    },
  );

  it.each(["candy_store", "confectionery", "chocolate_shop"])("restricts candy genre %s to dessert and gift categories", (genre) => {
    for (const category of ["dessert_shop", "dessert_restaurant", "ice_cream_shop", "donut_shop", "bakery", "gift_shop", "gift_basket_store"]) {
      expect(mismatch(genre, category)).toBe(false);
    }
    for (const category of ["coffee_shop", "cafe", "gym", "restaurant", "american_restaurant", "wine_store", "pet_supply_store"]) {
      expect(mismatch(genre, category)).toBe(true);
    }
  });

  it.each(["coffee_bar", "espresso_bar", "barbecue_restaurant", "barista_training", "candy", "university_campus", "university:gym"])(
    "keeps %s because its last segment is outside the frozen families", (genre) => {
      expect(mismatch(genre, "coffee_shop")).toBe(false);
      expect(mismatch(genre, "gym")).toBe(false);
    },
  );

  it.each([["Tea Bar", "cafe", "coffee_shop"], ["Café & Bar", "cafe", "coffee_shop"], ["University Hills Fitness", "gym", "gym"]])(
    "uses genre alone for %s", (name, genre, category) => {
      expect(mismatch(genre, category, name)).toBe(false);
    },
  );
});

describe("missing genres and existing known names", () => {
  it.each(["Fake Cocktail Bar", "Fake Candy Shop", "Fake University Gym", "Fake Country Club", "Fake Athletic Club", "Enstrom Candies"])(
    "keeps %s without a genre", (name) => {
      const place = makeFakePlace(1, { name, primaryGenreId: undefined });
      expect(isCategoryMismatch(place, COFFEE)).toBe(false);
      expect(isCategoryMismatch(place, GYM)).toBe(false);
    },
  );

  it.each([
    ["Death & Co Denver", COFFEE], ["DEATH and CO. DENVER", COFFEE],
    ["Denver Country Club", GYM], ["The Denver Athletic Club", GYM], ["Gregory Gym", GYM],
  ])("retains the existing confirmed-name exception for %s", (name, category) => {
    expect(isCategoryMismatch(makeFakePlace(1, { name, primaryGenreId: undefined }), category)).toBe(true);
  });

  it("keeps the existing name exceptions exact and category-specific", () => {
    for (const name of ["Fake Gregory Gym", "Fake Denver Athletic Clubhouse", "Fake Death and Co Denver Cafe"]) {
      const place = makeFakePlace(1, { name, primaryGenreId: undefined });
      expect(isCategoryMismatch(place, COFFEE)).toBe(false);
      expect(isCategoryMismatch(place, GYM)).toBe(false);
    }
    expect(isCategoryMismatch(makeFakePlace(1, { name: "Gregory Gym", primaryGenreId: undefined }), COFFEE)).toBe(false);
  });
});
