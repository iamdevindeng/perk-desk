// Ensures model prompts include relevant evidence without leaking unrelated profile fields.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { createPlanContext, createRunContext } from "@/lib/agent/context";
import { buildPitchPrompt, buildPlanUserPrompt, buildRunUserPrompt } from "@/lib/agent/prompts";
import { FAKE_MERCHANT, FAKE_PLAN_REQUEST, FAKE_RUN_REQUEST } from "../fixtures/fake-plan";

describe("model data boundaries", () => {
  it("keeps branch street addresses out of category planning", () => {
    const context = createPlanContext({ ...FAKE_PLAN_REQUEST,
      branches: [{ ...FAKE_PLAN_REQUEST.branches[0], address: "private-address-canary" }],
    });
    const prompt = buildPlanUserPrompt(context);
    expect(prompt).toContain(FAKE_PLAN_REQUEST.brandNames[0]);
    expect(prompt).not.toContain("private-address-canary");
    expect(JSON.parse(prompt).branchCount).toBe(1);
  });
  it("does not send signed lists or internal follow-up exclusions to the research model", () => {
    const context = createRunContext({ ...FAKE_RUN_REQUEST,
      signedNames: ["private-signed-canary"], businessMemberNames: ["private-member-canary"],
      excludeEntityIds: ["private-status-canary"],
    });
    const prompt = buildRunUserPrompt(context);
    expect(prompt).toContain(FAKE_RUN_REQUEST.categories[0].tagId);
    expect(prompt).not.toContain("private-");
  });
  it("limits pitch evidence to visible card facts", () => {
    const prompt = buildPitchPrompt({ institutionName: "Fake CU", merchants: [FAKE_MERCHANT] });
    const input = JSON.parse(prompt);
    expect(input.merchants[0].name).toBe(FAKE_MERCHANT.place.name);
    expect(input.merchants[0].tasteSignal).toBe(true);
    expect(input.merchants[0].distanceKm).toBe("0.1");
    expect(input.merchants[0]).not.toHaveProperty("score");
    expect(input.merchants[0]).not.toHaveProperty("phone");
    expect(input.merchants[0]).not.toHaveProperty("explain");
  });
});
