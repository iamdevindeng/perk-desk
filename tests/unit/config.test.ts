// Checks that shared scoring weights and category limits remain consistent.
// Called by: npm test
import { describe, expect, it } from "vitest";
import {
  PLAN_MAX_CATEGORIES,
  PLAN_MIN_CATEGORIES,
  RUN_MAX_CATEGORIES,
  SCORE_WEIGHTS,
} from "@/lib/config";

describe("shared configuration", () => {
  it("assigns a total scoring weight of one", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce(
      (sum, weight) => sum + weight,
      0,
    );
    expect(total).toBeCloseTo(1);
  });

  it("keeps category limits in their intended order", () => {
    expect(PLAN_MIN_CATEGORIES).toBeLessThanOrEqual(PLAN_MAX_CATEGORIES);
    expect(RUN_MAX_CATEGORIES).toBeGreaterThanOrEqual(PLAN_MIN_CATEGORIES);
    expect(RUN_MAX_CATEGORIES).toBeLessThanOrEqual(PLAN_MAX_CATEGORIES);
  });
});
