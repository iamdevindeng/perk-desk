// Resolves a city and filters Qloo places into exact branch matches or nearby-name suggestions.
// Called by: the branch-lookup API route and offline branch-lookup tests
import {
  BRANCH_LOOKUP_GENRES, BRANCH_LOOKUP_MAX_PLACES, BRANCH_LOOKUP_MAX_SUGGESTIONS, BRANCH_MAX_CITY_DISTANCE_M,
} from "@/lib/config";
import { findUsCityCenter, getCities } from "@/lib/data";
import { haversineMeters } from "@/lib/merchants/distance";
import { normalizeName } from "@/lib/merchants/name-match";
import { resolveLocality } from "@/lib/qloo/insights";
import { searchPlacesByName } from "@/lib/qloo/search";
import type { QlooCallOptions } from "@/lib/qloo/client";
import type { BranchLookupRequest, BranchLookupResponse, Place } from "@/lib/types";

type Center = { label: string; lat: number; lon: number };
type BranchLocation = BranchLookupResponse["places"][number];
const NON_BRANCH_NAME = /\b(atm|corporate|administrative|offices?|headquarters|no branch|mortgage)\b/i;

async function resolveCenter(city: string, options: QlooCallOptions): Promise<Center | null> {
  const knownCity = getCities().find((entry) => entry.label === city);
  if (knownCity) return knownCity;
  // Census internal points can be a few km from downtown (~10 km for Denver), well inside the 50 km filter.
  const tableCity = findUsCityCenter(city);
  if (tableCity) return { label: tableCity.label, lat: tableCity.lat, lon: tableCity.lon };
  const locality = await resolveLocality(city, options);
  return locality ? { label: locality.name, lat: locality.lat, lon: locality.lon } : null;
}

function branchLocations(places: Place[], center: Center): BranchLocation[] {
  const nearby = places.flatMap((place) => {
    if (!BRANCH_LOOKUP_GENRES.includes(place.primaryGenreId ?? "") || place.isClosed || NON_BRANCH_NAME.test(place.name)) return [];
    const distanceMeters = haversineMeters(center, place);
    if (distanceMeters > BRANCH_MAX_CITY_DISTANCE_M) return [];
    const { entityId, name, address, lat, lon } = place;
    return [{ entityId, name, address, lat, lon, distanceMeters }];
  }).sort((first, second) => first.distanceMeters - second.distanceMeters);
  const seen = new Set<string>();
  return nearby.filter((place) => {
    if (seen.has(place.entityId)) return false;
    seen.add(place.entityId);
    return true;
  });
}

function matchesQuery(place: BranchLocation, query: string): boolean {
  const name = normalizeName(place.name);
  const normalizedQuery = normalizeName(query);
  return Boolean(normalizedQuery) && (name === normalizedQuery || name.startsWith(`${normalizedQuery} `));
}

function suggestedNames(places: BranchLocation[]): BranchLookupResponse["suggestions"] {
  const groups = new Map<string, { name: string; locations: number }>();
  for (const place of places) {
    // Qloo may suffix an institution name with a branch label (FIXES-R10 R41).
    const name = place.name.split(" - ")[0].replace(/\bbranch\s*$/i, "").trim();
    if (!name) continue;
    const key = normalizeName(name);
    const existing = groups.get(key);
    if (existing) existing.locations += 1;
    else groups.set(key, { name, locations: 1 });
  }
  return [...groups.values()]
    .sort((first, second) => second.locations - first.locations || first.name.localeCompare(second.name))
    .slice(0, BRANCH_LOOKUP_MAX_SUGGESTIONS);
}

export async function lookupBranches(input: BranchLookupRequest, options: QlooCallOptions = {}): Promise<BranchLookupResponse> {
  const empty: BranchLookupResponse = { status: "city_not_found", query: input.name, cityLabel: input.city, places: [], suggestions: [] };
  const center = await resolveCenter(input.city, options);
  if (!center) return empty;
  const places = branchLocations(await searchPlacesByName(input.name, center.lat, center.lon, options), center);
  const matches = places.filter((place) => matchesQuery(place, input.name));
  if (matches.length) return { ...empty, status: "found", cityLabel: center.label, places: matches.slice(0, BRANCH_LOOKUP_MAX_PLACES) };
  return { ...empty, status: places.length ? "other_names" : "none", cityLabel: center.label, suggestions: suggestedNames(places) };
}
