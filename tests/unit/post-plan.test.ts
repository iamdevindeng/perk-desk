// Checks browser plan requests and validated response/error handling without network access.
// Called by: npm test
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postPlan } from "@/lib/run-client";
import { FAKE_PLAN_REQUEST, FAKE_PLAN_RESPONSE } from "../fixtures/fake-plan";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("postPlan", () => {
  it("posts validated JSON and reads a valid plan", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(FAKE_PLAN_RESPONSE));
    expect(await postPlan(FAKE_PLAN_REQUEST)).toEqual(FAKE_PLAN_RESPONSE);
    expect(fetchMock).toHaveBeenCalledWith("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(FAKE_PLAN_REQUEST) });
  });

  it("shows mapped server messages and a friendly validation error", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "quota", message: "Live research is paused." }, { status: 503 }));
    await expect(postPlan(FAKE_PLAN_REQUEST)).rejects.toThrow("Live research is paused.");
    fetchMock.mockResolvedValueOnce(Response.json({ error: "bad_request", issues: [] }, { status: 400 }));
    await expect(postPlan(FAKE_PLAN_REQUEST)).rejects.toThrow("Check your profile and brand names");
  });

  it("rejects unreadable or structurally invalid successful responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not JSON"));
    await expect(postPlan(FAKE_PLAN_REQUEST)).rejects.toThrow("unreadable response");
    fetchMock.mockResolvedValueOnce(Response.json({ categories: [] }));
    await expect(postPlan(FAKE_PLAN_REQUEST)).rejects.toThrow("invalid response");
  });

  it("sanitizes connection failures and rejects invalid input before fetching", async () => {
    fetchMock.mockRejectedValueOnce(new Error("private transport details"));
    await expect(postPlan(FAKE_PLAN_REQUEST)).rejects.toThrow("Could not reach Perk Desk");
    fetchMock.mockClear();
    await expect(postPlan({ ...FAKE_PLAN_REQUEST, brandNames: [] })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
