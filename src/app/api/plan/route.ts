// Validates planning requests, serves canonical cached plans, and returns safe JSON errors.
// Called by: the browser's POST /api/plan request and plan-route unit tests
import { expandPlanRequest, runPlan } from "@/lib/agent/plan-agent";
import { LIVE_LIMIT_MESSAGE, RESULT_TTL_S } from "@/lib/config";
import { hasQlooKey } from "@/lib/env";
import { cacheKey } from "@/lib/hash";
import { createQlooError, isQlooError } from "@/lib/qloo/client";
import { getJson, setJson } from "@/lib/store/cache";
import { checkLimit, getClientIp } from "@/lib/store/rate-limit";
import { isQlooBudgetReached, withRunUsage } from "@/lib/store/usage";
import { PlanRequestSchema, PlanResponseSchema, type PlanRequest } from "@/lib/types";

export const maxDuration = 300;

type ValidationIssue = { path: string[]; code: string };

function badRequest(issues: ValidationIssue[]): Response {
  return Response.json({ error: "bad_request", issues }, { status: 400 });
}

async function validatedRequest(request: Request): Promise<PlanRequest | Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest([{ path: [], code: "invalid_json" }]); }
  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    // Only schema-owned top-level field names are returned; record keys can contain user data.
    return badRequest(parsed.error.issues.map((issue) => ({ path: issue.path.slice(0, 1).map(String), code: issue.code })));
  }
  try { return expandPlanRequest(parsed.data); }
  catch (error) {
    if (isQlooError(error) && error.code === "bad_request" && error.status === 400) {
      return badRequest([{ path: ["presetId"], code: "unknown_preset" }]);
    }
    throw error;
  }
}

function errorResponse(error: unknown): Response {
  if (!isQlooError(error)) return Response.json({ error: "internal", message: "Something went wrong." }, { status: 500 });
  if (error.code === "config") {
    return Response.json({ error: "config", message: "Server is missing its Qloo key." }, { status: 503 });
  }
  if (error.code === "auth") {
    return Response.json({ error: "auth", message: "Qloo refused our key. Demo presets may still work from cache." }, { status: 502 });
  }
  if (error.code === "quota") {
    return Response.json({ error: "quota", message: "Live research is paused (Qloo quota). Demo presets may still work from cache." }, { status: 503 });
  }
  return Response.json({ error: "upstream", message: "Qloo is having trouble; try again in a minute." }, { status: 502 });
}

async function limitedResponse(request: Request): Promise<Response | null> {
  const limit = await checkLimit("plan", getClientIp(request));
  if (limit.ok) return null;
  if (limit.reason === "store") return Response.json({ error: "config", message: limit.message }, { status: 503 });
  return Response.json(PlanResponseSchema.parse({
    mode: "fallback", limited: true, message: LIVE_LIMIT_MESSAGE,
    branches: [], brands: [], unresolved: [], categories: [], candidateCategories: [], trace: [], warnings: [],
  }));
}

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await validatedRequest(request);
    if (input instanceof Response) return input;
    const key = cacheKey("plan", input);
    const cached = PlanResponseSchema.safeParse(await getJson(key));
    if (cached.success && cached.data.categories.length > 0) return Response.json(cached.data);
    const limited = await limitedResponse(request);
    if (limited) return limited;
    if (!hasQlooKey()) throw createQlooError("config", null, "Server is missing its Qloo key.");
    return await withRunUsage(getClientIp(request), async () => {
      const result = PlanResponseSchema.parse(await runPlan(input, {}));
      if (result.categories.length > 0 && !isQlooBudgetReached()) await setJson(key, result, RESULT_TTL_S);
      return Response.json(result);
    }, "plan");
  } catch (error) {
    return errorResponse(error);
  }
}
