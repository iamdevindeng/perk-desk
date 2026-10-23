// Checks deterministic brand matching, user choices, permitted evidence, and tool errors.
// Called by: npm test; Qloo searches are mocked
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanContext } from "@/lib/agent/context";
import { buildResolveBrandsTool, matchBrand, resolveBrandNames } from "@/lib/agent/tools/resolve-brands";
import { createQlooError } from "@/lib/qloo/client";
import { searchBrands } from "@/lib/qloo/search";
import type { BrandCandidate, TraceEvent } from "@/lib/types";
import { FAKE_BRAND, FAKE_PLAN_REQUEST, FAKE_TAG } from "../fixtures/fake-plan";

vi.mock("@/lib/qloo/search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/qloo/search")>();
  return { ...original, searchBrands: vi.fn() };
});

function brand(name: string, index = 1): BrandCandidate {
  return { ...FAKE_BRAND, name, entityId: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}` };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("brand matching", () => {
  it("leaves REI ambiguous without treating Reiss as a word prefix", () => {
    const candidates = [brand("Recreational Equipment Inc"), brand("Real Madrid CF", 2), brand("Reiss", 3)];
    expect(matchBrand("REI", candidates)).toEqual({ status: "ambiguous" });
  });

  it.each([{ input: "Ulta Beauty", candidate: "Ulta" }, { input: "Sierra Nevada", candidate: "Sierra Nevada Brewing Co." }])("recognizes $input as a word-prefix match", ({ input, candidate }) => {
    const chosen = brand(candidate);
    expect(matchBrand(input, [chosen])).toEqual({ status: "resolved", chosen, matchKind: "prefix" });
  });

  it("prefers any exact match over the earlier prefix candidate", () => {
    const exact = brand("Fake Coffee Co", 2);
    expect(matchBrand("Fake Coffee", [brand("Fake Coffee Roasters"), exact])).toEqual({ status: "resolved", chosen: exact, matchKind: "exact" });
    expect(matchBrand("Fake Coffee", [])).toEqual({ status: "unresolved" });
    expect(matchBrand("", [exact])).toEqual({ status: "unresolved" });
  });
});

describe("brand resolution context", () => {
  it("honors a valid user override, preserves input spelling, and saves every candidate's tags", async () => {
    const candidates = [brand("Fake Coffee"), brand("Fake Other Coffee", 2)];
    vi.mocked(searchBrands).mockResolvedValueOnce(candidates);
    const events: TraceEvent[] = [];
    const context = createPlanContext({ ...FAKE_PLAN_REQUEST, brandNames: ["Fake Coffee"], brandOverrides: { "Fake Coffee": candidates[1].entityId } }, (event) => events.push(event));
    const result = await resolveBrandNames(["fake coffee"], context);
    expect(context.brandsByInput.get("Fake Coffee")).toMatchObject({ status: "resolved", chosen: candidates[1], matchKind: "user" });
    expect(context.brandTags.size).toBe(2);
    expect(result).toMatchObject([{ inputName: "Fake Coffee", chosen: { entityId: candidates[1].entityId } }]);
    expect(events.map((event) => event.type)).toEqual(["tool_call", "tool_result"]);
  });

  it("ignores an invalid override and never searches a model-invented brand", async () => {
    vi.mocked(searchBrands).mockResolvedValueOnce([FAKE_BRAND]);
    const context = createPlanContext({ ...FAKE_PLAN_REQUEST, brandOverrides: { [FAKE_BRAND.name]: "00000000-0000-4000-8000-000000000099" } });
    await resolveBrandNames([FAKE_BRAND.name, "Invented Brand"], context);
    expect(searchBrands).toHaveBeenCalledTimes(1);
    expect(context.brandsByInput.get(FAKE_BRAND.name)?.matchKind).toBe("exact");
    expect(context.brandsByInput.has("Invented Brand")).toBe(false);
  });

  it("returns safe tag names and exact evidence IDs with the prompt cap", async () => {
    const allowed = Array.from({ length: 30 }, (_, index) => ({ ...FAKE_TAG, id: `${FAKE_TAG.id}_${index}`, name: `Fake coffee tag ${index}` }));
    const prohibited = { id: "urn:tag:target_age_group:qloo:fake", name: "Forbidden fake tag", type: "urn:tag:target_age_group:qloo" };
    vi.mocked(searchBrands).mockResolvedValueOnce([{ ...FAKE_BRAND, tags: [...allowed, prohibited] }]);
    const context = createPlanContext(FAKE_PLAN_REQUEST);
    const result = await resolveBrandNames([FAKE_BRAND.name], context);
    if (!Array.isArray(result)) throw new Error("Expected resolved brand output");
    expect(result[0].candidates[0].tags).toHaveLength(25);
    expect(result[0].candidates[0].evidenceTags[0]).toEqual({ id: allowed[0].id, name: allowed[0].name });
    expect(context.brandTags.get(FAKE_BRAND.entityId)).toHaveLength(30);
    expect(JSON.stringify(result)).not.toContain("Forbidden fake tag");
    expect(JSON.stringify([...context.brandTags.values()])).not.toContain(prohibited.id);
  });

  it("records an unresolved input and reuses an existing resolution", async () => {
    vi.mocked(searchBrands).mockResolvedValueOnce([]);
    const context = createPlanContext(FAKE_PLAN_REQUEST);
    expect(await resolveBrandNames([FAKE_BRAND.name], context)).toEqual([{ inputName: FAKE_BRAND.name, status: "unresolved", chosen: undefined, candidates: [] }]);
    await resolveBrandNames([FAKE_BRAND.name], context);
    expect(searchBrands).toHaveBeenCalledTimes(1);
  });

  it("returns a safe tool error for ordinary failures", async () => {
    vi.mocked(searchBrands).mockRejectedValueOnce(new Error("private upstream details"));
    const context = createPlanContext(FAKE_PLAN_REQUEST);
    const tool = buildResolveBrandsTool(context);
    const result = await tool.execute!({ names: [FAKE_BRAND.name] }, { toolCallId: "test", messages: [], context: {} });
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("private upstream details");
    expect(context.warnings).toHaveLength(1);
  });

  it.each(["config", "auth", "quota"] as const)("rethrows fatal %s failures for orchestration", async (code) => {
    const error = createQlooError(code, null, "Fatal lookup error");
    vi.mocked(searchBrands).mockRejectedValueOnce(error);
    const context = createPlanContext(FAKE_PLAN_REQUEST);
    await expect(resolveBrandNames([FAKE_BRAND.name], context)).rejects.toBe(error);
    expect(context.fatalError).toBe(error);
  });
});
