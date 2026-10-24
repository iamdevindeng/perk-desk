// Verifies usage counters at real Qloo and model transport boundaries, including retries and caches.
// Called by: npm test; HTTP requests and credentials are fake
import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { agentModel, AGENT_CALL_SETTINGS } from "@/lib/agent/model";
import { cachedQlooCall, qlooGet } from "@/lib/qloo/client";
import { withRunUsage } from "@/lib/store/usage";

const mocks = vi.hoisted(() => ({ values: new Map<string, unknown>() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({
  QLOO_API_KEY: "fake-test-placeholder", QLOO_BASE_URL: "https://hackathon.api.qloo.com",
  DEEPSEEK_API_KEY: "fake-test-placeholder", DEEPSEEK_MODEL: "deepseek-flash",
}) }));
vi.mock("@/lib/store/cache", () => ({
  getJson: async (key: string) => mocks.values.get(key) ?? null,
  setJson: async (key: string, value: unknown) => { mocks.values.set(key, value); },
}));

const fetchMock = vi.fn<typeof fetch>();
const SlimSchema = z.object({ name: z.string() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  mocks.values.clear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function expectCounts(qloo: number, llm: number): void {
  expect(console.info).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(new RegExp(`^\\[usage\\] scope=run ip_hash=[a-f0-9]{12} qloo_calls=${qloo} llm_calls=${llm}$`)),
  );
}

function modelReply(): Response {
  return Response.json({
    object: "chat.completion", choices: [{ message: { role: "assistant", content: "Completed." }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

describe("usage at outbound HTTP boundaries", () => {
  it("counts a Qloo retry twice and excludes validated cache hits", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ name: "Fake Coffee Co" }));
    const work = withRunUsage("192.0.2.1", async () => {
      await cachedQlooCall("/search", {}, (value) => SlimSchema.parse(value), SlimSchema);
      await cachedQlooCall("/search", {}, (value) => SlimSchema.parse(value), SlimSchema);
    });
    await vi.runAllTimersAsync();
    await work;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectCounts(2, 0);
  });

  it("counts a failed Qloo fetch before its sanitized error is thrown", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("private transport message"));
    const work = expect(withRunUsage("192.0.2.1", async () => await qlooGet("/search", {})))
      .rejects.toMatchObject({ code: "network" });
    await vi.runAllTimersAsync();
    await work;
    expectCounts(1, 0);
  });

  it("counts model retries and later model calls independently", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "Unavailable", type: "server_error" } }, { status: 503 }))
      .mockImplementation(async () => modelReply());
    const work = withRunUsage("192.0.2.1", async () => {
      await generateText({ model: agentModel(), prompt: "Research fake merchants.", ...AGENT_CALL_SETTINGS });
      await generateText({ model: agentModel(), prompt: "Write a fake pitch.", ...AGENT_CALL_SETTINGS });
    });
    await vi.runAllTimersAsync();
    await work;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expectCounts(0, 3);
  });

  it("counts a model request that fails without leaking provider details", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "private upstream detail", type: "authentication_error" } }, { status: 401 }));
    const work = expect(withRunUsage("192.0.2.1", async () => {
      await generateText({ model: agentModel(), prompt: "Research fake merchants.", ...AGENT_CALL_SETTINGS });
    })).rejects.toThrow();
    await vi.runAllTimersAsync();
    await work;
    expectCounts(0, 1);
  });
});
