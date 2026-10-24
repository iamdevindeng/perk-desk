// Checks that plan completion preserves deliberate brand choices and removes implicit guesses.
// Called by: npm test with scripted models and mocked Qloo calls; no network is used.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { CATEGORY_EVIDENCE_MAX } from "@/lib/config";
import { runPlan } from "@/lib/agent/plan-agent";
import { hasDeepSeekKey, isAgentDisabled } from "@/lib/env";
import { searchBrands } from "@/lib/qloo/search";
import { searchPlaceCategories } from "@/lib/qloo/tags";
import type { BrandCandidate } from "@/lib/types";
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
vi.mock("@/lib/qloo/insights", () => ({ resolveLocality: vi.fn(async () => null) }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(async () => null), setJson: vi.fn() }));

const CAFE_ID = "urn:tag:category:place:cafe";
const ALIAS_INPUT = "Fake Alias";
const ALIAS_BRAND: BrandCandidate = {
  ...FAKE_BRAND, entityId: "00000000-0000-4000-8000-000000000081", name: "Fake Different Outdoors",
};
type BrandChoice = { inputName: string; entityId: string };

function toolReply(toolName: string, input: unknown, toolCallId = toolName) {
  return {
    content: [{ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: "tool_calls" }, warnings: [],
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
  };
}

function planModel(names: string[], brandChoices: BrandChoice[] = [], evidenceBrands = [FAKE_BRAND], categoryCount = 2): MockLanguageModelV4 {
  const evidence = evidenceBrands.map((brand) => ({
    brandEntityId: brand.entityId, brandTagId: FAKE_TAG.id, reason: "Coffee tags support local cafes.",
  }));
  const categories = [FAKE_CATEGORY_ID, CAFE_ID].slice(0, categoryCount).map((tagId) => ({ tagId, evidence }));
  const replies = [toolReply("resolveBrands", { names }), toolReply("searchCategories", { query: "coffee" }),
    toolReply("submitPlan", { brandChoices, categories })];
  if (categoryCount === 1) replies.push(toolReply("submitPlan", { brandChoices, categories }, "correction"));
  return new MockLanguageModelV4({ doGenerate: replies });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasDeepSeekKey).mockReturnValue(false);
  vi.mocked(isAgentDisabled).mockReturnValue(false);
  vi.mocked(searchBrands).mockImplementation(async (name) => name === ALIAS_INPUT ? [ALIAS_BRAND] : [FAKE_BRAND]);
  vi.mocked(searchPlaceCategories).mockResolvedValue([
    { tagId: FAKE_CATEGORY_ID, label: "Coffee shop" }, { tagId: CAFE_ID, label: "Cafe" },
  ]);
});

