// Persists a validated profile and the optional judge code in browser storage.
// Called by: the page, client requests, and profile-storage unit tests
import { ProfileSchema, type Profile } from "@/lib/types";

const PROFILE_KEY = "perkdesk:v1:profile";
const JUDGE_KEY = "perkdesk:v1:judge";

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

export function loadJudgeCode(): string {
  return readStored(JUDGE_KEY)?.trim() ?? "";
}

export function saveJudgeCode(code: string): void {
  writeStored(JUDGE_KEY, code.trim());
}
