// Rejects category contradictions using small genre families and existing confirmed names.
// Called by: merchant filtering, cached-run validation, and category-sanity unit tests.
import { normalizeName } from "@/lib/merchants/name-match";
import type { Place } from "@/lib/types";

type GenreFamily = { genres: string[]; allowedCategories: string[]; allowRestaurants?: boolean };

// Intentionally small and frozen (FIXES-R7 R32); document later mismatches in README, not one-off rules.
const GENRE_FAMILIES: GenreFamily[] = [
  {
    genres: ["bar", "cocktail_bar", "pub", "tavern", "brewery", "brewpub", "wine_bar", "winery", "nightclub", "lounge"],
    allowedCategories: ["bar", "bar_grill", "beer_garden", "brewery", "cocktail_bar", "wine_bar", "winery", "wine_store"],
    allowRestaurants: true,
  },
  {
    genres: ["country_club", "athletic_club", "golf_club", "social_club", "private_club"],
    allowedCategories: [],
  },
  {
    genres: ["university", "college", "campus", "school"],
    allowedCategories: [],
  },
  {
    genres: ["candy_store", "confectionery", "chocolate_shop"],
    allowedCategories: ["dessert_shop", "dessert_restaurant", "ice_cream_shop", "donut_shop", "bakery", "gift_shop", "gift_basket_store"],
  },
];

// These names were confirmed by the owner in FIXES-R6 R27; no response data is retained.
const KNOWN_NAMES: Record<string, string[]> = {
  "urn:tag:category:place:coffee_shop": ["Death & Co Denver"].map(normalizeName),
  "urn:tag:category:place:gym": ["Denver Country Club", "The Denver Athletic Club", "Gregory Gym"].map(normalizeName),
};

export function isCategoryMismatch(place: Place, categoryTagId: string): boolean {
  if (KNOWN_NAMES[categoryTagId]?.includes(normalizeName(place.name))) return true;
  const genre = place.primaryGenreId?.split(":").at(-1);
  const family = GENRE_FAMILIES.find((entry) => entry.genres.includes(genre ?? ""));
  if (!family) return false;
  const category = categoryTagId.split(":").at(-1) ?? "";
  if (family.allowedCategories.includes(category)) return false;
  const isRestaurant = category === "restaurant" || category.endsWith("_restaurant") || category === "food_court";
  return !(family.allowRestaurants && isRestaurant);
}
