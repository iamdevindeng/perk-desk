// Detects national chains, team stores, and separate locations sharing a normalized merchant name.
// Called by: merchant filtering, research shortlists, and chains unit tests.
import { getCities, getExactNationalChainNames, getNationalChainNames } from "@/lib/data";
import { normalizeName } from "@/lib/merchants/name-match";
import type { MerchantCandidate } from "@/lib/types";

const RETAIL_QUALIFIERS = [
  "employee store", "factory store", "co op", "store", "outlet", "factory", "flagship", "coop", "kids", "company",
  // R18 explicitly names Marmot Boulder; keep this bounded exception without changing preset city data.
  "boulder",
];

function chainWords(name: string): string {
  return name.normalize("NFKC").toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim();
}

function normalizeExactChainName(name: string, qualifiers: string[]): string {
  // Only documented separators and known suffixes may remove words from ambiguous brand names.
  const core = name.normalize("NFKC").split(/ - | \| | \(|,/)[0];
  let normalized = chainWords(core).replace(/^the\s+/, "");
  let suffix = qualifiers.find((qualifier) => normalized.endsWith(` ${qualifier}`));
  while (suffix) {
    normalized = normalized.slice(0, -(suffix.length + 1));
    suffix = qualifiers.find((qualifier) => normalized.endsWith(` ${qualifier}`));
  }
  return normalized;
}

function chainQualifiers(city?: string): string[] {
  const labels = [...getCities().map((entry) => entry.label), city ?? ""];
  const cityWords = labels.flatMap((label) => chainWords(label).split(" ")).filter(Boolean);
  return [...RETAIL_QUALIFIERS, ...new Set(cityWords)];
}

export function isTeamStore(name: string): boolean {
  // Team/stadium retail can arrive as sporting goods instead of a noise genre (QLOO_API.md §4.4).
  return /\b(?:stadium|team) stores?\b/.test(normalizeName(name));
}

export function isNationalChain(name: string, city?: string): boolean {
  const qualifiers = chainQualifiers(city);
  const exactName = normalizeExactChainName(name, qualifiers);
  if (exactName && getExactNationalChainNames().some((chain) => normalizeExactChainName(chain, qualifiers) === exactName)) return true;
  const normalized = normalizeName(name);
  if (!normalized) return false;
  // Space padding enforces whole normalized words without matching "ganni" in "gannicus".
  const paddedName = ` ${normalized} `;
  return getNationalChainNames().some((chainName) => {
    const chain = normalizeName(chainName);
    return chain.length > 0 && paddedName.includes(` ${chain} `);
  });
}

export function markDuplicateNames(candidates: MerchantCandidate[]): MerchantCandidate[] {
  const entityIdsByName = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const name = normalizeName(candidate.place.name);
    if (!name) continue;
    const entityIds = entityIdsByName.get(name) ?? new Set<string>();
    entityIds.add(candidate.place.entityId);
    entityIdsByName.set(name, entityIds);
  }
  return candidates.map((candidate) => {
    const name = normalizeName(candidate.place.name);
    const locationCount = entityIdsByName.get(name)?.size ?? 0;
    return { ...candidate, multiLocation: candidate.multiLocation || locationCount >= 2 };
  });
}
