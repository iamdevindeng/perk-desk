// Maintains browser-only branch memory and persists a validated program profile.
// Called by: the page, ProfileForm, and profile-storage unit tests
import { z } from "zod";
import { DEFAULT_RADIUS_M, PROFILE_MAX_BRANCHES, PROFILE_MAX_SAVED_CITIES } from "@/lib/config";
import { getCities } from "@/lib/data";
import { ProfileBranchSchema, ProfileSchema, type Profile } from "@/lib/types";

const PROFILE_KEY = "perkdesk:v1:profile";
// Browser drafts may be incomplete; request builders still require complete API fields.
const StoredBranchDraftSchema = ProfileBranchSchema.extend({ name: ProfileBranchSchema.shape.name.or(z.literal("")) });
const StoredBranchesSchema = z.array(StoredBranchDraftSchema).min(1).max(PROFILE_MAX_BRANCHES);
const StoredCityBranchesSchema = z.record(ProfileSchema.shape.branchesByCity.unwrap().keyType,
  StoredBranchesSchema).default({});
const StoredProfileSchema = ProfileSchema.extend({ institutionName: z.string().max(100), city: z.string().max(80),
  branches: StoredBranchesSchema, branchesByCity: StoredCityBranchesSchema });

export function emptyProfile(): Profile {
  return { institutionName: "", city: getCities()[0].label,
    branches: [{ id: "branch-1", name: "Main branch", address: "", radiusMeters: DEFAULT_RADIUS_M, isPlaceholder: true }],
    signedMerchantsText: "", businessMembersText: "", categoryPreferences: { removed: [], added: [] }, merchantStatus: {}, branchesByCity: {} };
}

export function isEmptyProfile(profile: Profile): boolean {
  const blank = emptyProfile();
  const branch = profile.branches[0];
  const blankBranch = blank.branches[0];
  return profile.institutionName === blank.institutionName && profile.city === blank.city &&
    profile.branches.length === 1 && branch.isPlaceholder === true && branch.name === blankBranch.name && branch.address === blankBranch.address &&
    branch.radiusMeters === blankBranch.radiusMeters && branch.lat === undefined && branch.lon === undefined &&
    branch.locationSource === undefined && profile.signedMerchantsText === "" && profile.businessMembersText === "" &&
    profile.categoryPreferences.removed.length === 0 && profile.categoryPreferences.added.length === 0 &&
    Object.keys(profile.merchantStatus).length === 0 && Object.keys(profile.branchesByCity).length === 0;
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
    const parsed = StoredProfileSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function saveProfile(profile: Profile): void {
  const parsed = StoredProfileSchema.safeParse(profile);
  // Malformed data must not replace the saved draft, but empty editable fields are valid drafts.
  if (parsed.success) writeStored(PROFILE_KEY, JSON.stringify(parsed.data));
}
