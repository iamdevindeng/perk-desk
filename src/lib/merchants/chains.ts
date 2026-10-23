// Detects national chains and marks separate locations sharing a normalized merchant name.
// Called by: merchant filtering, research shortlists, and chains unit tests.
import { getNationalChainNames } from "@/lib/data";
import { normalizeName } from "@/lib/merchants/name-match";
import type { MerchantCandidate } from "@/lib/types";

export function isNationalChain(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  // Space padding enforces whole normalized words without matching "rei" in "reiss".
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
