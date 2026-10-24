// Validates research requests and streams live or cached results with safe daily limits.
// Called by: the browser's POST /api/run request and run-route unit tests
import { z } from "zod";
import { runResearch } from "@/lib/agent/run-agent";
import { LIVE_LIMIT_MESSAGE, RESULT_TTL_S, RUN_REPLAY_DELAY_MS } from "@/lib/config";
import { hasQlooKey } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { isNationalChain, isTeamStore } from "@/lib/merchants/chains";
import { createQlooError } from "@/lib/qloo/client";
import { isBlacklistedCategory } from "@/lib/qloo/tags";
import { getJson, setJson } from "@/lib/store/cache";
import { checkLimit, getClientIp } from "@/lib/store/rate-limit";
import { withRunUsage } from "@/lib/store/usage";
import { createEmitter, createNdjsonResponse, type Emit } from "@/lib/stream";
import { RunRequestSchema, RunResultSchema, TraceEventSchema, type RunRequest, type TraceEvent } from "@/lib/types";

export const maxDuration = 300;

const CachedRunSchema = z.object({ complete: z.literal(true), events: z.array(TraceEventSchema) });

async function validateRequest(request: Request): Promise<RunRequest | Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "bad_request", issues: [{ path: [], code: "invalid_json" }] }, { status: 400 }); }
  const parsed = RunRequestSchema.safeParse(body);
  const categoryMessage = "Choose valid place categories that are allowed for merchant research.";
  if (!parsed.success) {
    return Response.json({ error: "bad_request",
      message: parsed.error.issues.some((issue) => issue.path[0] === "categories") ? categoryMessage : "Check the research request fields.",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.slice(0, 1).map(String), code: issue.code })),
    }, { status: 400 });
  }
  if (parsed.data.categories.some((category) => isBlacklistedCategory(category.tagId))) {
    return Response.json({ error: "bad_request", message: categoryMessage,
      issues: [{ path: ["categories"], code: "disallowed_category" }],
    }, { status: 400 });
  }
  return parsed.data;
}

async function cachedEvents(key: string): Promise<TraceEvent[] | null> {
  const parsed = CachedRunSchema.safeParse(await getJson(key));
  if (!parsed.success) return null;
  const events = parsed.data.events;
  // Corrupt, incomplete, or error traces must not become successful cached replays.
  if (events.at(-1)?.type !== "result" || events.filter((event) => event.type === "result").length !== 1) return null;
  if (events.some((event) => ["error", "limited", "done"].includes(event.type))) return null;
  const result = events.find((event) => event.type === "result")?.result;
  // A cached shortlist must obey today's name exclusions too, without flushing unrelated runs.
  if (result?.merchants.some(({ place }) => isNationalChain(place.name) || isTeamStore(place.name))) return null;
  return events;
}

async function replay(events: TraceEvent[], emit: Emit): Promise<void> {
  emit({ type: "agent_note", at: 0, text: "Replaying a cached research result." });
  for (const event of events) {
    await new Promise((resolve) => setTimeout(resolve, RUN_REPLAY_DELAY_MS));
    emit(event.type === "qloo_call" ? { ...event, cached: true } : event);
  }
}

async function runWork(input: RunRequest, key: string, emit: Emit): Promise<void> {
  if (!hasQlooKey()) throw createQlooError("config", null, "Server is missing its Qloo key.");
  const events: TraceEvent[] = [];
  const collect = createEmitter((event) => { events.push(event); emit(event); });
  let complete = false;
  const result = RunResultSchema.parse(await runResearch(input, collect, { onCacheable: (value) => { complete = value; } }));
  collect({ type: "result", at: 0, result });
  // Old envelopes lack completeness evidence and are replaced after a healthy rerun at the same key.
  if (complete) await setJson(key, { complete: true, events }, RESULT_TTL_S);
}

export async function POST(request: Request): Promise<Response> {
  const input = await validateRequest(request);
  if (input instanceof Response) return input;
  const key = cacheKey("run", input);
  const cached = await cachedEvents(key);
  if (cached) return createNdjsonResponse(async (emit) => { await replay(cached, emit); });
  // Check shared budgets before opening the stream so store failures can return HTTP 503.
  const ip = getClientIp(request);
  const limit = await checkLimit("run", ip);
  if (limit.reason === "store") return Response.json({ error: "config", message: limit.message }, { status: 503 });
  if (!limit.ok) return createNdjsonResponse(async (emit) => { emit({ type: "limited", at: 0, message: LIVE_LIMIT_MESSAGE }); });
  return createNdjsonResponse(async (emit) => { await withRunUsage(ip, async () => { await runWork(input, key, emit); }); });
}
