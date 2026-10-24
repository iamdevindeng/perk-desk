// Sends validated planning/research requests and reads JSON or streamed trace responses.
// Called by: the page and client-request unit tests
import { z } from "zod";
import { ErrorCodeSchema, PlanRequestSchema, PlanResponseSchema, RunRequestSchema, TraceEventSchema, type ErrorCode, type PlanRequest, type PlanResponse, type RunRequest, type TraceEvent } from "@/lib/types";

const ErrorResponseSchema = z.object({ error: ErrorCodeSchema, message: z.string().optional() });
export type RunRequestError = Error & { status: number; code: ErrorCode };

export function isRunRequestError(value: unknown): value is RunRequestError {
  return value instanceof Error && "status" in value && typeof value.status === "number" &&
    Number.isInteger(value.status) && value.status >= 400 && value.status <= 599 &&
    "code" in value && ErrorCodeSchema.safeParse(value.code).success;
}

function runRequestError(status: number, body: unknown, fallbackMessage: string): RunRequestError {
  const parsed = ErrorResponseSchema.safeParse(body);
  const code = status === 503 ? "config" : status === 400 ? "bad_request" : status === 429 ? "quota"
    : parsed.success ? parsed.data.error : "internal";
  const message = parsed.success ? parsed.data.message?.trim() || fallbackMessage : fallbackMessage;
  return Object.assign(new Error(message), { status, code });
}

async function planResponse(request: PlanRequest): Promise<Response> {
  try {
    return await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  } catch {
    throw new Error("Could not reach Perk Desk. Check your connection and try again.");
  }
}

export async function postPlan(request: PlanRequest): Promise<PlanResponse> {
  const response = await planResponse(PlanRequestSchema.parse(request));
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error("Planning returned an unreadable response. Please try again."); }
  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(body);
    throw new Error(error.success && error.data.message ? error.data.message : "Check your profile and brand names, then try again.");
  }
  const parsed = PlanResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error("Planning returned an invalid response. Please try again.");
  return parsed.data;
}

type StreamState = { buffer: string; terminal: boolean; done: boolean };

function parseTraceLine(line: string): TraceEvent | null {
  if (!line.trim()) return null;
  try {
    const parsed = TraceEventSchema.safeParse(JSON.parse(line));
    if (parsed.success) return parsed.data;
  } catch { /* A malformed line does not prevent later valid progress events from rendering. */ }
  console.warn("Ignored an invalid research progress event.");
  return null;
}

function deliverLine(line: string, state: StreamState, onEvent: (event: TraceEvent) => void): void {
  const event = parseTraceLine(line);
  if (!event) return;
  if (state.done || (state.terminal && event.type !== "done") || (!state.terminal && event.type === "done")) {
    throw new Error("Research progress arrived in an invalid order.");
  }
  if (["result", "error", "limited"].includes(event.type)) state.terminal = true;
  if (event.type === "done") state.done = true;
  onEvent(event);
}

function deliverCompleteLines(state: StreamState, onEvent: (event: TraceEvent) => void): void {
  const lines = state.buffer.split("\n");
  state.buffer = lines.pop() ?? "";
  for (const line of lines) deliverLine(line, state, onEvent);
}

async function researchResponse(request: RunRequest): Promise<Response> {
  let response: Response;
  try {
    response = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  } catch { throw new Error("Could not reach Perk Desk. Check your connection and try again."); }
  if (response.ok) return response;
  let body: unknown;
  try { body = await response.json(); }
  catch { throw runRequestError(response.status, null, "Research could not start. Please check your profile and try again."); }
  throw runRequestError(response.status, body, "Check your profile and confirmed categories, then try again.");
}

async function readResearchStream(response: Response, onEvent: (event: TraceEvent) => void): Promise<void> {
  if (!response.body) throw new Error("Research returned no progress stream. Please try again.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state: StreamState = { buffer: "", terminal: false, done: false };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      state.buffer += decoder.decode(chunk.value, { stream: true });
      deliverCompleteLines(state, onEvent);
    }
    state.buffer += decoder.decode();
    deliverCompleteLines(state, onEvent);
    deliverLine(state.buffer, state, onEvent);
  } catch {
    try { await reader.cancel(); } catch { /* Reader failures must not expose transport details. */ }
    throw new Error("Research stream was interrupted. Please try again.");
  } finally { reader.releaseLock(); }
  if (!state.terminal || !state.done) throw new Error("Research ended before a complete result arrived. Please try again.");
}

export async function streamRun(request: RunRequest, onEvent: (event: TraceEvent) => void): Promise<void> {
  const response = await researchResponse(RunRequestSchema.parse(request));
  await readResearchStream(response, onEvent);
}
