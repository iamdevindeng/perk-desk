// Stores validated slim data in optional Redis or an expiring local memory cache.
// Called by: Qloo helpers, API routes, agent tools, and tests/unit/cache.test.ts
import { Redis } from "@upstash/redis";
import { getEnv, hasUpstash } from "@/lib/env";

const memory = new Map<string, { value: unknown; expiresAt: number }>();
let redis: Redis | undefined;
let warned = false;

function redisClient(): Redis | null {
  if (!hasUpstash()) return null;
  const environment = getEnv();
  redis ??= new Redis({ url: environment.UPSTASH_REDIS_REST_URL!, token: environment.UPSTASH_REDIS_REST_TOKEN! });
  return redis;
}

function warnOnce(): void {
  if (warned) return;
  warned = true;
  // Never expose SDK errors: they may contain request credentials. See ARCHITECTURE §13.
  console.warn("Cache unavailable; continuing without cached data.");
}

export async function getJson(key: string): Promise<unknown | null> {
  try {
    const client = redisClient();
    if (client) return await client.get(key);
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      memory.delete(key);
      return null;
    }
    // Match Redis's serialization boundary so callers cannot mutate cached results.
    return structuredClone(entry.value);
  } catch {
    warnOnce();
    return null;
  }
}

export async function setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (ttlSeconds <= 0) return;
  try {
    const client = redisClient();
    if (client) {
      await client.set(key, value, { ex: ttlSeconds });
      return;
    }
    memory.set(key, { value: structuredClone(value), expiresAt: Date.now() + ttlSeconds * 1000 });
  } catch {
    warnOnce();
  }
}

export function clearMemoryCacheForTests(): void {
  memory.clear();
  redis = undefined;
  warned = false;
}
