// Stores validated slim data in optional Redis or an expiring local memory cache.
// Called by: Qloo helpers, API routes, agent tools, and tests/unit/cache.test.ts
import { Redis } from "@upstash/redis";
import { getEnv, hasUpstash } from "@/lib/env";

const memory = new Map<string, { value: unknown; expiresAt: number }>();
let redis: Redis | undefined;
let warned = false;

function redisClient(signal?: AbortSignal): Redis | null {
  if (!hasUpstash()) return null;
  const environment = getEnv();
  const credentials = { url: environment.UPSTASH_REDIS_REST_URL!, token: environment.UPSTASH_REDIS_REST_TOKEN! };
  // The callback form makes the installed SDK throw on abort instead of returning an abort reason as data.
  if (signal) return new Redis({ ...credentials, signal: () => signal });
  redis ??= new Redis(credentials);
  return redis;
}

async function optionalCacheWork(work: () => Promise<unknown>, signal?: AbortSignal): Promise<unknown | null> {
  if (!signal) return await work();
  if (signal.aborted) return null;
  let stop = (): void => undefined;
  const aborted = new Promise<null>((resolve) => {
    stop = (): void => resolve(null);
    signal.addEventListener("abort", stop, { once: true });
  });
  try {
    // Storage is optional: a pending SDK backoff must not hold research past its deadline.
    const result = await Promise.race([work(), aborted]);
    return signal.aborted ? null : result;
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

function warnOnce(): void {
  if (warned) return;
  warned = true;
  // Never expose SDK errors: they may contain request credentials. See ARCHITECTURE §13.
  console.warn("Cache unavailable; continuing without cached data.");
}

export async function getJson(key: string, signal?: AbortSignal): Promise<unknown | null> {
  if (signal?.aborted) return null;
  try {
    const client = redisClient(signal);
    if (client) return await optionalCacheWork(async () => client.get(key), signal);
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      memory.delete(key);
      return null;
    }
    // Match Redis's serialization boundary so callers cannot mutate cached results.
    return structuredClone(entry.value);
  } catch {
    if (!signal?.aborted) warnOnce();
    return null;
  }
}

export async function setJson(key: string, value: unknown, ttlSeconds: number, signal?: AbortSignal): Promise<void> {
  if (ttlSeconds <= 0 || signal?.aborted) return;
  try {
    const client = redisClient(signal);
    if (client) {
      await optionalCacheWork(async () => client.set(key, value, { ex: ttlSeconds }), signal);
      return;
    }
    memory.set(key, { value: structuredClone(value), expiresAt: Date.now() + ttlSeconds * 1000 });
  } catch {
    if (!signal?.aborted) warnOnce();
  }
}

export function clearMemoryCacheForTests(): void {
  memory.clear();
  redis = undefined;
  warned = false;
}
