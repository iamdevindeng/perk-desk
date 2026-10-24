// Verifies cached-result name deduplication preserves displayed order and caller data.
// Called by: npm test; all merchant examples are hand-written fictional records
import { expect, it } from "vitest";
import { dedupeMerchants } from "@/lib/merchants/dedupe";
import { FAKE_MERCHANT, FAKE_RUN_RESULT } from "../fixtures/fake-plan";
import { makeFakePlace } from "../fixtures/fake-places";

it("keeps the first normalized name in place across different categories and branches", () => {
  const first = { ...FAKE_MERCHANT, score: 0.2, place: makeFakePlace(1, { name: "The Fake Harbor Co." }) };
  const second = { ...FAKE_MERCHANT, place: makeFakePlace(2, { name: "Fake Bookshop" }) };
  const duplicate = { ...FAKE_MERCHANT, score: 1, branchId: "fake-other", categoryTagId: "urn:tag:category:place:bakery",
    place: makeFakePlace(3, { name: "Fake Harbor LLC" }) };
  const last = { ...FAKE_MERCHANT, place: makeFakePlace(4, { name: "Fake Bicycle Shop" }) };
  const original = { ...FAKE_RUN_RESULT, merchants: [first, second, duplicate, last] };
  const before = structuredClone(original);
  const result = dedupeMerchants(original);
  expect(result).not.toBe(original);
  expect(result).toEqual({ ...original, merchants: [first, second, last] });
  expect(result.merchants[0]).toBe(first);
  expect(original).toEqual(before);
});

it("returns the original result when no duplicate name needs removal", () => {
  expect(dedupeMerchants(FAKE_RUN_RESULT)).toBe(FAKE_RUN_RESULT);
  const empty = { ...FAKE_RUN_RESULT, merchants: [] };
  expect(dedupeMerchants(empty)).toBe(empty);
});

it("keeps distinct names and produces the same result on another deduplication pass", () => {
  const first = { ...FAKE_MERCHANT, place: makeFakePlace(1, { name: "Fake Harbor" }) };
  const second = { ...FAKE_MERCHANT, place: makeFakePlace(2, { name: "Fake Harbor Bakery" }) };
  const duplicate = { ...first, place: makeFakePlace(3, { name: "  FAKE HARBOR  " }) };
  const result = dedupeMerchants({ ...FAKE_RUN_RESULT, merchants: [first, second, duplicate] });
  expect(result.merchants).toEqual([first, second]);
  expect(dedupeMerchants(result)).toBe(result);
});
