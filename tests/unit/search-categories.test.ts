// Checks category context registration, cached density validation, and safe tool failures.
// Called by: npm test; Qloo category searches and cache reads are mocked
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanContext, createRunContext } from "@/lib/agent/context";
import { buildSearchCategoriesTool, searchCategoriesForContext } from "@/lib/agent/tools/search-categories";
import { TRACE_SUMMARY_MAX } from "@/lib/config";
import { createQlooError } from "@/lib/qloo/client";
import { searchPlaceCategories } from "@/lib/qloo/tags";
import { getJson } from "@/lib/store/cache";
import type { TraceEvent } from "@/lib/types";
import { FAKE_CATEGORY_ID, FAKE_PLAN_REQUEST, FAKE_RUN_REQUEST } from "../fixtures/fake-plan";

vi.mock("@/lib/qloo/tags", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/qloo/tags")>();
  return { ...original, searchPlaceCategories: vi.fn() };
});
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getJson).mockResolvedValue(null);
  vi.mocked(searchPlaceCategories).mockResolvedValue([{ tagId: FAKE_CATEGORY_ID, label: "Coffee shop" }]);
});

describe("category search tool", () => {
  it("adds real categories to the plan context and attaches known density", async () => {
    vi.mocked(getJson).mockResolvedValueOnce({ count: 8, complete: true });
    const emit = vi.fn();
    const context = createPlanContext(FAKE_PLAN_REQUEST, emit);
    const result = await searchCategoriesForContext(" coffee ", context);
    expect(result).toEqual([{ tagId: FAKE_CATEGORY_ID, label: "Coffee shop", knownIndependents: 8, usableInDemoCities: true }]);
    expect(context.candidateCategories.get(FAKE_CATEGORY_ID)).toBe("Coffee shop");
    expect(context.knownDensities.get(FAKE_CATEGORY_ID)).toBe(8);
    expect(getJson).toHaveBeenCalledWith(`pd:v1:density:denver-co:${FAKE_CATEGORY_ID}`, expect.any(AbortSignal));
    expect(searchPlaceCategories).toHaveBeenCalledWith("coffee", expect.objectContaining({ onCall: expect.any(Function) }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_call", tool: "searchCategories", summary: 'Finding place categories for "coffee"',
    }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_result", tool: "searchCategories", summary: 'Found 1 place categories for "coffee"',
    }));
  });

  it.each(["8", -1, 1.5, null, 0, 8, { count: 8 }, { count: 8, complete: false }])("ignores malformed or missing density %s", async (density) => {
    vi.mocked(getJson).mockResolvedValueOnce(density);
    const context = createPlanContext(FAKE_PLAN_REQUEST);
    const result = await searchCategoriesForContext("coffee", context);
    expect(result).toMatchObject([{ knownIndependents: undefined }]);
    expect(context.knownDensities.size).toBe(0);
  });

  it("accepts zero as a known density and works in the run context", async () => {
    vi.mocked(getJson).mockResolvedValueOnce({ count: 0, complete: true });
    const emit = vi.fn();
    const context = createRunContext(FAKE_RUN_REQUEST, emit);
    const tool = buildSearchCategoriesTool(context);
    const result = await tool.execute!({ query: "coffee" }, { toolCallId: "test", messages: [], context: {} });
    expect(result).toMatchObject([{ knownIndependents: 0 }]);
    expect(context.knownDensities.get(FAKE_CATEGORY_ID)).toBe(0);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_call", tool: "searchCategories", summary: 'Finding place categories for "coffee"',
    }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_result", tool: "searchCategories", summary: 'Found 1 place categories for "coffee"',
    }));
  });

  it("rejects invalid or blacklisted categories before registration", async () => {
    vi.mocked(searchPlaceCategories).mockResolvedValueOnce([
      { tagId: "invalid", label: "Invalid" }, { tagId: "urn:tag:category:place:fake_school", label: "Fake school" },
      { tagId: "urn:tag:category:place:fake_coffee_shop", label: "Fake coffee shop" },
    ]);
    const context = createPlanContext(FAKE_PLAN_REQUEST);
    expect(await searchCategoriesForContext("coffee", context)).toEqual([
      { tagId: "urn:tag:category:place:fake_coffee_shop", label: "Fake coffee shop", knownIndependents: undefined, usableInDemoCities: false },
    ]);
    expect(context.candidateCategories.size).toBe(1);
  });

  it("returns safe errors for blank queries and ordinary lookup failures", async () => {
    const emit = vi.fn();
    const context = createPlanContext(FAKE_PLAN_REQUEST, emit);
    expect(await searchCategoriesForContext(" ", context)).toHaveProperty("error");
    expect(searchPlaceCategories).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_call", tool: "searchCategories", summary: 'Finding place categories for ""',
    }));
    vi.mocked(searchPlaceCategories).mockRejectedValueOnce(new Error("private upstream details"));
    const result = await searchCategoriesForContext(" coffee ", context);
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("private upstream details");
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_result", tool: "searchCategories", summary: 'Category lookup failed for "coffee"',
    }));
  });

  it("caps call and failure summaries for an overlong invalid query", async () => {
    const events: TraceEvent[] = [];
    const context = createPlanContext(FAKE_PLAN_REQUEST, (event) => events.push(event));
    const query = `  coffee ${"x".repeat(TRACE_SUMMARY_MAX)}  `;
    expect(await searchCategoriesForContext(query, context)).toHaveProperty("error");
    expect(searchPlaceCategories).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual(["tool_call", "tool_result"]);
    for (const event of events) {
      expect(event).toHaveProperty("summary", expect.stringContaining('for "coffee'));
      if ("summary" in event) expect(event.summary).toHaveLength(TRACE_SUMMARY_MAX);
    }
  });

  it("records and rethrows fatal errors", async () => {
    const error = createQlooError("quota", 429, "Quota unavailable");
    vi.mocked(searchPlaceCategories).mockRejectedValueOnce(error);
    const emit = vi.fn();
    const context = createPlanContext(FAKE_PLAN_REQUEST, emit);
    await expect(searchCategoriesForContext("coffee", context)).rejects.toBe(error);
    expect(context.fatalError).toBe(error);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "tool_result", tool: "searchCategories", summary: 'Category lookup failed for "coffee"',
    }));
  });
});
