// Normalizes merchant names and matches pasted lists with conservative substring rules.
// Called by: brand resolution, chain detection, merchant filtering, and name-match tests.
import { NAME_CONTAINS_MIN_LENGTH } from "@/lib/config";

export function normalizeName(name: string): string {
  return name.normalize("NFKC").toLowerCase()
    .replaceAll("&", " and ")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim()
    .replace(/^the\s+/, "")
    .replace(/(?:\s+(?:llc|inc|co|company))+$/, "")
    .trim();
}

export function nameMatches(name: string, names: string[]): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  return names.some((listedName) => {
    const listed = normalizeName(listedName);
    if (!listed) return false;
    if (normalized === listed) return true;
    // Short words like "Cafe" would exclude unrelated shops (ARCHITECTURE §6.2).
    const shorterLength = Math.min(normalized.length, listed.length);
    return shorterLength >= NAME_CONTAINS_MIN_LENGTH &&
      (normalized.includes(listed) || listed.includes(normalized));
  });
}
