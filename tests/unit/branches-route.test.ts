// Verifies branch lookup HTTP validation, shared limits, usage accounting, and safe errors.
// Called by: npm test with invented places and mocked Qloo helpers
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, maxDuration } from "@/app/api/branches/route";
import { LIVE_LIMIT_MESSAGE, SHARED_LIMIT_CONFIG_MESSAGE } from "@/lib/config";
import { getCities } from "@/lib/data";
import { resetEnvForTests } from "@/lib/env";
import { createQlooError, type QlooErrorCode } from "@/lib/qloo/client";
import { resolveLocality } from "@/lib/qloo/insights";
import { searchPlacesByName } from "@/lib/qloo/search";
import { checkLimit } from "@/lib/store/rate-limit";
import { isQlooBudgetReached, recordUsageCall } from "@/lib/store/usage";
import { BranchLookupResponseSchema } from "@/lib/types";
import { makeFakePlace } from "../fixtures/fake-places";

vi.mock("@/lib/qloo/insights", () => ({ resolveLocality: vi.fn() }));
vi.mock("@/lib/qloo/search", () => ({ searchPlacesByName: vi.fn() }));
vi.mock("@/lib/store/rate-limit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/store/rate-limit")>(), checkLimit: vi.fn(),
}));
const CITY = getCities()[0];
const INPUT = { name: "Fake Grove Credit Union", city: CITY.label };

function request(body: unknown): Request {
  return new Request("http://localhost/api/branches", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1, 192.0.2.2" },
  });
}

beforeEach(() => {
  vi.mocked(resolveLocality).mockReset().mockResolvedValue(null);
  vi.mocked(searchPlacesByName).mockReset().mockResolvedValue([]);
  vi.mocked(checkLimit).mockReset().mockResolvedValue({ ok: true });
  vi.stubEnv("QLOO_API_KEY", "fake-route-key"); resetEnvForTests();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); resetEnvForTests(); });

describe("branch route validation and results", () => {
  it.each([{}, null, [], { ...INPUT, name: " " }, { ...INPUT, name: "x".repeat(101) }, { ...INPUT, city: "x" }, { ...INPUT, city: "x".repeat(81) }])(
    "rejects invalid request fields before any service call", async (body) => {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_request", issues: expect.any(Array) });
      expect(checkLimit).not.toHaveBeenCalled(); expect(searchPlacesByName).not.toHaveBeenCalled();
    },
  );

  it("returns sanitized validation details for malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/branches", { method: "POST", body: "private malformed body" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_request", issues: [{ path: [], code: "invalid_json" }] });
    expect(checkLimit).not.toHaveBeenCalled();
  });

  it("trims the query, uses the branches limit scope, and returns exact coordinates", async () => {
    vi.mocked(searchPlacesByName).mockResolvedValue([makeFakePlace(1, {
      name: INPUT.name, lat: CITY.lat, lon: CITY.lon, primaryGenreId: "urn:tag:genre:place:credit_union",
    })]);
    const response = await POST(request({ ...INPUT, name: ` ${INPUT.name} ` }));
    expect(response.status).toBe(200);
    expect(BranchLookupResponseSchema.parse(await response.json())).toMatchObject({
      status: "found", query: INPUT.name, cityLabel: CITY.label,
      places: [{ name: INPUT.name, address: "1 Example Lane", lat: CITY.lat, lon: CITY.lon, distanceMeters: 0 }], suggestions: [],
    });
    expect(checkLimit).toHaveBeenCalledExactlyOnceWith("branches", "192.0.2.1");
    expect(resolveLocality).not.toHaveBeenCalled(); expect(maxDuration).toBe(300);
    expect(console.info).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^\[usage\] scope=branches ip_hash=[a-f0-9]{12} qloo_calls=0 llm_calls=0$/));
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(INPUT.name);
  });

  it("accounts for custom-city resolution and the search in the same two-call budget", async () => {
    vi.mocked(resolveLocality).mockImplementation(async () => {
      recordUsageCall("qloo"); expect(isQlooBudgetReached()).toBe(false);
      return { name: "Fake Grove City, ST", lat: 12.3, lon: 45.6 };
    });
    vi.mocked(searchPlacesByName).mockImplementation(async () => {
      recordUsageCall("qloo"); expect(isQlooBudgetReached()).toBe(true); return [];
    });
    const response = await POST(request({ ...INPUT, city: "Fake Grove City" }));
    expect(await response.json()).toMatchObject({ status: "none", cityLabel: "Fake Grove City, ST" });
    expect(console.info).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/scope=branches .* qloo_calls=2 llm_calls=0$/));
  });

  it("returns city_not_found without searching when a custom city cannot be resolved", async () => {
    const response = await POST(request({ ...INPUT, city: "Fake Missing City" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "city_not_found", cityLabel: "Fake Missing City", places: [], suggestions: [] });
    expect(searchPlacesByName).not.toHaveBeenCalled();
  });
});

describe("branch route limits and errors", () => {
  it.each(["ip", "global"] as const)("returns HTTP 200 limited for a %s budget", async (reason) => {
    vi.mocked(checkLimit).mockResolvedValue({ ok: false, reason });
    const response = await POST(request(INPUT));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "limited", query: INPUT.name, cityLabel: CITY.label, message: LIVE_LIMIT_MESSAGE, places: [], suggestions: [] });
    expect(resolveLocality).not.toHaveBeenCalled(); expect(searchPlacesByName).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
  });

  it("fails closed with HTTP 503 before Qloo when shared rate limits are unavailable", async () => {
    vi.mocked(checkLimit).mockResolvedValue({ ok: false, reason: "store", message: SHARED_LIMIT_CONFIG_MESSAGE });
    const response = await POST(request(INPUT));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "config", message: SHARED_LIMIT_CONFIG_MESSAGE });
    expect(resolveLocality).not.toHaveBeenCalled(); expect(searchPlacesByName).not.toHaveBeenCalled();
  });

  it("returns a safe missing-key error before Qloo", async () => {
    vi.stubEnv("QLOO_API_KEY", ""); resetEnvForTests();
    const response = await POST(request(INPUT));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "config", message: "Server is missing its Qloo key." });
    expect(searchPlacesByName).not.toHaveBeenCalled();
  });

  it.each([
    ["config", 503, "config"], ["auth", 502, "auth"], ["quota", 503, "quota"],
    ["upstream", 502, "upstream"], ["timeout", 502, "upstream"], ["budget", 502, "upstream"],
  ] as const)("uses the shared plan error mapping for %s", async (code: QlooErrorCode, status, expected) => {
    vi.mocked(searchPlacesByName).mockRejectedValue(createQlooError(code, null, "private upstream detail"));
    const response = await POST(request(INPUT));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toMatchObject({ error: expected, message: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("private upstream detail");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(INPUT.name);
  });

  it("sanitizes unexpected errors", async () => {
    vi.mocked(searchPlacesByName).mockRejectedValue(new Error("private detail"));
    const response = await POST(request(INPUT));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal", message: "Something went wrong." });
  });
});
