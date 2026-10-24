// Verifies merchant tool calls, replacement guards, failure isolation, and run-wide duplicate counts.
// Called by: npm test
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRunContext } from "@/lib/agent/context";
import { buildFindMerchantsTool, findMerchantsForCategory } from "@/lib/agent/tools/find-merchants";
import { DENSITY_TTL_S } from "@/lib/config";
import { createQlooError } from "@/lib/qloo/client";
import { findPlaces } from "@/lib/qloo/insights";
import { setJson } from "@/lib/store/cache";
import { FAKE_RUN_REQUEST } from "../fixtures/fake-plan";
import { FAKE_BRANCHES, FAKE_CATEGORIES, makeFakePlace } from "../fixtures/fake-places";

vi.mock("@/lib/qloo/insights", () => ({ findPlaces: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ setJson: vi.fn() }));
const COFFEE = FAKE_CATEGORIES[0].tagId;
const BAKERY = FAKE_CATEGORIES[1].tagId;
const CAFE = "urn:tag:category:place:cafe";
const OPTIONS = { toolCallId: "fake-tool-call", messages: [], context: {} };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findPlaces).mockReset().mockResolvedValue([]);
  vi.mocked(setJson).mockReset().mockResolvedValue(undefined);
});

describe("merchant research", () => {
  it("makes seeded and baseline calls for every branch, keeps nearest matches, and writes density", async () => {
    const context = createRunContext({ ...FAKE_RUN_REQUEST, branches: FAKE_BRANCHES.slice(0, 2) });
    vi.mocked(findPlaces).mockImplementation(async (query, options) => {
      options?.onCall?.({ endpoint: "/v2/insights", summary: "Fake places", ms: 1, cached: false });
      return [makeFakePlace(10, { affinity: 0.1, explain: [{ entityId: context.request.brands[0].entityId, score: 1 }] })];
    });
    expect(await findMerchantsForCategory({ tagId: COFFEE }, context)).toMatchObject({ independentCount: 1, thin: true });
    expect(findPlaces).toHaveBeenCalledTimes(4);
    expect(vi.mocked(findPlaces).mock.calls.map(([query]) => query.brandIds.length)).toEqual([1, 0, 1, 0]);
    expect(context.qlooCalls).toBe(4);
    const candidates = context.results.get(COFFEE)!.candidates;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].branchId).toBe(FAKE_BRANCHES[0].id);
    expect(candidates[0].brandShares).toEqual([{ brandName: context.request.brands[0].name, sharePercent: 100 }]);
    expect(setJson).toHaveBeenCalledWith(`pd:v1:density:denver-co:${COFFEE}`, { count: 1, complete: true }, DENSITY_TTL_S, expect.any(AbortSignal));
    await findMerchantsForCategory({ tagId: COFFEE }, context);
    expect(findPlaces).toHaveBeenCalledTimes(4);
  });

  it("retains baseline success after a seeded call fails", async () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    vi.mocked(findPlaces).mockRejectedValueOnce(createQlooError("network", null, "private upstream detail"))
      .mockResolvedValueOnce([makeFakePlace(10)]);
    expect(await findMerchantsForCategory({ tagId: COFFEE }, context)).toMatchObject({ independentCount: 1 });
    expect(context.results.get(COFFEE)!.candidates[0].tasteSignal).toBe(false);
    expect(context.warnings).toHaveLength(1);
    expect(context.warnings.join()).not.toContain("private upstream detail");
  });

  it("retains seeded success after a baseline call fails", async () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    vi.mocked(findPlaces).mockResolvedValueOnce([makeFakePlace(10)]).mockRejectedValueOnce(new Error("failed"));
    expect(await findMerchantsForCategory({ tagId: COFFEE }, context)).toMatchObject({ independentCount: 1 });
    expect(context.results.get(COFFEE)!.candidates[0]).toMatchObject({ tasteSignal: true, baselineRank: null, rankLift: null, score: 0.32 });
    expect(context.results.get(COFFEE)!.complete).toBe(false);
    expect(setJson).not.toHaveBeenCalled();
    expect(context.knownDensities.size).toBe(0);
    expect(await findMerchantsForCategory({ tagId: CAFE, replacesTagId: COFFEE }, context)).toHaveProperty("error");
  });

  it("refreshes previous category duplicate flags and densities across the entire run", async () => {
    const context = createRunContext({ ...FAKE_RUN_REQUEST, categories: FAKE_CATEGORIES });
    vi.mocked(findPlaces).mockImplementation(async (query) => [makeFakePlace(query.tagId === COFFEE ? 10 : 11, { name: "Fake Shared Shop" })]);
    await findMerchantsForCategory({ tagId: COFFEE }, context);
    expect(context.results.get(COFFEE)!.independentCount).toBe(1);
    await findMerchantsForCategory({ tagId: BAKERY }, context);
    for (const tagId of [COFFEE, BAKERY]) {
      expect(context.results.get(tagId)!.independentCount).toBe(0);
      expect(context.results.get(tagId)!.candidates[0].multiLocation).toBe(true);
      expect(context.knownDensities.get(tagId)).toBe(0);
      expect(setJson).toHaveBeenCalledWith(`pd:v1:density:denver-co:${tagId}`, { count: 0, complete: true }, DENSITY_TTL_S, expect.any(AbortSignal));
    }
  });

  it("counts only the first exclusion reason and normalizes scores before exclusions", async () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    vi.mocked(findPlaces).mockResolvedValue([
      makeFakePlace(10, { affinity: 0.1 }), makeFakePlace(11, { name: "Starbucks", isClosed: true, affinity: 0.2 }),
    ]);
    await findMerchantsForCategory({ tagId: COFFEE }, context);
    expect(context.excludedCounts).toEqual({ closed: 1, nationalChain: 0, noiseGenre: 0, signedOrExcluded: 0 });
    expect(context.results.get(COFFEE)!.candidates[0].score).toBeLessThan(0.6);
  });
});

