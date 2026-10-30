// Verifies budget exhaustion preserves gathered merchants while preventing more live research.
// Called by: npm test; all provider calls are mocked
import { beforeEach, expect, it, vi } from "vitest";
import { runResearch } from "@/lib/agent/run-agent";
import { checkPitch } from "@/lib/agent/guards";
import { writePitches } from "@/lib/agent/pitch-writer";
import { createQlooError } from "@/lib/qloo/client";
import { findPlaces } from "@/lib/qloo/insights";
import { searchBrandExact } from "@/lib/qloo/search";
import { RunResultSchema, type TraceEvent } from "@/lib/types";
import { FAKE_RUN_REQUEST } from "../fixtures/fake-plan";
import { makeFakePlace } from "../fixtures/fake-places";

vi.mock("@/lib/env", () => ({ hasDeepSeekKey: () => false, isAgentDisabled: () => true }));
vi.mock("@/lib/qloo/insights", () => ({ findPlaces: vi.fn() }));
vi.mock("@/lib/qloo/search", () => ({ searchBrandExact: vi.fn() }));
vi.mock("@/lib/agent/pitch-writer", () => ({ writePitches: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(async () => null), setJson: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });

it("returns gathered merchants and disables caching after the Qloo budget is reached", async () => {
  const places = Array.from({ length: 4 }, (_, index) => makeFakePlace(index + 1, { affinity: 0.1 }));
  vi.mocked(findPlaces).mockResolvedValueOnce(places)
    .mockRejectedValue(createQlooError("budget", null, "Stopped early to stay within the research budget"));
  const events: TraceEvent[] = [];
  const onCacheable = vi.fn();
  const result = await runResearch(FAKE_RUN_REQUEST, (event) => events.push(event), { onCacheable });
  expect(RunResultSchema.safeParse(result).success).toBe(true);
  expect(result.merchants).toHaveLength(places.length);
  expect(result.merchants.map((merchant) => merchant.place.entityId).sort()).toEqual(places.map((place) => place.entityId).sort());
  expect(result.merchants.every((merchant) => merchant.pitchSource === "template" && checkPitch(merchant.pitch, merchant, FAKE_RUN_REQUEST.institutionName))).toBe(true);
  expect(result.categories[0].status).toBe("incomplete");
  expect(events).toContainEqual(expect.objectContaining({
    type: "agent_note", text: "Stopped early to stay within the research budget",
  }));
  expect(onCacheable).toHaveBeenCalledExactlyOnceWith(false);
  expect(findPlaces).toHaveBeenCalledTimes(2);
  expect(searchBrandExact).not.toHaveBeenCalled();
  expect(writePitches).not.toHaveBeenCalled();
});
