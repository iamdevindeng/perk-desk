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

export function createNdjsonResponse(work: (emit: Emit) => Promise<void>): Response {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let terminal = false;
      const encoder = new TextEncoder();
      const send = createEmitter((event) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      });
      const emit: Emit = (event) => {
        // Only this helper owns done; callers cannot finish early or emit two results.
        if (terminal || event.type === "done") return;
        const parsed = TraceEventSchema.parse(event);
        terminal = ["result", "error", "limited"].includes(parsed.type);
        send(parsed);
      };
      try {
        await work(emit);
        if (!terminal) emit(errorEvent(new Error("Missing terminal outcome")));
      } catch (error) { emit(errorEvent(error)); }
      finally {
        send({ type: "done", at: 0 });
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store",
  } });
}
