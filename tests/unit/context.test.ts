// Verifies isolated request state, progress counts, and fatal service-error propagation.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { contextQlooOptions, createPlanContext, createRunContext, handleToolError } from "@/lib/agent/context";
import { AGENT_CALL_SETTINGS } from "@/lib/agent/model";
import { createQlooError } from "@/lib/qloo/client";
import type { TraceEvent } from "@/lib/types";
import { FAKE_PLAN_REQUEST, FAKE_RUN_REQUEST } from "../fixtures/fake-plan";

describe("request context", () => {
  it("starts each plan with separate mutable state", () => {
    const first = createPlanContext(FAKE_PLAN_REQUEST);
    const second = createPlanContext(FAKE_PLAN_REQUEST);
    first.candidateCategories.set("fake", "Fake");
    expect(second.candidateCategories.size).toBe(0);
    expect(first.submitCount).toBe(0);
    expect(first.plan).toBeNull();
  });
  it("seeds confirmed and adjacent run categories", () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    expect(context.candidateCategories.get("urn:tag:category:place:coffee_shop")).toBe("Coffee shop");
    expect(context.candidateCategories.has("urn:tag:category:place:cafe")).toBe(true);
    expect(context.results.size).toBe(0);
    expect(context.replacements.size).toBe(0);
  });
  it("emits every cache observation while counting only upstream lookups", () => {
    const events: TraceEvent[] = [];
    const context = createPlanContext(FAKE_PLAN_REQUEST, (event) => events.push(event));
    const options = contextQlooOptions(context);
    options.onCall?.({ endpoint: "/search", summary: "Brand search", ms: 5, cached: false });
    options.onCall?.({ endpoint: "/search", summary: "Brand search", ms: 0, cached: true });
    expect(context.qlooCalls).toBe(1);
    expect(events).toHaveLength(2);
    expect(events[0].at).toBeGreaterThanOrEqual(0);
  });
  it.each(["auth", "quota", "config"] as const)("preserves fatal %s errors even if the SDK catches a tool throw", (code) => {
    const context = createPlanContext(FAKE_PLAN_REQUEST);
    const error = createQlooError(code, 503, "Safe service error");
    expect(() => handleToolError(context, error)).toThrow(error);
    expect(context.fatalError).toBe(error);
  });
  it("never includes provider exception details in a recoverable tool error", () => {
    const context = createRunContext(FAKE_RUN_REQUEST);
    const result = handleToolError(context, new Error("sensitive provider detail"));
    expect(result.error).not.toContain("sensitive");
    expect(context.warnings).toContain(result.error);
    expect(context.fatalError).toBeNull();
  });
  it("disables DeepSeek thinking and uses deterministic generation settings", () => {
    expect(AGENT_CALL_SETTINGS.temperature).toBe(0);
    expect(AGENT_CALL_SETTINGS.providerOptions.deepseek.thinking.type).toBe("disabled");
    expect(AGENT_CALL_SETTINGS.maxRetries).toBe(1);
  });
});