describe("replacement guard", () => {
  it("allows one replacement of a thin original and reuses completed outcomes", async () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    context.candidateCategories.set(BAKERY, "Bakery");
    context.candidateCategories.set(CAFE, "Cafe");
    await findMerchantsForCategory({ tagId: COFFEE }, context);
    expect(await findMerchantsForCategory({ tagId: BAKERY, replacesTagId: COFFEE }, context)).toMatchObject({ tagId: BAKERY });
    expect(context.replacements.get(COFFEE)).toBe(BAKERY);
    await findMerchantsForCategory({ tagId: BAKERY, replacesTagId: COFFEE }, context);
    expect(await findMerchantsForCategory({ tagId: CAFE, replacesTagId: COFFEE }, context)).toHaveProperty("error");
    expect(await findMerchantsForCategory({ tagId: CAFE, replacesTagId: BAKERY }, context)).toHaveProperty("error");
    expect(findPlaces).toHaveBeenCalledTimes(4);
  });

  it("rejects unconfirmed originals, unknown candidates, malformed IDs, and blacklisted categories", async () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    const school = "urn:tag:category:place:fake_school";
    context.candidateCategories.set(school, "Fake school");
    context.candidateCategories.set(BAKERY, "Bakery");
    for (const input of [{ tagId: "bad" }, { tagId: CAFE }, { tagId: school }, { tagId: BAKERY }, { tagId: BAKERY, replacesTagId: CAFE }]) {
      expect(await findMerchantsForCategory(input, context)).toHaveProperty("error");
    }
    expect(findPlaces).not.toHaveBeenCalled();
  });

  it("rejects replacement when the original already has six independent shops", async () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    context.candidateCategories.set(BAKERY, "Bakery");
    vi.mocked(findPlaces).mockResolvedValue(Array.from({ length: 6 }, (_, index) => makeFakePlace(index + 10)));
    await findMerchantsForCategory({ tagId: COFFEE }, context);
    expect(await findMerchantsForCategory({ tagId: BAKERY, replacesTagId: COFFEE }, context)).toHaveProperty("error");
    expect(findPlaces).toHaveBeenCalledTimes(2);
  });

  it("reserves a replacement before awaiting and prevents concurrent duplicate work", async () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    context.candidateCategories.set(BAKERY, "Bakery");
    context.candidateCategories.set(CAFE, "Cafe");
    await findMerchantsForCategory({ tagId: COFFEE }, context);
    const first = findMerchantsForCategory({ tagId: BAKERY, replacesTagId: COFFEE }, context);
    expect(context.replacements.get(COFFEE)).toBe(BAKERY);
    expect(await findMerchantsForCategory({ tagId: CAFE, replacesTagId: COFFEE }, context)).toHaveProperty("error");
    expect(await findMerchantsForCategory({ tagId: BAKERY, replacesTagId: COFFEE }, context)).toHaveProperty("error");
    await first;
    expect(context.pendingCategories.size).toBe(0);
    expect(findPlaces).toHaveBeenCalledTimes(4);
  });
});

describe("tool boundary", () => {
  it("emits safe tool start and result traces", async () => {
    const emit = vi.fn();
    const context = createRunContext(FAKE_RUN_REQUEST, emit);
    await buildFindMerchantsTool(context).execute!({ tagId: COFFEE }, OPTIONS);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "tool_call", tool: "findMerchants" }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "tool_result", tool: "findMerchants" }));
  });

  it.each(["config", "auth", "quota"] as const)("propagates fatal %s errors and flags the context", async (code) => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    const error = createQlooError(code, null, "Safe service error");
    vi.mocked(findPlaces).mockRejectedValue(error);
    await expect(buildFindMerchantsTool(context).execute!({ tagId: COFFEE }, OPTIONS)).rejects.toBe(error);
    expect(context.fatalError).toBe(error);
    expect(context.pendingCategories.size).toBe(0);
    expect(findPlaces).toHaveBeenCalledTimes(1);
  });

  it("returns a safe error to the model for unexpected failures", async () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    vi.mocked(setJson).mockRejectedValueOnce(new Error("private internal detail"));
    const result = await buildFindMerchantsTool(context).execute!({ tagId: COFFEE }, OPTIONS);
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("private internal detail");
  });
});
