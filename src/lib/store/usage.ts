// Counts outbound service attempts per live request and writes one privacy-safe usage line.
// Called by: the run route, Qloo transport, DeepSeek model transport, and usage tests
import { AsyncLocalStorage } from "node:async_hooks";
import { BRANCH_LOOKUP_QLOO_CALL_CAP, PLAN_QLOO_CALL_CAP, RUN_QLOO_CALL_CAP, USAGE_IP_HASH_LENGTH } from "@/lib/config";
import { sha256Hex } from "@/lib/hash";

type UsageScope = "run" | "plan" | "branches";
type UsageCounts = { qloo: number; llm: number; cap: number };
const runUsage = new AsyncLocalStorage<UsageCounts>();

export function recordUsageCall(service: "qloo" | "llm"): void {
  const counts = runUsage.getStore();
  if (counts) counts[service] += 1;
}

export function isQlooBudgetReached(): boolean {
  const counts = runUsage.getStore();
  return counts !== undefined && counts.qloo >= counts.cap;
}

export async function withRunUsage<T>(ip: string, work: () => Promise<T>, scope: UsageScope = "run"): Promise<T> {
  const ipHash = sha256Hex(ip).slice(0, USAGE_IP_HASH_LENGTH);
  const caps = { run: RUN_QLOO_CALL_CAP, plan: PLAN_QLOO_CALL_CAP, branches: BRANCH_LOOKUP_QLOO_CALL_CAP };
  const counts = { qloo: 0, llm: 0, cap: caps[scope] };
  // Async context keeps concurrent runs separate without passing counters through every tool.
  return await runUsage.run(counts, async () => {
    try { return await work(); }
    finally {
      console.info(`[usage] scope=${scope} ip_hash=${ipHash} qloo_calls=${counts.qloo} llm_calls=${counts.llm}`);
    }
  });
}
