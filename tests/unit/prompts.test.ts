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
    const input = JSON.parse(prompt);
    expect(input.brandNames).toEqual(FAKE_PLAN_REQUEST.brandNames);
    expect(prompt).not.toContain("private-address-canary");
    expect(input.branchCount).toBe(1);
    expect(input).not.toHaveProperty("knownDensities");
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
  it("offers fact IDs with code-owned sentences instead of free-form source descriptions", () => {
    const card = { ...FAKE_MERCHANT, place: { ...FAKE_MERCHANT.place,
      description: "private-description-canary", uniqueSellingPoint: "private-selling-point-canary",
    } };
    const prompt = buildPitchPrompt({ institutionName: "Fake CU", merchants: [card] });
    const input = JSON.parse(prompt);
    expect(input.merchants[0].name).toBe(FAKE_MERCHANT.place.name);
    expect(Object.keys(input.merchants[0]).sort()).toEqual(["entityId", "facts", "name"]);
    expect(input.merchants[0].facts).toEqual([
      { fact: "taste", sentence: expect.stringContaining('"Fake Coffee Co"') },
      { fact: "category", sentence: expect.stringContaining('"Coffee shop"') },
      { fact: "distance", sentence: expect.stringContaining("0.1 km") },
      { fact: "rating", sentence: expect.stringContaining("4.5-star business rating") },
    ]);
    expect(prompt).not.toContain("private-");
  });
  it("does not offer unavailable taste or rating facts to the model", () => {
    const card = { ...FAKE_MERCHANT, tasteSignal: false,
      place: { ...FAKE_MERCHANT.place, businessRating: undefined, tripadvisorRating: undefined },
    };
    const input = JSON.parse(buildPitchPrompt({ institutionName: "Fake CU", merchants: [card] }));
    expect(input.merchants[0].facts).toEqual([
      { fact: "category", sentence: expect.any(String) },
      { fact: "distance", sentence: expect.any(String) },
    ]);
  });
});
