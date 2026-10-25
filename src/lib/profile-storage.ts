// Maintains browser-only branch memory and persists a validated program profile.
// Called by: the page, ProfileForm, and profile-storage unit tests
import { DEFAULT_RADIUS_M, PROFILE_MAX_SAVED_CITIES } from "@/lib/config";
import { getCities } from "@/lib/data";
import { ProfileSchema, type Profile } from "@/lib/types";

const PROFILE_KEY = "perkdesk:v1:profile";

export function emptyProfile(): Profile {
  return { institutionName: "", city: getCities()[0].label,
    branches: [{ id: "branch-1", name: "Main branch", address: "", radiusMeters: DEFAULT_RADIUS_M }],
    signedMerchantsText: "", businessMembersText: "", categoryPreferences: { removed: [], added: [] }, merchantStatus: {}, branchesByCity: {} };
}

export function rememberBranchesByCity(profile: Profile): Profile["branchesByCity"] {
  const city = profile.city.trim();
  if (!city) return profile.branchesByCity;
  // Re-saving moves this city to the end, so the oldest saved city expires first.
  const savedCities = Object.entries(profile.branchesByCity).filter(([label]) => label !== city);
  savedCities.push([city, profile.branches]);
  return Object.fromEntries(savedCities.slice(-PROFILE_MAX_SAVED_CITIES));
}

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); }
  catch { return null; }
}

function writeStored(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); }
  catch { /* Restricted or full storage must not prevent the current session from working. */ }
}

export function loadProfile(): Profile | null {
  const stored = readStored(PROFILE_KEY);
  if (!stored) return null;
  try {
    const parsed = ProfileSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function saveProfile(profile: Profile): void {
  const parsed = ProfileSchema.safeParse(profile);
  // Do not overwrite the last complete profile while a required field is being edited.
  if (parsed.success) writeStored(PROFILE_KEY, JSON.stringify(parsed.data));
}
