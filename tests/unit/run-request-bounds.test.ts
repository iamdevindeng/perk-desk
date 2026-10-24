// Rejects oversized research inputs before cache or providers and accepts exact field bounds.
// Called by: npm test; every request uses fictional values and mocked dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/run/route";
import { runResearch } from "@/lib/agent/run-agent";
import { getJson } from "@/lib/store/cache";
import { checkLimit } from "@/lib/store/rate-limit";
import { RunRequestSchema } from "@/lib/types";
import { FAKE_RUN_REQUEST } from "../fixtures/fake-plan";

vi.mock("@/lib/agent/run-agent", () => ({ runResearch: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ getJson: vi.fn(), setJson: vi.fn() }));
vi.mock("@/lib/store/rate-limit", () => ({ checkLimit: vi.fn(), getClientIp: () => "fake-ip" }));

const INVALID_FIELDS = [
  { label: "long city", field: "city", change: { city: "C".repeat(81) }, code: "too_big" },
  { label: "short city", field: "city", change: { city: "C" }, code: "too_small" },
  { label: "long brand name", field: "brands", change: { brands: [{ ...FAKE_RUN_REQUEST.brands[0], name: "B".repeat(121) }] }, code: "too_big" },
  { label: "empty brand name", field: "brands", change: { brands: [{ ...FAKE_RUN_REQUEST.brands[0], name: "" }] }, code: "too_small" },
  { label: "long category label", field: "categories", change: { categories: [{ ...FAKE_RUN_REQUEST.categories[0], label: "L".repeat(81) }] }, code: "too_big" },
  { label: "empty category label", field: "categories", change: { categories: [{ ...FAKE_RUN_REQUEST.categories[0], label: "" }] }, code: "too_small" },
  { label: "long excluded ID", field: "excludeEntityIds", change: { excludeEntityIds: ["x".repeat(65)] }, code: "too_big" },
  { label: "short excluded ID", field: "excludeEntityIds", change: { excludeEntityIds: ["x".repeat(7)] }, code: "too_small" },
  { label: "empty excluded ID", field: "excludeEntityIds", change: { excludeEntityIds: [""] }, code: "too_small" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unit tests must not use network"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("research request field bounds", () => {
  it.each(INVALID_FIELDS)("rejects $label with the existing HTTP 400 issue path", async ({ field, change, code }) => {
    const input = { ...FAKE_RUN_REQUEST, ...change };
    expect(RunRequestSchema.safeParse(input).success).toBe(false);
    const response = await POST(new Request("http://localhost/api/run", { method: "POST", body: JSON.stringify(input) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request", issues: [{ path: [field], code }] });
    expect(getJson).not.toHaveBeenCalled(); expect(checkLimit).not.toHaveBeenCalled(); expect(runResearch).not.toHaveBeenCalled();
  });

  it.each([
    { label: "minimum", cityLength: 2, brandLength: 1, categoryLength: 1, entityLength: 8 },
    { label: "maximum", cityLength: 80, brandLength: 120, categoryLength: 80, entityLength: 64 },
  ])("accepts the exact $label bounds without changing values", ({ cityLength, brandLength, categoryLength, entityLength }) => {
    const input = { ...FAKE_RUN_REQUEST, city: "C".repeat(cityLength),
      brands: [{ ...FAKE_RUN_REQUEST.brands[0], name: "B".repeat(brandLength) }],
      categories: [{ ...FAKE_RUN_REQUEST.categories[0], label: "L".repeat(categoryLength) }], excludeEntityIds: ["x".repeat(entityLength)],
    };
    expect(RunRequestSchema.parse(input)).toEqual(input);
  });
});
