// Measures category planning against hand-written expectations with explicitly enabled live keys.
// Called by: npm run eval; excluded from network-free unit tests
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runPlan } from "@/lib/agent/plan-agent";
import { DEFAULT_RADIUS_M, EVAL_METRIC_DECIMALS, EVAL_MIN_HIT_RATE, EVAL_TIMEOUT_MS } from "@/lib/config";
import { getCategoryDefaults, getCities } from "@/lib/data";
import { hasDeepSeekKey, hasQlooKey } from "@/lib/env";
import { CategoryTagIdSchema, PlanRequestSchema, type PlanRequest } from "@/lib/types";
import casesData from "./cases.json";

const EvalCaseSchema = z.object({
  id: z.string().min(1), city: z.string().min(1), brands: z.array(z.string().min(1)).min(1),
  expectedAnyOf: z.array(CategoryTagIdSchema).min(1),
});
const cases = z.object({ cases: z.array(EvalCaseSchema) }).parse(casesData).cases;
type EvalCase = z.infer<typeof EvalCaseSchema>;
type EvalResult = {
  id: string; mode: "agent" | "fallback" | "error"; pickedLabels: string; hit: boolean;
  precision: number; matchedCount: number; pickedCount: number; durationMs: number;
};

function requestForCase(evaluation: EvalCase): PlanRequest {
  const city = getCities().find((candidate) => candidate.label === evaluation.city);
  if (!city) throw new Error("Evaluation city is not configured.");
  return PlanRequestSchema.parse({
    institutionName: "Category evaluation credit union", city: evaluation.city, brandNames: evaluation.brands,
    branches: [{ id: "eval-center", name: "City center", address: "", lat: city.lat, lon: city.lon,
      radiusMeters: DEFAULT_RADIUS_M, locationSource: "preset" }],
  });
}

async function evaluateCase(evaluation: EvalCase): Promise<EvalResult> {
  const startedAt = Date.now();
  try {
    const plan = await runPlan(requestForCase(evaluation));
    const expected = new Set(evaluation.expectedAnyOf);
    const picked = [...new Map(plan.categories.map((category) => [category.tagId, category])).values()];
    const matchedCount = picked.filter((category) => expected.has(category.tagId)).length;
    return {
      id: evaluation.id, mode: plan.mode, pickedLabels: picked.map((category) => category.label).join("; "),
      hit: matchedCount > 0, precision: picked.length ? matchedCount / picked.length : 0,
      matchedCount, pickedCount: picked.length, durationMs: Date.now() - startedAt,
    };
  } catch {
    // Never let Vitest print an upstream error: it could contain response data or request details.
    return { id: evaluation.id, mode: "error", pickedLabels: "", hit: false,
      precision: 0, matchedCount: 0, pickedCount: 0, durationMs: Date.now() - startedAt };
  }
}

function reportResults(results: EvalResult[], durationMs: number): number {
  const hits = results.filter((result) => result.hit).length;
  const pickedCount = results.reduce((total, result) => total + result.pickedCount, 0);
  const matchedCount = results.reduce((total, result) => total + result.matchedCount, 0);
  const hitRate = hits / results.length;
  const macroAveragePrecision = results.reduce((total, result) => total + result.precision, 0) / results.length;
  console.table(results.map((result) => ({ id: result.id, mode: result.mode, "picked labels": result.pickedLabels,
    hit: result.hit, precision: result.precision.toFixed(EVAL_METRIC_DECIMALS), durationMs: result.durationMs })));
  console.table([{ cases: results.length, hits, hitRate: hitRate.toFixed(EVAL_METRIC_DECIMALS),
    macroAveragePrecision: macroAveragePrecision.toFixed(EVAL_METRIC_DECIMALS),
    microAveragePrecision: (pickedCount ? matchedCount / pickedCount : 0).toFixed(EVAL_METRIC_DECIMALS),
    fallbackCount: results.filter((result) => result.mode === "fallback").length,
    errorCount: results.filter((result) => result.mode === "error").length, durationMs }]);
  return hitRate;
}

describe("category evaluation definitions", () => {
  it("has all fifteen unique cases with expected categories in the defaults", () => {
    expect(cases).toHaveLength(15);
    expect(new Set(cases.map((evaluation) => evaluation.id)).size).toBe(cases.length);
    const allowedIds = new Set(getCategoryDefaults().categories.map((category) => category.tagId));
    for (const evaluation of cases) {
      expect(getCities().some((city) => city.label === evaluation.city)).toBe(true);
      for (const tagId of evaluation.expectedAnyOf) expect(allowedIds.has(tagId), `${evaluation.id}: ${tagId}`).toBe(true);
    }
  });
});

describe.skipIf(!hasQlooKey() || !hasDeepSeekKey())("live category evaluation", () => {
  it("meets the minimum hit rate across sequential plans", async () => {
    const startedAt = Date.now();
    const results: EvalResult[] = [];
    // Await each plan so this evaluation never creates parallel live case requests.
    for (const evaluation of cases) {
      const result = await evaluateCase(evaluation);
      results.push(result);
      console.info(`${result.id}: ${result.mode}; picked: ${result.pickedLabels}; hit: ${result.hit}; precision: ${result.precision.toFixed(EVAL_METRIC_DECIMALS)}; durationMs: ${result.durationMs}`);
    }
    const hitRate = reportResults(results, Date.now() - startedAt);
    expect(hitRate).toBeGreaterThanOrEqual(EVAL_MIN_HIT_RATE);
  }, EVAL_TIMEOUT_MS);
});
