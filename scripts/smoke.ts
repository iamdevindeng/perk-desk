// Runs both demo planning and research pipelines and prints safe names, counts, and timings.
// Called by: npm run smoke for the explicitly requested real-key end-to-end check
import { runPlan } from "@/lib/agent/plan-agent";
import { runResearch } from "@/lib/agent/run-agent";
import { DISTANCE_DECIMALS, METERS_PER_KILOMETER, RUN_MAX_CATEGORIES } from "@/lib/config";
import { getPresets } from "@/lib/data";
import { hasDeepSeekKey, hasQlooKey } from "@/lib/env";
import { createQlooError, isQlooError } from "@/lib/qloo/client";
import { buildPlanRequest, buildRunRequest } from "@/lib/request-builders";
import { ProfileSchema, type PlanResponse, type Preset, type RunResult, type TraceEvent } from "@/lib/types";

function printPlan(plan: PlanResponse, durationMs: number): void {
  console.info(`Plan mode: ${plan.mode}`);
  console.info(`Resolved brands: ${plan.brands.map((brand) => `${brand.inputName} → ${brand.name}`).join(", ")}`);
  console.info(`Unresolved names: ${plan.unresolved.join(", ")}`);
  console.table(plan.categories.map((category) => ({ category: category.label,
    "evidence brands": [...new Set(category.evidence.map((evidence) => evidence.brandName))].join(", ") })));
  const calls = plan.trace.filter((event) => event.type === "qloo_call");
  console.info(`Plan Qloo calls: ${calls.length}; cache hits: ${calls.filter((event) => event.cached).length}; durationMs: ${durationMs}`);
}

function printResearch(result: RunResult, eventCounts: Map<string, number>, durationMs: number): void {
  console.info(`Research mode: ${result.mode}`);
  console.table(result.categories.map((category) => ({ category: category.label,
    independentCount: category.independentCount, status: category.status })));
  console.table(result.merchants.map((merchant) => ({ merchant: merchant.place.name, branch: merchant.branchName,
    distanceKm: (merchant.distanceMeters / METERS_PER_KILOMETER).toFixed(DISTANCE_DECIMALS) })));
  console.table([{ merchants: result.merchants.length,
    agentPitches: result.merchants.filter((merchant) => merchant.pitchSource === "agent").length,
    templatePitches: result.merchants.filter((merchant) => merchant.pitchSource === "template").length,
    qlooCalls: result.qlooCalls, durationMs }]);
  console.table([...eventCounts].map(([eventType, count]) => ({ eventType, count })));
}

function assertUsablePlan(plan: PlanResponse): void {
  if (plan.brands.length && plan.categories.length && plan.branches.length) return;
  throw createQlooError("upstream", null, "Smoke planning produced no usable brands, categories, or branch locations.");
}

async function runPreset(preset: Preset): Promise<void> {
  console.info(`Preset: ${preset.id}`);
  const profile = ProfileSchema.parse(preset.profile);
  const request = buildPlanRequest(profile, preset.brandsText, preset.id);
  const planStartedAt = Date.now();
  const plan = await runPlan(request);
  const planDurationMs = Date.now() - planStartedAt;
  printPlan(plan, planDurationMs);
  assertUsablePlan(plan);
  if (plan.unresolved.length) throw createQlooError("upstream", null, "Smoke preset has unresolved brands; review the brand names.");
  const runRequest = buildRunRequest(profile, plan, plan.categories.slice(0, RUN_MAX_CATEGORIES), {}, preset.id);
  const eventCounts = new Map<string, number>();
  const emit = (event: TraceEvent): void => { eventCounts.set(event.type, (eventCounts.get(event.type) ?? 0) + 1); };
  const runStartedAt = Date.now();
  const result = await runResearch(runRequest, emit);
  printResearch(result, eventCounts, Date.now() - runStartedAt);
  if (!result.merchants.length) throw createQlooError("upstream", null, "Smoke research returned no shortlisted merchants.");
  const repeatStartedAt = Date.now();
  const repeat = await runPlan(request);
  const repeatDurationMs = Date.now() - repeatStartedAt;
  assertUsablePlan(repeat);
  // Direct runPlan reuses Qloo caches, but still runs the model; faster timing is not guaranteed.
  const cacheHits = repeat.trace.filter((event) => event.type === "qloo_call" && event.cached).length;
  console.info(`Repeat plan durationMs: ${repeatDurationMs}; faster: ${repeatDurationMs < planDurationMs}; Qloo cache hits: ${cacheHits}`);
}

async function main(): Promise<void> {
  if (!hasQlooKey()) {
    console.error("Missing QLOO_API_KEY in .env.local");
    process.exit(2);
  }
  if (!hasDeepSeekKey()) console.info("Missing DEEPSEEK_API_KEY; running with deterministic fallback.");
  for (const preset of getPresets()) await runPreset(preset);
}

// CJS-safe entry point; only our typed Qloo messages are safe to expose, never an SDK error body.
main().catch((error: unknown) => {
  console.error(isQlooError(error) ? `${error.code}: ${error.message}` : "internal: Smoke check failed.");
  process.exitCode = 1;
});
