// Maps Qloo failures to safe HTTP errors without exposing upstream or request data.
// Called by: planning and branch-lookup API routes
import { isQlooError } from "@/lib/qloo/client";

export function qlooErrorResponse(error: unknown): Response {
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
