// Enforces ordinary daily per-IP and shared research limits.
// Called by: plan/run routes and rate-limit unit tests
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { PLAN_LIMIT_GLOBAL, PLAN_LIMIT_PER_IP, RATE_WINDOW_MS, RUN_LIMIT_GLOBAL, RUN_LIMIT_PER_IP, SHARED_LIMIT_CONFIG_MESSAGE, SHARED_LIMIT_UNAVAILABLE_MESSAGE } from "@/lib/config";
import { getEnv, hasUpstash, isVercelProduction } from "@/lib/env";

type Scope = "plan" | "run";
type LimitResult = { ok: boolean; reason?: "ip" | "global" | "store"; message?: string };
const memory = new Map<string, { count: number; windowStart: number }>();
const redisExhaustedUntil = new Map<string, number>();
const limiters = new Map<string, Ratelimit>();
let redis: Redis | undefined;
let warned = false;

function limits(scope: Scope): { ip: number; global: number } {
  return scope === "plan" ? { ip: PLAN_LIMIT_PER_IP, global: PLAN_LIMIT_GLOBAL } : { ip: RUN_LIMIT_PER_IP, global: RUN_LIMIT_GLOBAL };
}

function consumeMemory(key: string, maximum: number): boolean {
  const now = Date.now();
  let entry = memory.get(key);
  if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) entry = { count: 0, windowStart: now };
  if (entry.count >= maximum) return false;
  entry.count += 1;
  memory.set(key, entry);
  return true;
}

function memoryLimit(scope: Scope, ip: string): LimitResult {
  const maximum = limits(scope);
  if (redisExhausted(`${scope}:ip:${ip}`) || !consumeMemory(`${scope}:ip:${ip}`, maximum.ip)) return { ok: false, reason: "ip" };
  if (redisExhausted(`${scope}:global:all`) || !consumeMemory(`${scope}:global:all`, maximum.global)) return { ok: false, reason: "global" };
  return { ok: true };
}

function redisExhausted(key: string): boolean {
  const until = redisExhaustedUntil.get(key);
  if (until !== undefined && Date.now() < until) return true;
  redisExhaustedUntil.delete(key);
  return false;
}

function shadowUsage(scope: Scope, ip: string): void {
  const maximum = limits(scope);
  consumeMemory(`${scope}:ip:${ip}`, maximum.ip);
  consumeMemory(`${scope}:global:all`, maximum.global);
}

function limiter(scope: Scope, kind: "ip" | "global"): Ratelimit {
  const prefix = `pd:v1:rl:${scope}:${kind}`;
  const existing = limiters.get(prefix);
  if (existing) return existing;
  const environment = getEnv();
  redis ??= new Redis({ url: environment.UPSTASH_REDIS_REST_URL!, token: environment.UPSTASH_REDIS_REST_TOKEN! });
  const created = new Ratelimit({ redis, prefix, limiter: Ratelimit.fixedWindow(limits(scope)[kind], "1 d"), analytics: false });
  limiters.set(prefix, created);
  return created;
}

async function consumeRedis(scope: Scope, kind: "ip" | "global", identifier: string): Promise<boolean> {
  const result = await limiter(scope, kind).limit(identifier);
  // Upstash's timeout response permits traffic by default; production must fail closed.
  if (result.reason === "timeout") throw new Error("Rate limit service timed out.");
  const key = `${scope}:${kind}:${identifier}`;
  if (!result.success || result.remaining === 0) {
    // A denial or last accepted token is shared usage we must remember during a subsequent outage.
    const reset = Number.isFinite(result.reset) ? result.reset : Date.now() + RATE_WINDOW_MS;
    redisExhaustedUntil.set(key, reset);
  } else {
    redisExhaustedUntil.delete(key);
  }
  return result.success;
}

export async function checkLimit(scope: Scope, ip: string): Promise<LimitResult> {
  if (!hasUpstash()) {
    if (isVercelProduction()) return { ok: false, reason: "store", message: SHARED_LIMIT_CONFIG_MESSAGE };
    return localFallback(scope, ip);
  }
  try {
    if (!await consumeRedis(scope, "ip", ip)) return { ok: false, reason: "ip" };
    if (!await consumeRedis(scope, "global", "all")) return { ok: false, reason: "global" };
    // Shadow successful requests so a service outage does not reset observed local usage.
    shadowUsage(scope, ip);
    return { ok: true };
  } catch {
    if (isVercelProduction()) return { ok: false, reason: "store", message: SHARED_LIMIT_UNAVAILABLE_MESSAGE };
    return localFallback(scope, ip);
  }
}

function localFallback(scope: Scope, ip: string): LimitResult {
  if (!warned) console.warn("Rate limit service unavailable; using local limits.");
  warned = true;
  return memoryLimit(scope, ip);
}

export function getClientIp(request: Request): string {
  // Vercel supplies the client as the first forwarded address; later entries are proxy hops.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function resetMemoryLimitsForTests(): void {
  memory.clear();
  redisExhaustedUntil.clear();
  limiters.clear();
  redis = undefined;
  warned = false;
}
