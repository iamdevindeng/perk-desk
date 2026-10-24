// Detects national chains, team stores, and separate locations sharing a normalized merchant name.
// Called by: merchant filtering, research shortlists, and chains unit tests.
import { getExactNationalChainNames, getNationalChainNames } from "@/lib/data";
import { normalizeName } from "@/lib/merchants/name-match";
import type { MerchantCandidate } from "@/lib/types";

function normalizeExactChainName(name: string): string {
  // Keep all other words: ambiguous chains must not exclude names like "Rei Sushi" (FIXES-R5 R13).
  return name.normalize("NFKC").toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim()
    .replace(/\s+(?:factory store|store|outlet)$/, "");
}

export function isTeamStore(name: string): boolean {
  // Team/stadium retail can arrive as sporting goods instead of a noise genre (QLOO_API.md §4.4).
  return /\b(?:stadium|team) stores?\b/.test(normalizeName(name));
}

export function isNationalChain(name: string): boolean {
  const exactName = normalizeExactChainName(name);
  if (exactName && getExactNationalChainNames().some((chain) => normalizeExactChainName(chain) === exactName)) return true;
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
