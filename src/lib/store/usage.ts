// Counts outbound service attempts per live run and writes one privacy-safe usage line.
// Called by: the run route, Qloo transport, DeepSeek model transport, and usage tests
import { AsyncLocalStorage } from "node:async_hooks";
import { USAGE_IP_HASH_LENGTH } from "@/lib/config";
import { sha256Hex } from "@/lib/hash";

type UsageCounts = { qloo: number; llm: number };
const runUsage = new AsyncLocalStorage<UsageCounts>();

export function recordUsageCall(service: "qloo" | "llm"): void {
  const counts = runUsage.getStore();
  if (counts) counts[service] += 1;
}

export async function withRunUsage<T>(ip: string, work: () => Promise<T>): Promise<T> {
  const ipHash = sha256Hex(ip).slice(0, USAGE_IP_HASH_LENGTH);
  const counts = { qloo: 0, llm: 0 };
  // Async context keeps concurrent runs separate without passing counters through every tool.
  return await runUsage.run(counts, async () => {
    try { return await work(); }
    finally {
      console.info(`[usage] scope=run ip_hash=${ipHash} qloo_calls=${counts.qloo} llm_calls=${counts.llm}`);
    }
  });
}
