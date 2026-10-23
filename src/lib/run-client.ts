// Sends validated planning requests and reads safe API responses in the browser.
// Called by: the page and client-request unit tests
import { z } from "zod";
import { loadJudgeCode } from "@/lib/profile-storage";
import { ErrorCodeSchema, PlanRequestSchema, PlanResponseSchema, type PlanRequest, type PlanResponse } from "@/lib/types";

const ErrorResponseSchema = z.object({ error: ErrorCodeSchema, message: z.string().optional() });

function requestHeaders(): HeadersInit {
  const judgeCode = loadJudgeCode();
  return judgeCode ? { "content-type": "application/json", "x-judge-code": judgeCode } : { "content-type": "application/json" };
}

async function planResponse(request: PlanRequest): Promise<Response> {
  try {
    return await fetch("/api/plan", { method: "POST", headers: requestHeaders(), body: JSON.stringify(request) });
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
