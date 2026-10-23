// Exercises the real planning loop with scripted AI SDK models and mocked Qloo lookups.
// Called by: npm test; no external services or credentials are used
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { expandPlanRequest, runPlan } from "@/lib/agent/plan-agent";
import { hasDeepSeekKey, isAgentDisabled } from "@/lib/env";
import { createQlooError } from "@/lib/qloo/client";
import { resolveLocality } from "@/lib/qloo/insights";
import { searchBrands } from "@/lib/qloo/search";
import { searchPlaceCategories } from "@/lib/qloo/tags";
import { PlanResponseSchema } from "@/lib/types";
import { FAKE_BRAND, FAKE_BRAND_ID, FAKE_CATEGORY_ID, FAKE_PLAN_REQUEST, FAKE_TAG } from "../fixtures/fake-plan";

vi.mock("@/lib/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/env")>();
  return { ...original, hasDeepSeekKey: vi.fn(), isAgentDisabled: vi.fn() };
});
vi.mock("@/lib/qloo/search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/qloo/search")>();
  return { ...original, searchBrands: vi.fn() };
});
vi.mock("@/lib/qloo/tags", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/qloo/tags")>();
  return { ...original, searchPlaceCategories: vi.fn() };
});
vi.mock("@/lib/qloo/insights", () => ({ resolveLocality: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(async () => null), setJson: vi.fn() }));

const CAFE_ID = "urn:tag:category:place:cafe";
const EVIDENCE = [{ brandEntityId: FAKE_BRAND_ID, brandTagId: FAKE_TAG.id, reason: "Coffee tags support local cafes." }];
const VALID_CATEGORIES = [{ tagId: FAKE_CATEGORY_ID, evidence: EVIDENCE }, { tagId: CAFE_ID, evidence: EVIDENCE }];
const INVALID_CATEGORY = { tagId: "urn:tag:category:place:fake_school", evidence: EVIDENCE };

function toolReply(toolName: string, input: unknown, toolCallId = toolName) {
  return {
    content: [{ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: "tool_calls" }, warnings: [],
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
  };
}

function planModel(categories = [...VALID_CATEGORIES, INVALID_CATEGORY]): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: [
    toolReply("resolveBrands", { names: [FAKE_BRAND.name] }),
    toolReply("searchCategories", { query: "coffee" }),
    toolReply("submitPlan", { brandChoices: [], categories }),
  ] });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasDeepSeekKey).mockReturnValue(false);
  vi.mocked(isAgentDisabled).mockReturnValue(false);
  vi.mocked(searchBrands).mockResolvedValue([FAKE_BRAND]);
  vi.mocked(searchPlaceCategories).mockResolvedValue([{ tagId: FAKE_CATEGORY_ID, label: "Coffee shop" }, { tagId: CAFE_ID, label: "Cafe" }]);
  vi.mocked(resolveLocality).mockResolvedValue(null);
});

