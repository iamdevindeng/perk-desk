// Selects a balanced, unique shortlist across branches and merchant categories.
// Called by: research orchestration and tests/unit/shortlist.test.ts
import { SHORTLIST_TOTAL } from "@/lib/config";
import { normalizeName } from "@/lib/merchants/name-match";
import { assignNearestBranch, compareCandidates } from "@/lib/merchants/scoring";
import type { Branch, MerchantCandidate } from "@/lib/types";

function branchChoices(candidates: MerchantCandidate[], quota: number): MerchantCandidate[] {
  const categories = new Map<string, MerchantCandidate[]>();
  for (const candidate of candidates) {
    const category = categories.get(candidate.categoryTagId) ?? [];
    category.push(candidate);
    categories.set(candidate.categoryTagId, category);
  }
  const queues = [...categories.values()].map((category) => category.sort(compareCandidates));
  queues.sort((first, second) => compareCandidates(first[0], second[0]));
  const choices: MerchantCandidate[] = [];
  while (choices.length < quota && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const candidate = queue.shift();
      if (candidate) choices.push(candidate);
      if (choices.length === quota) break;
    }
  }
  return choices;
}

function balanceBranches(choicesByBranch: MerchantCandidate[][], total: number): MerchantCandidate[] {
  const selected: MerchantCandidate[] = [];
  const rounds = Math.max(...choicesByBranch.map((choices) => choices.length));
  // Interleave before trimming so ceil quotas do not starve the last branch. See TASKS.md T4.
  for (let index = 0; index < rounds; index++) {
    for (const choices of choicesByBranch) {
      const candidate = choices[index];
      if (candidate) selected.push(candidate);
      if (selected.length === total) return selected;
    }
  }
  return selected;
}

function uniqueMerchantNames(candidates: MerchantCandidate[]): MerchantCandidate[] {
  const bestByName = new Map<string, MerchantCandidate>();
  for (const candidate of candidates) {
    const name = normalizeName(candidate.place.name);
    const current = bestByName.get(name);
    if (!current || compareCandidates(candidate, current) < 0) bestByName.set(name, candidate);
  }
  return [...bestByName.values()];
}

export function buildShortlist(
  candidatesByCategory: Map<string, MerchantCandidate[]>,
  branches: Branch[],
  total = SHORTLIST_TOTAL,
): MerchantCandidate[] {
  const limit = Math.max(0, Math.floor(total));
  if (!limit || !branches.length) return [];
  const branchIds = new Set(branches.map((branch) => branch.id));
  // Choose the strongest location before branch balancing so backfill cannot reintroduce a duplicate name.
  const candidates = uniqueMerchantNames(assignNearestBranch([...candidatesByCategory.values()].flat()
    .filter((candidate) => branchIds.has(candidate.branchId))));
  const quota = Math.ceil(limit / branches.length);
  const choices = branches.map((branch) => branchChoices(candidates.filter((candidate) => candidate.branchId === branch.id), quota));
  const selected = balanceBranches(choices, limit);
  const selectedIds = new Set(selected.map((candidate) => candidate.place.entityId));
  const remaining = candidates.filter((candidate) => !selectedIds.has(candidate.place.entityId)).sort(compareCandidates);
  selected.push(...remaining.slice(0, limit - selected.length));
  return selected.sort(compareCandidates);
}
