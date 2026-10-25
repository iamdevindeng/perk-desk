// Validates and rate-limits institution branch lookups before calling Qloo.
// Called by: the profile form's POST /api/branches request and branch-route unit tests
import { lookupBranches } from "@/lib/branch-lookup";
import { LIVE_LIMIT_MESSAGE, PLAN_DEADLINE_MS } from "@/lib/config";
import { hasQlooKey } from "@/lib/env";
import { createQlooError } from "@/lib/qloo/client";
import { qlooErrorResponse } from "@/lib/qloo-error-response";
import { checkLimit, getClientIp } from "@/lib/store/rate-limit";
import { withRunUsage } from "@/lib/store/usage";
import { BranchLookupRequestSchema, BranchLookupResponseSchema, type BranchLookupRequest } from "@/lib/types";

export const maxDuration = 300;

async function validatedRequest(request: Request): Promise<BranchLookupRequest | Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "bad_request", issues: [{ path: [], code: "invalid_json" }] }, { status: 400 }); }
  const parsed = BranchLookupRequestSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((issue) => ({ path: issue.path.slice(0, 1).map(String), code: issue.code }));
  return Response.json({ error: "bad_request", issues }, { status: 400 });
}

async function limitedResponse(ip: string, input: BranchLookupRequest): Promise<Response | null> {
  const limit = await checkLimit("branches", ip);
  if (limit.ok) return null;
  if (limit.reason === "store") return Response.json({ error: "config", message: limit.message }, { status: 503 });
  return Response.json(BranchLookupResponseSchema.parse({
    status: "limited", query: input.name, cityLabel: input.city, message: LIVE_LIMIT_MESSAGE, places: [], suggestions: [],
  }));
}

export async function POST(request: Request): Promise<Response> {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(PLAN_DEADLINE_MS)]);
  try {
    const input = await validatedRequest(request);
    if (input instanceof Response) return input;
    if (request.signal.aborted) return new Response(null, { status: 204 });
    const ip = getClientIp(request);
    const limited = await limitedResponse(ip, input);
    if (limited) return limited;
    if (request.signal.aborted) return new Response(null, { status: 204 });
    if (!hasQlooKey()) throw createQlooError("config", null, "Server is missing its Qloo key.");
    return await withRunUsage(ip, async () => {
      const result = BranchLookupResponseSchema.parse(await lookupBranches(input, { signal }));
      if (request.signal.aborted) return new Response(null, { status: 204 });
      return Response.json(result);
    }, "branches");
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 204 });
    return qlooErrorResponse(error);
  }
}
