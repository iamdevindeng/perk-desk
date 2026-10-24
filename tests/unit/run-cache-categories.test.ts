// Verifies cached shortlists obey category sanity checks without changing cache identities.
// Called by: npm test with fictional cached places and mocked research, cache, and limits
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/run/route";
import { runResearch } from "@/lib/agent/run-agent";
import { RESULT_TTL_S } from "@/lib/config";
import { cacheKey } from "@/lib/hash";
import { getJson, setJson } from "@/lib/store/cache";
import { checkLimit } from "@/lib/store/rate-limit";
import { TraceEventSchema, type CategoryTag, type Place, type RunResult, type TraceEvent } from "@/lib/types";
import { FAKE_RUN_REQUEST, FAKE_RUN_RESULT } from "../fixtures/fake-plan";

vi.mock("@/lib/env", () => ({ hasQlooKey: () => true }));
vi.mock("@/lib/agent/run-agent", () => ({ runResearch: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(), setJson: vi.fn() }));
vi.mock("@/lib/store/rate-limit", () => ({ checkLimit: vi.fn(), getClientIp: () => "fake-ip" }));

const COFFEE = { tagId: "urn:tag:category:place:coffee_shop", label: "Coffee shop" };
const GYM = { tagId: "urn:tag:category:place:gym", label: "Gym" };

function cachedResult(category: CategoryTag, name: string, primaryGenreId?: string): RunResult {
  const merchant = FAKE_RUN_RESULT.merchants[0];
  const place: Place = { ...merchant.place, name, primaryGenreId };
  return { ...FAKE_RUN_RESULT, merchants: [{ ...merchant, categoryTagId: category.tagId, categoryLabel: category.label, place }],
    categories: [{ ...FAKE_RUN_RESULT.categories[0], tagId: category.tagId, label: category.label }],
  };
}

async function run(category: CategoryTag): Promise<TraceEvent[]> {
  const request = new Request("http://localhost/api/run", {
    method: "POST", body: JSON.stringify({ ...FAKE_RUN_REQUEST, categories: [category] }),
  });
  return (await (await POST(request)).text()).trim().split("\n").map((line) => TraceEventSchema.parse(JSON.parse(line)));
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.mocked(runResearch).mockReset().mockImplementation(async (_request, _emit, options) => {
    options?.onCacheable?.(true); return FAKE_RUN_RESULT;
  });
  vi.mocked(getJson).mockReset(); vi.mocked(setJson).mockReset().mockResolvedValue(undefined);
  vi.mocked(checkLimit).mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unit tests must not use network"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("cached category checks", () => {
  it.each([
    { category: COFFEE, name: "Fake Corner Cafe", genre: "urn:tag:genre:place:cocktail_bar" },
    { category: COFFEE, name: "Fake Candy Shop", genre: undefined },
    { category: GYM, name: "Fake Fitness Studio", genre: "urn:tag:genre:place:country_club" },
    { category: GYM, name: "Fake University Gym", genre: undefined },
  ])("refreshes a cached category mismatch for $name at the original key", async ({ category, name, genre }) => {
    const result = cachedResult(category, name, genre);
    vi.mocked(getJson).mockResolvedValue({ complete: true, events: [{ type: "result", at: 0, result }] });
    const events = await run(category);
    expect(runResearch).toHaveBeenCalledOnce(); expect(checkLimit).toHaveBeenCalledWith("run", "fake-ip");
    expect(events.map((event) => event.type)).toEqual(["result", "done"]);
    expect(events.find((event) => event.type === "result")?.result).toEqual(FAKE_RUN_RESULT);
    expect(setJson).toHaveBeenCalledWith(cacheKey("run", { ...FAKE_RUN_REQUEST, categories: [category] }),
      { complete: true, events: expect.any(Array) }, RESULT_TTL_S, expect.any(AbortSignal));
  });

  it.each([
    { category: COFFEE, name: "Fake Corner Cafe", genre: "urn:tag:genre:place:coffee_shop" },
    { category: GYM, name: "Fake Fitness Studio", genre: undefined },
  ])("replays a clean cached shortlist for $name without live work", async ({ category, name, genre }) => {
    const result = cachedResult(category, name, genre);
    vi.mocked(getJson).mockResolvedValue({ complete: true, events: [{ type: "result", at: 50, result }] });
    const events = await run(category);
    expect(events.map((event) => event.type)).toEqual(["agent_note", "result", "done"]);
    expect(events.find((event) => event.type === "result")?.result).toEqual(result);
    expect(runResearch).not.toHaveBeenCalled(); expect(checkLimit).not.toHaveBeenCalled(); expect(setJson).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
  });
});
