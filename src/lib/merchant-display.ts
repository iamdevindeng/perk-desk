// Formats cached merchant hours and resolved brand names without changing research data.
// Called by: merchant cards, category confirmation, CSV export, and display tests
import { normalizeName } from "@/lib/merchants/name-match";
import type { ResolvedBrand } from "@/lib/types";

const DAY_NAME = "(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)";
const FULL_DAY_HOURS = new RegExp(`^(${DAY_NAME})(?:\\s*[–—-]\\s*(${DAY_NAME}))?\\s*:?\\s*00:00\\s*[–—-]\\s*(?:00:00|24:00)$`, "i");
const DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function displayHours(text?: string): string | undefined {
  if (!text?.trim()) return text;
  const periods = text.trim().split(/\s*[·;]\s*|\r?\n/);
  const coveredDays = new Set<number>();
  for (const period of periods) {
    const match = FULL_DAY_HOURS.exec(period.trim());
    if (!match) return text;
    const start = DAY_NAMES.indexOf(match[1].slice(0, 3).toLowerCase());
    const end = match[2] ? DAY_NAMES.indexOf(match[2].slice(0, 3).toLowerCase()) : start;
    if (end < start) return text;
    // Count distinct days, not periods: overlapping ranges cannot fill a missing day (FIXES-R7 R35).
    for (let index = start; index <= end; index += 1) coveredDays.add(index);
  }
  return coveredDays.size === DAY_NAMES.length ? "Open 24 hours" : text;
}

function isNameExpansion(name: string, inputName: string): boolean {
  const normalized = normalizeName(name);
  const input = normalizeName(inputName);
  if (!input) return false;
  if (normalized === input || normalized.startsWith(`${input} `)) return true;
  // Keep corporate suffix initials here: Recreational Equipment Inc is the expansion of REI.
  const words = name.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const initials = words.map((word) => word[0]).join("").toLowerCase();
  return words.length > 1 && input.replaceAll(" ", "") === initials;
}

export function displayBrandName(name: string, brands: ResolvedBrand[] = []): string {
  const normalized = normalizeName(name);
  const brand = brands.find((entry) => normalizeName(entry.name) === normalized);
  return brand && isNameExpansion(name, brand.inputName) ? brand.inputName : name;
}
