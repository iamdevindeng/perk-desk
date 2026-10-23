// Verifies NDJSON framing, terminal ordering, elapsed times, and sanitized errors.
// Called by: npm test
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQlooError, type QlooErrorCode } from "@/lib/qloo/client";
import { createEmitter, createNdjsonResponse } from "@/lib/stream";
import { TraceEventSchema, type TraceEvent } from "@/lib/types";
import { FAKE_RUN_RESULT } from "../fixtures/fake-plan";

async function events(response: Response): Promise<TraceEvent[]> {
  return (await response.text()).trim().split("\n").map((line) => TraceEventSchema.parse(JSON.parse(line)));
}

afterEach(() => { vi.useRealTimers(); });

describe("NDJSON stream", () => {
  it("frames valid events and ends a successful stream with exactly one done", async () => {
    const response = createNdjsonResponse(async (emit) => {
      emit({ type: "step", at: 999, step: "find_merchants", status: "start", summary: "Research" });
      emit({ type: "result", at: 999, result: FAKE_RUN_RESULT });
      emit({ type: "done", at: 999 });
      emit({ type: "result", at: 999, result: FAKE_RUN_RESULT });
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const trace = await events(response);
    expect(trace.map((event) => event.type)).toEqual(["step", "result", "done"]);
    expect(trace.every((event) => event.at >= 0 && event.at < 999)).toBe(true);
  });

  it("turns a thrown exception into a safe error followed by done", async () => {
    const trace = await events(createNdjsonResponse(async () => { throw new Error("private details"); }));
    expect(trace.map((event) => event.type)).toEqual(["error", "done"]);
    expect(trace[0]).toMatchObject({ code: "internal", message: "Something went wrong." });
    expect(JSON.stringify(trace)).not.toContain("private details");
  });

  it("does not emit a second outcome if work fails after result", async () => {
    const trace = await events(createNdjsonResponse(async (emit) => {
      emit({ type: "result", at: 0, result: FAKE_RUN_RESULT });
      throw new Error("late failure");
    }));
    expect(trace.map((event) => event.type)).toEqual(["result", "done"]);
  });

  it("adds an error if work ends without an outcome", async () => {
    const trace = await events(createNdjsonResponse(async (emit) => { emit({ type: "done", at: 0 }); }));
    expect(trace.map((event) => event.type)).toEqual(["error", "done"]);
  });

  it("permits limited as the sole terminal outcome", async () => {
    const trace = await events(createNdjsonResponse(async (emit) => {
      emit({ type: "limited", at: 0, message: "Daily limit reached" });
      emit({ type: "error", at: 0, code: "internal", message: "Late error" });
    }));
    expect(trace.map((event) => event.type)).toEqual(["limited", "done"]);
  });

  it.each<QlooErrorCode>(["config", "auth", "quota", "upstream", "timeout", "network", "bad_request"])("sanitizes %s failures", async (code) => {
    const trace = await events(createNdjsonResponse(async () => { throw createQlooError(code, 500, "private provider text"); }));
    expect(trace[0]).toMatchObject({ code: ["config", "auth", "quota"].includes(code) ? code : "upstream" });
    expect(trace.at(-1)?.type).toBe("done");
    expect(JSON.stringify(trace)).not.toContain("private provider text");
  });

  it("fills elapsed milliseconds rather than trusting caller timestamps", () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const trace: TraceEvent[] = [];
    const emit = createEmitter((event) => trace.push(event));
    vi.setSystemTime(1250); emit({ type: "done", at: 9000 });
    expect(trace).toEqual([{ type: "done", at: 250 }]);
  });

  it("allows a disconnected reader without enqueueing into a closed stream", async () => {
    let finish: () => void = () => undefined;
    const response = createNdjsonResponse(async (emit) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      emit({ type: "result", at: 0, result: FAKE_RUN_RESULT });
    });
    await response.body?.cancel();
    finish();
    await Promise.resolve();
  });
});