describe("brand choices after plan completion", () => {
  it.each([2, 1])("retains an explicit alias choice when another brand supplies all %s submitted categories", async (categoryCount) => {
    const names = [FAKE_BRAND.name, ALIAS_INPUT];
    const choices = [{ inputName: ALIAS_INPUT, entityId: ALIAS_BRAND.entityId }];
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, brandNames: names }, { model: planModel(names, choices, [FAKE_BRAND], categoryCount) });
    expect(result.mode).toBe(categoryCount === 2 ? "agent" : "fallback");
    expect(result.brands.find((brand) => brand.inputName === ALIAS_INPUT)).toMatchObject({ entityId: ALIAS_BRAND.entityId, matchKind: "agent" });
    expect(result.unresolved).toEqual([]);
  });

  it.each([
    { inputName: "Fake Coffee", firstName: "Fake Coffee Co", secondName: "The Fake Coffee Company", matchKind: "exact" },
    { inputName: "Fake Coffee", firstName: "Fake Coffee Roasters", secondName: "Fake Coffee Cafe", matchKind: "prefix" },
  ])("keeps the original $matchKind choice and its successful agent evidence", async ({ inputName, firstName, secondName, matchKind }) => {
    const first = { ...FAKE_BRAND, name: firstName, popularity: 0.1 };
    const second = { ...ALIAS_BRAND, name: secondName, popularity: 1 };
    vi.mocked(searchBrands).mockResolvedValue([first, second]);
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, brandNames: [inputName] }, { model: planModel([inputName]) });
    expect(result.mode).toBe("agent");
    expect(result.brands).toMatchObject([{ entityId: FAKE_BRAND_ID, name: firstName, matchKind }]);
    expect(result.categories).toHaveLength(2);
    expect(result.categories.every((category) => category.source === "agent" && category.evidence.every((item) =>
      "brandEntityId" in item && item.brandEntityId === FAKE_BRAND_ID))).toBe(true);
  });

  it("preserves explicit choices whose evidence falls beyond the category cap", async () => {
    const candidates = Array.from({ length: CATEGORY_EVIDENCE_MAX + 1 }, (_, index) => ({
      ...FAKE_BRAND, name: `Fake Candidate ${index}`, entityId: `00000000-0000-4000-8000-0000000000${81 + index}`,
    }));
    const names = candidates.map((_, index) => `Fake Alias ${index}`);
    vi.mocked(searchBrands).mockImplementation(async (name) => [candidates[names.indexOf(name)]]);
    const choices = names.map((inputName, index) => ({ inputName, entityId: candidates[index].entityId }));
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, brandNames: names }, { model: planModel(names, choices, candidates) });
    expect(result.mode).toBe("agent");
    expect(result.brands.map((brand) => brand.entityId)).toEqual(candidates.map((brand) => brand.entityId));
    expect(result.unresolved).toEqual([]);
    expect(result.categories.every((category) => category.evidence.length === CATEGORY_EVIDENCE_MAX)).toBe(true);
    expect(result.categories.every((category) => category.evidence.every((item) =>
      "brandEntityId" in item && item.brandEntityId !== candidates.at(-1)?.entityId))).toBe(true);
  });

  it("removes an implicit unrelated choice while keeping the other brand and its valid agent plan", async () => {
    const names = [FAKE_BRAND.name, ALIAS_INPUT];
    const model = planModel(names, [], [FAKE_BRAND, ALIAS_BRAND]);
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, brandNames: names }, { model });
    expect(result.mode).toBe("agent");
    expect(result.brands.map((brand) => brand.entityId)).toEqual([FAKE_BRAND_ID]);
    expect(result.unresolved).toEqual([ALIAS_INPUT]);
    expect(result.ambiguousBrands?.[0].inputName).toBe(ALIAS_INPUT);
    expect(result.categories).toHaveLength(2);
    expect(result.categories.every((category) => category.evidence.length === 1 && category.evidence.every((item) =>
      "brandEntityId" in item && item.brandEntityId === FAKE_BRAND_ID))).toBe(true);
  });

  it("keeps surviving exact evidence when removing an implicit choice requires fallback backfill", async () => {
    const names = [FAKE_BRAND.name, ALIAS_INPUT];
    const alternative = { ...FAKE_BRAND, entityId: "00000000-0000-4000-8000-000000000082", name: "The Fake Coffee Company", popularity: 1 };
    vi.mocked(searchBrands).mockImplementation(async (name) => name === ALIAS_INPUT ? [ALIAS_BRAND] : [FAKE_BRAND, alternative]);
    const categories = [FAKE_BRAND, ALIAS_BRAND].map((brand, index) => ({
      tagId: index === 0 ? FAKE_CATEGORY_ID : CAFE_ID,
      evidence: [{ brandEntityId: brand.entityId, brandTagId: FAKE_TAG.id, reason: "Coffee tags support local cafes." }],
    }));
    const model = new MockLanguageModelV4({ doGenerate: [toolReply("resolveBrands", { names }),
      toolReply("searchCategories", { query: "coffee" }), toolReply("submitPlan", { categories })] });
    const result = await runPlan({ ...FAKE_PLAN_REQUEST, brandNames: names }, { model });
    expect(result.mode).toBe("fallback");
    expect(result.brands).toMatchObject([{ entityId: FAKE_BRAND_ID, matchKind: "exact" }]);
    expect(result.unresolved).toEqual([ALIAS_INPUT]);
    expect(result.categories.find((category) => category.tagId === FAKE_CATEGORY_ID)?.source).toBe("agent");
    expect(result.categories.find((category) => category.tagId === CAFE_ID)?.source).toBe("fallback");
    expect(result.categories.every((category) => category.evidence.every((item) =>
      "brandEntityId" in item && item.brandEntityId === FAKE_BRAND_ID))).toBe(true);
  });
});
