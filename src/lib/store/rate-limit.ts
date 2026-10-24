// Enforces daily research budgets and verifies judge and preset exemptions.
// Called by: plan/run routes and rate-limit unit tests
import { timingSafeEqual } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { PLAN_LIMIT_GLOBAL, PLAN_LIMIT_PER_IP, RATE_WINDOW_MS, RUN_LIMIT_GLOBAL, RUN_LIMIT_PER_IP } from "@/lib/config";
import { findPreset } from "@/lib/data";
import { getEnv, hasUpstash } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { getJson } from "@/lib/store/cache";
import { PlanRequestSchema, PlanResponseSchema, type Branch, type RunRequest } from "@/lib/types";

type Scope = "plan" | "run";
type LimitResult = { ok: boolean; reason?: "ip" | "global" };
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

function memoryLimit(scope: Scope, ip: string, skipIp: boolean): LimitResult {
  const maximum = limits(scope);
  if (!skipIp && (redisExhausted(`${scope}:ip:${ip}`) || !consumeMemory(`${scope}:ip:${ip}`, maximum.ip))) return { ok: false, reason: "ip" };
  if (redisExhausted(`${scope}:global:all`) || !consumeMemory(`${scope}:global:all`, maximum.global)) return { ok: false, reason: "global" };
  return { ok: true };
}

function redisExhausted(key: string): boolean {
  const until = redisExhaustedUntil.get(key);
  if (until !== undefined && Date.now() < until) return true;
  redisExhaustedUntil.delete(key);
  return false;
}

function shadowUsage(scope: Scope, ip: string, skipIp: boolean): void {
  const maximum = limits(scope);
  if (!skipIp) consumeMemory(`${scope}:ip:${ip}`, maximum.ip);
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
  // Upstash's timeout response permits traffic by default; apply our local budget instead.
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

export async function checkLimit(scope: Scope, ip: string, options: { skipIp?: boolean } = {}): Promise<LimitResult> {
  const skipIp = options.skipIp ?? false;
  if (!hasUpstash()) return memoryLimit(scope, ip, skipIp);
  try {
    if (!skipIp && !await consumeRedis(scope, "ip", ip)) return { ok: false, reason: "ip" };
    if (!await consumeRedis(scope, "global", "all")) return { ok: false, reason: "global" };
    // Shadow successful requests so a service outage does not reset observed local usage.
    shadowUsage(scope, ip, skipIp);
    return { ok: true };
  } catch {
    if (!warned) console.warn("Rate limit service unavailable; using local limits.");
    warned = true;
    return memoryLimit(scope, ip, skipIp);
  }
}

export function getClientIp(request: Request): string {
  // Vercel supplies the client as the first forwarded address; later entries are proxy hops.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function hasJudgeBypass(request: Request): boolean {
  const expected = getEnv().JUDGE_BYPASS_CODE;
  const received = request.headers.get("x-judge-code");
  if (!expected?.trim() || !received?.trim()) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");
  // timingSafeEqual throws for unequal byte lengths, including multibyte text.
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function branchesMatch(actual: Branch[], expected: Branch[]): boolean {
  if (actual.length !== expected.length || new Set(actual.map((branch) => branch.id)).size !== actual.length) return false;
  return actual.every((branch) => expected.some((presetBranch) => branch.id === presetBranch.id &&
    branch.lat === presetBranch.lat && branch.lon === presetBranch.lon && branch.radiusMeters === presetBranch.radiusMeters));
}

export async function isPresetRun(request: RunRequest): Promise<boolean> {
  const preset = request.presetId ? findPreset(request.presetId) : undefined;
  if (!preset || !branchesMatch(request.branches, preset.profile.branches)) return false;
  const canonical = PlanRequestSchema.parse({
    ...preset.profile, presetId: preset.id,
    branches: preset.profile.branches.map((branch) => ({ ...branch, locationSource: "preset" })),
    brandNames: preset.brandsText.split(/\r?\n/).map((name) => name.trim()).filter(Boolean),
  });
  const cached = PlanResponseSchema.safeParse(await getJson(cacheKey("plan", canonical)));
  if (!cached.success || !cached.data.brands.length || !request.brands.length) return false;
  const names = request.brands.map((brand) => brand.name.trim().toLowerCase());
  if (new Set(names).size !== names.length || new Set(request.brands.map((brand) => brand.entityId)).size !== names.length) return false;
  return request.brands.every((brand) => cached.data.brands.some((resolved) =>
    resolved.entityId === brand.entityId && resolved.name.trim().toLowerCase() === brand.name.trim().toLowerCase()));
}

export function resetMemoryLimitsForTests(): void {
  memory.clear();
  redisExhaustedUntil.clear();
  limiters.clear();
  redis = undefined;
  warned = false;
}
