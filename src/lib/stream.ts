// Emits elapsed-time trace events and guarantees one terminal outcome followed by done.
// Called by: the run route and streaming unit tests
import { isQlooError } from "@/lib/qloo/client";
import { TraceEventSchema, type TraceEvent } from "@/lib/types";

export type Emit = (event: TraceEvent) => void;

export function createEmitter(onEvent: Emit): Emit {
  const startedAt = Date.now();
  return (event) => onEvent({ ...event, at: Date.now() - startedAt });
}

function errorEvent(error: unknown): TraceEvent {
  if (!isQlooError(error)) return { type: "error", at: 0, code: "internal", message: "Something went wrong." };
  if (error.code === "config") return { type: "error", at: 0, code: "config", message: "Server is missing its Qloo key." };
  if (error.code === "auth") return { type: "error", at: 0, code: "auth", message: "Qloo refused our key. Demo presets may still work from cache." };
  if (error.code === "quota") return { type: "error", at: 0, code: "quota", message: "Live research is paused (Qloo quota). Demo presets may still work from cache." };
  return { type: "error", at: 0, code: "upstream", message: "Qloo is having trouble; try again in a minute." };
}

type StreamOptions = { signal?: AbortSignal; onCancel?: () => void };
type StreamWriter = { emit: Emit; finish: () => void; cancel: () => void; stopped: () => boolean };

function streamWriter(controller: ReadableStreamDefaultController<Uint8Array>, options: StreamOptions): StreamWriter {
  let cancelled = false;
  let terminal = false;
  const encoder = new TextEncoder();
  const send = createEmitter((event) => {
    if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
  });
  const emit: Emit = (event) => {
    // Only this helper owns done; callers cannot finish early or emit two results.
    if (cancelled || terminal || event.type === "done") return;
    const parsed = TraceEventSchema.parse(event);
    terminal = ["result", "error", "limited"].includes(parsed.type);
    send(parsed);
  };
  function stop(close: boolean): void {
    if (cancelled) return;
    cancelled = true; options.signal?.removeEventListener("abort", abort);
    if (close) controller.close();
    options.onCancel?.();
  }
  function abort(): void { stop(true); }
  function finish(): void {
    if (cancelled) return;
    if (!terminal) emit(errorEvent(new Error("Missing terminal outcome")));
    send({ type: "done", at: 0 }); controller.close();
    cancelled = true; options.signal?.removeEventListener("abort", abort);
  }
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  return { emit, finish, cancel: () => stop(false), stopped: () => cancelled };
}

export function createNdjsonResponse(work: (emit: Emit) => Promise<void>, options: StreamOptions = {}): Response {
  let cancel: () => void = () => undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writer = streamWriter(controller, options);
      cancel = writer.cancel;
      if (writer.stopped()) return;
      try { await work(writer.emit); }
      catch (error) { writer.emit(errorEvent(error)); }
      finally { writer.finish(); }
    },
    cancel() { cancel(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store",
  } });
}
