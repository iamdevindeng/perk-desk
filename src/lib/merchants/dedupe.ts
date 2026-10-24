// Removes repeated merchant names from displayed results without changing their ranked order.
// Called by: the page when receiving a live or cached result, and deduplication unit tests
import { normalizeName } from "@/lib/merchants/name-match";
import type { RunResult } from "@/lib/types";

export function dedupeMerchants(result: RunResult): RunResult {
  const names = new Set<string>();
  const merchants = result.merchants.filter((merchant) => {
    const name = normalizeName(merchant.place.name);
    if (names.has(name)) return false;
    names.add(name);
    return true;
  });
  // Keep the existing object when nothing changes, avoiding unnecessary result and map updates.
  return merchants.length === result.merchants.length ? result : { ...result, merchants };
}
