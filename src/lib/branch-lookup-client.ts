// Sends branch searches and validates their JSON responses without storing lookup state.
// Called by: BranchLookup and offline branch-lookup client tests
import { z } from "zod";
import { BranchLookupRequestSchema, BranchLookupResponseSchema, type BranchLookupRequest, type BranchLookupResponse } from "@/lib/types";

const LookupErrorSchema = z.object({ message: z.string().trim().min(1) });

export async function postBranchLookup(request: BranchLookupRequest, signal: AbortSignal): Promise<BranchLookupResponse> {
  const parsedRequest = BranchLookupRequestSchema.parse(request);
  let response: Response;
  try {
    response = await fetch("/api/branches", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedRequest), signal });
  } catch { throw new Error("Could not reach Perk Desk. Check your connection and try again."); }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error("Branch search returned an unreadable response. Please try again."); }
  if (!response.ok) {
    const error = LookupErrorSchema.safeParse(body);
    throw new Error(error.success ? error.data.message : "Branch search could not finish. Please try again.");
  }
  const parsed = BranchLookupResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error("Branch search returned an invalid response. Please try again.");
  return parsed.data;
}
