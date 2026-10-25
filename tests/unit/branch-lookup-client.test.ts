// Checks branch lookup request validation and readable server/network error handling.
// Called by: npm test; fetch is stubbed and no live requests are made
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { postBranchLookup } from "@/lib/branch-lookup-client";

const fetchMock = vi.fn<typeof fetch>();
const request = { name: "Fake Credit Union", city: "Fakeville, CO" };
const response = { status: "none", query: request.name, cityLabel: request.city, places: [], suggestions: [] };
const signal = new AbortController().signal;
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

it("posts the trimmed search with the abort signal and parses the response", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(response));
  expect(await postBranchLookup({ name: ` ${request.name} `, city: request.city }, signal)).toEqual(response);
  expect(fetchMock).toHaveBeenCalledWith("/api/branches", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(request), signal });
});

it.each([{ name: " ", city: request.city }, { name: request.name, city: " " }])("rejects invalid input before fetch", async (invalid) => {
  await expect(postBranchLookup(invalid, signal)).rejects.toThrow(); expect(fetchMock).not.toHaveBeenCalled();
});

it("returns a readable connection failure", async () => {
  fetchMock.mockRejectedValueOnce(new Error("Fake private transport detail"));
  await expect(postBranchLookup(request, signal)).rejects.toThrow("Could not reach Perk Desk. Check your connection and try again.");
});

it("returns a server message for failed requests", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "quota", message: "Fake quota message." }, { status: 503 }));
  await expect(postBranchLookup(request, signal)).rejects.toThrow("Fake quota message.");
});

it("uses a safe fallback when an error body has no message", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "bad_request" }, { status: 400 }));
  await expect(postBranchLookup(request, signal)).rejects.toThrow("Branch search could not finish. Please try again.");
});

it.each([null, { ...response, status: "unknown" }])("rejects an invalid successful response", async (body) => {
  fetchMock.mockResolvedValueOnce(Response.json(body));
  await expect(postBranchLookup(request, signal)).rejects.toThrow("Branch search returned an invalid response. Please try again.");
});

it("explains unreadable response bodies", async () => {
  fetchMock.mockResolvedValueOnce(new Response("not JSON"));
  await expect(postBranchLookup(request, signal)).rejects.toThrow("Branch search returned an unreadable response. Please try again.");
});
