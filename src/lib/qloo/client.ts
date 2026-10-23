// Sends paced Qloo requests and caches only validated slim results.
// Called by: Qloo search, tags, insights, and client unit tests
import { z } from "zod";
import {
  QLOO_BASE_URL_DEFAULT, QLOO_CACHE_TTL_S, QLOO_MIN_GAP_MS, QLOO_RETRY_AFTER_MS, QLOO_TIMEOUT_MS,
} from "@/lib/config";
import { getEnv } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { getJson, setJson } from "@/lib/store/cache";

export type QlooPath = "/search" | "/v2/tags" | "/v2/insights";
export type QlooParams = Record<string, string | number | boolean>;
export type QlooCallInfo = { endpoint: QlooPath; summary: string; ms: number; cached: boolean };
export type QlooCallOptions = { onCall?: (info: QlooCallInfo) => void };
export type QlooErrorCode = "config" | "auth" | "quota" | "timeout" | "upstream" | "network" | "bad_request";
export type QlooError = Error & { code: QlooErrorCode; status: number | null };

const ERROR_CODES = ["config", "auth", "quota", "timeout", "upstream", "network", "bad_request"];
const CALL_SUMMARIES = { "/search": "Brand search", "/v2/tags": "Place category search", "/v2/insights": "Place insights" };
let nextCallAt = 0;

export function createQlooError(code: QlooErrorCode, status: number | null, message: string): QlooError {
  return Object.assign(new Error(message), { code, status });
}

export function isQlooError(value: unknown): value is QlooError {
  return value instanceof Error && "code" in value && typeof value.code === "string" &&
    ERROR_CODES.includes(value.code) && "status" in value && (value.status === null || typeof value.status === "number");
}

function buildUrl(path: QlooPath, params: QlooParams): URL {
  if (!Object.hasOwn(CALL_SUMMARIES, path)) throw createQlooError("bad_request", null, "Unsupported Qloo endpoint.");
  let base: URL;
  try {
    base = new URL(getEnv().QLOO_BASE_URL);
  } catch {
    throw createQlooError("config", null, "Qloo base URL is invalid.");
  }
  // Overrides must never send the key outside the approved host. See AGENTS.md §8.
  if (base.origin !== QLOO_BASE_URL_DEFAULT || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw createQlooError("config", null, "Qloo base URL must use the approved hackathon host.");
  }
  const url = new URL(path, base);
  for (const key of Object.keys(params).sort()) url.searchParams.set(key, String(params[key]));
  return url;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCallSlot(): Promise<void> {
  const now = Date.now();
  const callAt = Math.max(now, nextCallAt);
  // Reserve before awaiting so concurrent branch queries receive distinct slots.
  nextCallAt = callAt + QLOO_MIN_GAP_MS;
  if (callAt > now) await sleep(callAt - now);
}

async function fetchResponse(url: URL, apiKey: string): Promise<Response> {
  await waitForCallSlot();
  try {
    return await fetch(url, {
      headers: { "X-Api-Key": apiKey }, signal: AbortSignal.timeout(QLOO_TIMEOUT_MS), redirect: "error",
    });
  } catch (error) {
    throw createQlooError(isTimeout(error) ? "timeout" : "network", null, "Qloo is having trouble; try again in a minute.");
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
}

function rejectErrorResponse(response: Response): void {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw createQlooError("auth", response.status, "Qloo refused our key. Demo presets may still work from cache.");
  }
  if (response.status === 429 && response.headers.get("x-month-ratelimit-remaining") === "0") {
    throw createQlooError("quota", 429, "Live research is paused (Qloo quota). Demo presets may still work from cache.");
  }
  const code = response.status === 400 ? "bad_request" : "upstream";
  throw createQlooError(code, response.status, "Qloo is having trouble; try again in a minute.");
}

async function readResponse(url: URL, apiKey: string): Promise<unknown> {
  let response = await fetchResponse(url, apiKey);
  if (response.status === 429 && response.headers.get("x-month-ratelimit-remaining") !== "0") {
    await response.body?.cancel();
    await sleep(QLOO_RETRY_AFTER_MS);
    response = await fetchResponse(url, apiKey);
  }
  rejectErrorResponse(response);
  try {
    return await response.json();
  } catch (error) {
    throw createQlooError(isTimeout(error) ? "timeout" : "upstream", response.status, "Qloo returned an unreadable response; try again in a minute.");
  }
}

function reportCall(path: QlooPath, startedAt: number, cached: boolean, options: QlooCallOptions): void {
  options.onCall?.({ endpoint: path, summary: CALL_SUMMARIES[path], ms: Date.now() - startedAt, cached });
}

export async function qlooGet(path: QlooPath, params: QlooParams, options: QlooCallOptions = {}): Promise<unknown> {
  const apiKey = getEnv().QLOO_API_KEY;
  if (!apiKey?.trim()) throw createQlooError("config", null, "Server is missing its Qloo key.");
  const url = buildUrl(path, params);
  const startedAt = Date.now();
  try {
    return await readResponse(url, apiKey);
  } finally {
    reportCall(path, startedAt, false, options);
  }
}

export async function cachedQlooCall<T>(
  path: QlooPath, params: QlooParams, slim: (raw: unknown) => T, schema: z.ZodType<T>, options: QlooCallOptions = {},
): Promise<T> {
  const startedAt = Date.now();
  const key = cacheKey("qloo", { path, params });
  const stored = await getJson(key);
  const cached = stored === null ? null : schema.safeParse(stored);
  if (cached?.success) {
    reportCall(path, startedAt, true, options);
    return cached.data;
  }
  try {
    const result = schema.safeParse(slim(await qlooGet(path, params)));
    if (!result.success) throw createQlooError("upstream", null, "Qloo returned an unexpected response; try again in a minute.");
    await setJson(key, result.data, QLOO_CACHE_TTL_S);
    return result.data;
  } catch (error) {
    if (isQlooError(error)) throw error;
    throw createQlooError("upstream", null, "Qloo returned an unexpected response; try again in a minute.");
  } finally {
    reportCall(path, startedAt, false, options);
  }
}
