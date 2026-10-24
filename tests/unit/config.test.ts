// Checks that shared scoring weights and category limits remain consistent.
// Called by: npm test
import { describe, expect, it } from "vitest";
import {
  PLAN_MAX_CATEGORIES,
  PLAN_MIN_CATEGORIES,
  PLAN_LIMIT_PER_IP,
  PLAN_LIMIT_GLOBAL,
  PLAN_QLOO_CALL_CAP,
  RUN_LIMIT_PER_IP,
  RUN_LIMIT_GLOBAL,
  RUN_QLOO_CALL_CAP,
  RUN_MAX_CATEGORIES,
  SCORE_WEIGHTS,
} from "@/lib/config";

describe("shared configuration", () => {
  it("allows the R30 plan cap and retains the run cap", () => {
    expect([PLAN_QLOO_CALL_CAP, RUN_QLOO_CALL_CAP]).toEqual([70, 120]);
  });

  it("caps daily live work to the R16 public-site budgets", () => {
    expect([PLAN_LIMIT_PER_IP, PLAN_LIMIT_GLOBAL]).toEqual([30, 300]);
    expect([RUN_LIMIT_PER_IP, RUN_LIMIT_GLOBAL]).toEqual([10, 150]);
  });

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
