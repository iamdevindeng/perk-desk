// Verifies one private usage line per completed or failed run and isolated concurrent counts.
// Called by: npm test; no network or environment access
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USAGE_IP_HASH_LENGTH } from "@/lib/config";
import { sha256Hex } from "@/lib/hash";
import { recordUsageCall, withRunUsage } from "@/lib/store/usage";

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); });

function usageLine(ip: string, qloo: number, llm: number): string {
  return `[usage] scope=run ip_hash=${sha256Hex(ip).slice(0, USAGE_IP_HASH_LENGTH)} qloo_calls=${qloo} llm_calls=${llm}`;
}

describe("live usage logging", () => {
  it("returns the result and logs zero outbound attempts when all work is cached", async () => {
    await expect(withRunUsage("192.0.2.10", async () => "completed")).resolves.toBe("completed");
    expect(console.info).toHaveBeenCalledExactlyOnceWith(usageLine("192.0.2.10", 0, 0));
    expect(vi.mocked(console.info).mock.calls[0][0]).not.toContain("192.0.2.10");
  });

  it("logs attempts once on failure without logging the error or raw IP", async () => {
    const error = new Error("private upstream credential detail");
    const work = withRunUsage("2001:db8::1", async () => {
      recordUsageCall("qloo");
      recordUsageCall("llm");
      throw error;
    });
    await expect(work).rejects.toBe(error);
    expect(console.info).toHaveBeenCalledExactlyOnceWith(usageLine("2001:db8::1", 1, 1));
  });

  it("keeps interleaved runs separate across asynchronous work", async () => {
    let resumeFirst = (): void => undefined;
    const pauseFirst = new Promise<void>((resolve) => { resumeFirst = resolve; });
    const first = withRunUsage("192.0.2.1", async () => {
      recordUsageCall("qloo");
      await pauseFirst;
      recordUsageCall("llm");
    });
    await withRunUsage("192.0.2.2", async () => {
      recordUsageCall("qloo");
      await Promise.resolve();
      recordUsageCall("qloo");
    });
    resumeFirst();
    await first;
    expect(vi.mocked(console.info).mock.calls).toEqual([
      [usageLine("192.0.2.2", 2, 0)], [usageLine("192.0.2.1", 1, 1)],
    ]);
  });

  it("ignores calls outside a live-run scope", async () => {
    recordUsageCall("qloo");
    recordUsageCall("llm");
    expect(console.info).not.toHaveBeenCalled();
    await withRunUsage("unknown", async () => undefined);
    expect(console.info).toHaveBeenCalledExactlyOnceWith(usageLine("unknown", 0, 0));
  });
});