describe("guarded planning agent", () => {
  it("keeps two valid categories, reports guard drops, and honors a keyless mock override", async () => {
    const model = planModel();
    const emit = vi.fn();
    const result = await runPlan(FAKE_PLAN_REQUEST, { model, emit });
    expect(result.mode).toBe("agent");
    expect(result.categories.map((category) => category.tagId)).toEqual([FAKE_CATEGORY_ID, CAFE_ID]);
    expect(result.trace.some((event) => event.type === "guard")).toBe(true);
    expect(result.trace).toEqual(emit.mock.calls.map(([event]) => event));
    expect(PlanResponseSchema.safeParse(result).success).toBe(true);
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(model.doGenerateCalls[0].providerOptions).toEqual({ deepseek: { thinking: { type: "disabled" } } });
  });

  it("allows one correction after a partial plan", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [
      toolReply("resolveBrands", { names: [FAKE_BRAND.name] }), toolReply("searchCategories", { query: "coffee" }),
      toolReply("submitPlan", { categories: [VALID_CATEGORIES[0], INVALID_CATEGORY] }, "first"),
      toolReply("submitPlan", { categories: VALID_CATEGORIES }, "correction"),
    ] });
    const result = await runPlan(FAKE_PLAN_REQUEST, { model });
    expect(result.mode).toBe("agent");
    expect(result.categories).toHaveLength(2);
    expect(model.doGenerateCalls).toHaveLength(4);
  });

  it("backfills a partial plan after the final correction and preserves valid agent work", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [
      toolReply("resolveBrands", { names: [FAKE_BRAND.name] }), toolReply("searchCategories", { query: "coffee" }),
      toolReply("submitPlan", { categories: [VALID_CATEGORIES[0], INVALID_CATEGORY] }, "first"),
      toolReply("submitPlan", { categories: [VALID_CATEGORIES[0]] }, "correction"),
    ] });
    const result = await runPlan(FAKE_PLAN_REQUEST, { model });
    expect(result.mode).toBe("fallback");
    expect(result.categories.find((category) => category.tagId === FAKE_CATEGORY_ID)?.source).toBe("agent");
    expect(result.categories.find((category) => category.tagId === CAFE_ID)?.source).toBe("fallback");
    expect(result.warnings.join(" ")).toContain("Too few valid categories");
    expect(model.doGenerateCalls).toHaveLength(4);
  });

  it("falls back to rule evidence after a model exception and hides private error text", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("private model failure"); } });
    const result = await runPlan(FAKE_PLAN_REQUEST, { model });
    expect(result.mode).toBe("fallback");
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.categories.every((category) => category.evidence.every((evidence) => evidence.reason.startsWith("Rule:")))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private model failure");
    expect(result.trace.some((event) => event.type === "fallback")).toBe(true);
  });

  it("forces fallback when agent mode is disabled even with a model override", async () => {
    vi.mocked(isAgentDisabled).mockReturnValue(true);
    const model = planModel();
    const result = await runPlan(FAKE_PLAN_REQUEST, { model });
    expect(result.mode).toBe("fallback");
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("resolves requested brands the model omitted", async () => {
    const second = { ...FAKE_BRAND, name: "Fake Second Coffee", entityId: "00000000-0000-4000-8000-000000000009" };
    vi.mocked(searchBrands).mockImplementation(async (name) => name === second.name ? [second] : [FAKE_BRAND]);
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, brandNames: [FAKE_BRAND.name, second.name] }, { model: planModel() });
    expect(result.brands.map((brand) => brand.name)).toEqual([FAKE_BRAND.name, second.name]);
    expect(result.unresolved).toEqual([]);
  });

  it.each(["auth", "quota", "config"] as const)("propagates fatal Qloo %s errors captured during tool execution", async (code) => {
    const error = createQlooError(code, null, "Qloo unavailable");
    vi.mocked(searchBrands).mockRejectedValue(error);
    await expect(runPlan(FAKE_PLAN_REQUEST, { model: planModel() })).rejects.toBe(error);
  });
});

describe("locations and presets", () => {
  it("uses preset branches and brands while retaining user choices/preferences", () => {
    const request = { ...FAKE_PLAN_REQUEST, presetId: "denver-demo", preferences: { removed: [CAFE_ID], added: [] }, brandOverrides: { REI: FAKE_BRAND_ID } };
    const expanded = expandPlanRequest(request);
    expect(expanded.branches).toHaveLength(3);
    expect(expanded.branches.every((branch) => branch.locationSource === "preset")).toBe(true);
    expect(expanded.brandNames).toContain("REI");
    expect(expanded.preferences).toEqual(request.preferences);
    expect(expanded.brandOverrides).toEqual(request.brandOverrides);
  });

  it("resolves typed addresses approximately and warns about the location", async () => {
    vi.mocked(resolveLocality).mockResolvedValue({ name: "Fake District", lat: 39.75, lon: -104.99 });
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, branches: [{ ...FAKE_PLAN_REQUEST.branches[0], lat: undefined, lon: undefined }] });
    expect(result.branches[0].locationSource).toBe("qloo_locality");
    expect(result.warnings.join(" ")).toContain("approximate");
    expect(resolveLocality).toHaveBeenCalledWith(FAKE_PLAN_REQUEST.branches[0].address, expect.any(Object));
  });

  it("stops with no categories when every branch is unresolved", async () => {
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, branches: [{ id: "missing", name: "Fake Missing", address: "", radiusMeters: 6000 }] });
    expect(result.branches).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(searchBrands).not.toHaveBeenCalled();
    expect(result.warnings.join(" ")).toContain("No branch locations");
  });

  it("returns an honest empty plan when Qloo cannot resolve any brands", async () => {
    vi.mocked(searchBrands).mockResolvedValue([]);
    const result = await runPlan(FAKE_PLAN_REQUEST);
    expect(result.categories).toEqual([]);
    expect(result.unresolved).toEqual(FAKE_PLAN_REQUEST.brandNames);
    expect(result.warnings).toContain("None of these brands were found on Qloo");
  });
});
