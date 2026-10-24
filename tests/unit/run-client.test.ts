// Verifies chunked UTF-8 research streams, terminal ordering, and safe transport failures.
// Called by: npm test with mocked fetch and in-memory streams
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRunRequestError, streamRun } from "@/lib/run-client";
import type { TraceEvent } from "@/lib/types";
import { FAKE_RUN_REQUEST, FAKE_RUN_RESULT } from "../fixtures/fake-plan";

const fetchMock = vi.fn<typeof fetch>();
const RESULT: TraceEvent = { type: "result", at: 2, result: FAKE_RUN_RESULT };
const DONE: TraceEvent = { type: "done", at: 3 };

function responseFromChunks(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }));
}

function eventResponse(events: TraceEvent[], separator = "\n"): Response {
  return responseFromChunks([new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join(separator))]);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("research stream decoding", () => {
  it("buffers JSON and multibyte UTF-8 across arbitrary byte boundaries", async () => {
    const note: TraceEvent = { type: "agent_note", at: 1, text: "Fake Café · 咖啡" };
    const bytes = new TextEncoder().encode([note, RESULT, DONE].map((event) => JSON.stringify(event)).join("\n"));
    fetchMock.mockResolvedValueOnce(responseFromChunks(Array.from(bytes, (byte) => Uint8Array.of(byte))));
    const events: TraceEvent[] = [];
    await streamRun(FAKE_RUN_REQUEST, (event) => events.push(event));
    expect(events).toEqual([note, RESULT, DONE]);
  });

  it("accepts CRLF and a final done line without a newline", async () => {
    fetchMock.mockResolvedValueOnce(eventResponse([RESULT, DONE], "\r\n"));
    const onEvent = vi.fn();
    await streamRun(FAKE_RUN_REQUEST, onEvent);
    expect(onEvent.mock.calls.map(([event]) => event)).toEqual([RESULT, DONE]);
  });

  it("warns with static text and skips malformed or schema-invalid lines", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const text = `not-json-private\n${JSON.stringify({ type: "unknown", private: "details" })}\n\n${JSON.stringify(RESULT)}\n${JSON.stringify(DONE)}\n`;
    fetchMock.mockResolvedValueOnce(responseFromChunks([new TextEncoder().encode(text)]));
    const onEvent = vi.fn();
    await streamRun(FAKE_RUN_REQUEST, onEvent);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls).toEqual([["Ignored an invalid research progress event."], ["Ignored an invalid research progress event."]]);
  });

  it.each<TraceEvent>([{ type: "error", at: 1, code: "quota", message: "Paused" }, { type: "limited", at: 1, message: "Daily limit" }])("delivers $type followed by done without treating it as a transport failure", async (terminal) => {
    fetchMock.mockResolvedValueOnce(eventResponse([terminal, DONE]));
    const onEvent = vi.fn();
    await expect(streamRun(FAKE_RUN_REQUEST, onEvent)).resolves.toBeUndefined();
    expect(onEvent.mock.calls.map(([event]) => event)).toEqual([terminal, DONE]);
  });

  it("rejects truncation even after receiving a result", async () => {
    fetchMock.mockResolvedValueOnce(eventResponse([RESULT]));
    await expect(streamRun(FAKE_RUN_REQUEST, () => undefined)).rejects.toThrow("before a complete result");
    fetchMock.mockResolvedValueOnce(eventResponse([{ type: "agent_note", at: 0, text: "Working" }]));
    await expect(streamRun(FAKE_RUN_REQUEST, () => undefined)).rejects.toThrow("before a complete result");
  });

  it.each([{ events: [DONE] }, { events: [RESULT, RESULT, DONE] }, { events: [RESULT, DONE, DONE] }])("rejects invalid terminal ordering", async ({ events }) => {
    fetchMock.mockResolvedValueOnce(eventResponse(events));
    await expect(streamRun(FAKE_RUN_REQUEST, () => undefined)).rejects.toThrow("interrupted");
  });
});

describe("research request failures", () => {
  it("sends only the JSON content type header", async () => {
    fetchMock.mockResolvedValueOnce(eventResponse([RESULT, DONE]));
    await streamRun(FAKE_RUN_REQUEST, () => undefined);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/run");
    expect(options?.headers).toEqual({ "content-type": "application/json" });
  });

  it("handles HTTP validation errors safely before reading a stream", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "bad_request", issues: [] }, { status: 400 }));
    await expect(streamRun(FAKE_RUN_REQUEST, () => undefined)).rejects.toThrow("profile and confirmed categories");
    fetchMock.mockResolvedValueOnce(Response.json({ error: "config", message: "Research is unavailable." }, { status: 503 }));
    await expect(streamRun(FAKE_RUN_REQUEST, () => undefined)).rejects.toThrow("Research is unavailable.");
  });

  it("rejects a missing body and sanitizes reader failures", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null));
    await expect(streamRun(FAKE_RUN_REQUEST, () => undefined)).rejects.toThrow("no progress stream");
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { controller.error(new Error("private reader detail")); } })));
    await expect(streamRun(FAKE_RUN_REQUEST, () => undefined)).rejects.toThrow("Research stream was interrupted");
  });

  it("sanitizes fetch errors and validates input before fetching", async () => {
    fetchMock.mockRejectedValueOnce(new Error("private network detail"));
    await expect(streamRun(FAKE_RUN_REQUEST, () => undefined)).rejects.toThrow("Could not reach Perk Desk");
    fetchMock.mockClear();
    await expect(streamRun({ ...FAKE_RUN_REQUEST, categories: [] }, () => undefined)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { status: 503, code: "config" }, { status: 400, code: "bad_request" }, { status: 429, code: "quota" },
  ])("preserves HTTP $status and maps its code before a body-supplied code", async ({ status, code }) => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "internal", message: "Please try this research later." }, { status }));
    let caught: unknown;
    try { await streamRun(FAKE_RUN_REQUEST, () => undefined); }
    catch (error) { caught = error; }
    expect(isRunRequestError(caught)).toBe(true);
    expect(caught).toMatchObject({ status, code, message: "Please try this research later." });
  });

  it("keeps status and a safe fallback when the HTTP error body is unreadable", async () => {
    fetchMock.mockResolvedValueOnce(new Response("private HTML service detail", { status: 503 }));
    let caught: unknown;
    try { await streamRun(FAKE_RUN_REQUEST, () => undefined); }
    catch (error) { caught = error; }
    expect(isRunRequestError(caught)).toBe(true);
    expect(caught).toMatchObject({ status: 503, code: "config" });
    expect(String(caught)).not.toContain("private HTML service detail");
  });

  it("does not mistake untyped transport errors or plain objects for HTTP errors", () => {
    expect(isRunRequestError(new Error("Fake transport error"))).toBe(false);
    expect(isRunRequestError({ status: 503, code: "config", message: "Fake response" })).toBe(false);
  });
});
