// Verifies that cached pitches obey the current controlled grammar without live research.
// Called by: npm test; cache, limits, research, and key availability are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/run/route";
import { checkPitch } from "@/lib/agent/guards";
import { runResearch } from "@/lib/agent/run-agent";
import { PITCH_MAX_CHARACTERS } from "@/lib/config";
import { hasQlooKey } from "@/lib/env";
import { buildTemplatePitch } from "@/lib/fallback/pitch-template";
import { getJson, setJson } from "@/lib/store/cache";
import { checkLimit } from "@/lib/store/rate-limit";
import { TraceEventSchema, type MerchantResult, type TraceEvent } from "@/lib/types";
import { FAKE_MERCHANT, FAKE_RUN_REQUEST, FAKE_RUN_RESULT } from "../fixtures/fake-plan";

vi.mock("@/lib/agent/run-agent", () => ({ runResearch: vi.fn() }));
vi.mock("@/lib/env", () => ({ hasQlooKey: vi.fn(() => false) }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(), setJson: vi.fn() }));
vi.mock("@/lib/store/rate-limit", () => ({ checkLimit: vi.fn(), getClientIp: () => "fake-ip" }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkLimit).mockResolvedValue({ ok: false, reason: "global" });
});

async function cachedMerchant(card: MerchantResult): Promise<MerchantResult> {
  const events: TraceEvent[] = [{ type: "result", at: 0, result: { ...FAKE_RUN_RESULT, merchants: [card] } }];
  const originalEvents = structuredClone(events);
  vi.mocked(getJson).mockResolvedValue({ complete: true, events });
  const request = new Request("http://localhost/api/run", { method: "POST", body: JSON.stringify(FAKE_RUN_REQUEST) });
  const response = await POST(request);
  const trace = (await response.text()).trim().split("\n").map((line) => TraceEventSchema.parse(JSON.parse(line)));
  expect(response.status).toBe(200);
  expect(trace.map((event) => event.type)).toEqual(["agent_note", "result", "done"]);
  expect(hasQlooKey).not.toHaveBeenCalled();
  expect(checkLimit).not.toHaveBeenCalled();
  expect(runResearch).not.toHaveBeenCalled();
  expect(setJson).not.toHaveBeenCalled();
  expect(events).toEqual(originalEvents);
  const result = trace.find((event) => event.type === "result");
  if (!result || result.type !== "result") throw new Error("Expected a cached result");
  return result.result.merchants[0];
}

describe("controlled pitch cache replay", () => {
  it.each([
    "offers a 10% member discount", "lets members save up to 10%", "offers a discount worth 10%",
    "and our credit union are confirmed partners", "has agreed to be partners", "matches the tastes of your members",
  ])("replaces legacy claim '%s' even with no key and an exhausted limit", async (claim) => {
    const card = { ...FAKE_MERCHANT, tasteSignal: false, pitch: `${FAKE_MERCHANT.place.name} ${claim}.`, pitchSource: "agent" as const };
    const replayed = await cachedMerchant(card);
    expect(replayed).toEqual({ ...card, pitch: buildTemplatePitch(card, FAKE_RUN_REQUEST.institutionName), pitchSource: "template" });
    expect(checkPitch(replayed.pitch, replayed, FAKE_RUN_REQUEST.institutionName)).toBe(true);
    expect(replayed.pitch).not.toContain(claim);
  });

  it.each(["agent", "template"] as const)("preserves a valid controlled %s pitch and its source", async (pitchSource) => {
    const card = { ...FAKE_MERCHANT, pitch: buildTemplatePitch(FAKE_MERCHANT, FAKE_RUN_REQUEST.institutionName), pitchSource };
    expect(await cachedMerchant(card)).toEqual(card);
  });

  it("rechecks labels against the current request instead of trusting a stored institution name", async () => {
    const card = { ...FAKE_MERCHANT, pitch: buildTemplatePitch(FAKE_MERCHANT, "Fake Previous CU"), pitchSource: "agent" as const };
    const replayed = await cachedMerchant(card);
    expect(replayed.pitch).toBe(buildTemplatePitch(card, FAKE_RUN_REQUEST.institutionName));
    expect(replayed.pitch).not.toContain("Fake Previous CU");
    expect(replayed.pitchSource).toBe("template");
  });

  it("keeps a merchant with an impossible long name while leaving its unsafe pitch empty", async () => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place, name: "Fake ".repeat(PITCH_MAX_CHARACTERS) },
      pitch: "Unverified text", pitchSource: "agent" as const };
    const replayed = await cachedMerchant(card);
    expect(replayed).toEqual({ ...card, pitch: "", pitchSource: "template" });
  });
});
