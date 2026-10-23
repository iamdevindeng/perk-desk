// Validates research requests and streams live or cached results with safe daily limits.
// Called by: the browser's POST /api/run request and run-route unit tests
import { z } from "zod";
import { runResearch } from "@/lib/agent/run-agent";
import { LIVE_LIMIT_MESSAGE, RESULT_TTL_S, RUN_REPLAY_DELAY_MS } from "@/lib/config";
import { hasQlooKey } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { createQlooError } from "@/lib/qloo/client";
import { getJson, setJson } from "@/lib/store/cache";
import { checkLimit, getClientIp, hasJudgeBypass, isPresetRun } from "@/lib/store/rate-limit";
import { createEmitter, createNdjsonResponse, type Emit } from "@/lib/stream";
import { RunRequestSchema, RunResultSchema, TraceEventSchema, type RunRequest, type TraceEvent } from "@/lib/types";

export const maxDuration = 300;

const CachedRunSchema = z.object({ events: z.array(TraceEventSchema) });

async function validateRequest(request: Request): Promise<RunRequest | Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "bad_request", issues: [{ path: [], code: "invalid_json" }] }, { status: 400 }); }
  const parsed = RunRequestSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  return Response.json({ error: "bad_request", issues: parsed.error.issues.map((issue) => ({
    path: issue.path.slice(0, 1).map(String), code: issue.code,
  })) }, { status: 400 });
}

async function cachedEvents(key: string): Promise<TraceEvent[] | null> {
  const parsed = CachedRunSchema.safeParse(await getJson(key));
  if (!parsed.success) return null;
  const events = parsed.data.events;
  // Corrupt, incomplete, or error traces must not become successful cached replays.
  if (events.at(-1)?.type !== "result" || events.filter((event) => event.type === "result").length !== 1) return null;
  if (events.some((event) => ["error", "limited", "done"].includes(event.type))) return null;
  return events;
}

async function replay(events: TraceEvent[], emit: Emit): Promise<void> {
  emit({ type: "agent_note", at: 0, text: "Replaying a cached research result." });
  for (const event of events) {
    await new Promise((resolve) => setTimeout(resolve, RUN_REPLAY_DELAY_MS));
    emit(event.type === "qloo_call" ? { ...event, cached: true } : event);
  }
}

async function runWork(request: Request, input: RunRequest, emit: Emit): Promise<void> {
  const key = cacheKey("run", input);
  const cached = await cachedEvents(key);
  if (cached) { await replay(cached, emit); return; }
  if (!hasJudgeBypass(request)) {
    const limit = await checkLimit("run", getClientIp(request), { skipIp: await isPresetRun(input) });
    if (!limit.ok) { emit({ type: "limited", at: 0, message: LIVE_LIMIT_MESSAGE }); return; }
  }
  if (!hasQlooKey()) throw createQlooError("config", null, "Server is missing its Qloo key.");
  const events: TraceEvent[] = [];
  const collect = createEmitter((event) => { events.push(event); emit(event); });
  const result = RunResultSchema.parse(await runResearch(input, collect, {}));
  collect({ type: "result", at: 0, result });
  await setJson(key, { events }, RESULT_TTL_S);
}

export async function POST(request: Request): Promise<Response> {
  const input = await validateRequest(request);
  if (input instanceof Response) return input;
  return createNdjsonResponse(async (emit) => { await runWork(request, input, emit); });
}
