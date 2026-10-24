// Verifies business-member matches add badges without changing merchant eligibility or ranking.
// Called by: npm test
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRunContext, type RunContext } from "@/lib/agent/context";
import { findMerchantsForCategory } from "@/lib/agent/tools/find-merchants";
import { findPlaces } from "@/lib/qloo/insights";
import { setJson } from "@/lib/store/cache";
import type { Place } from "@/lib/types";
import { FAKE_CATEGORY_ID, FAKE_RUN_REQUEST } from "../fixtures/fake-plan";
import { makeFakePlace } from "../fixtures/fake-places";

vi.mock("@/lib/qloo/insights", () => ({ findPlaces: vi.fn() }));
vi.mock("@/lib/store/cache", () => ({ setJson: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findPlaces).mockReset().mockResolvedValue([]);
  vi.mocked(setJson).mockReset().mockResolvedValue(undefined);
});

async function researchMembers(names: string[], places: Place[]): Promise<RunContext> {
  vi.mocked(findPlaces).mockResolvedValue(places);
  const context = createRunContext({ ...FAKE_RUN_REQUEST, businessMemberNames: names });
  await findMerchantsForCategory({ tagId: FAKE_CATEGORY_ID }, context);
  return context;
}

describe("business-member merchant badges", () => {
  it("matches normalized names, punctuation, legal suffixes, and sufficiently long contained names", async () => {
    const places = [makeFakePlace(10, { name: "The Ｆａｋｅ Coffee & Tea, LLC" }),
      makeFakePlace(11, { name: "Fake Garden Downtown" }), makeFakePlace(12, { name: "Fake Unrelated Bakery" })];
    const context = await researchMembers(["fake coffee and tea inc", "Fake Garden"], places);
    const badges = new Map(context.results.get(FAKE_CATEGORY_ID)!.candidates.map((candidate) => [candidate.place.name, candidate.businessMember]));
    expect(badges).toEqual(new Map([[places[0].name, true], [places[1].name, true], [places[2].name, false]]));
  });

  it("keeps all badges false when the list is empty or does not match", async () => {
    const place = makeFakePlace(10, { name: "Fake Coffee Corner" });
    for (const names of [[], ["Fake", "Other Shop"]]) {
      const context = await researchMembers(names, [place]);
      expect(context.results.get(FAKE_CATEGORY_ID)!.candidates[0].businessMember).toBe(false);
    }
  });

  it("preserves scores, rank fields, ordering, counts, and filtering when badges change", async () => {
    const places = [makeFakePlace(10, { name: "Fake Leading Cafe", affinity: 0.9 }),
      makeFakePlace(11, { name: "Fake Member Cafe", affinity: 0.2 }),
      makeFakePlace(12, { name: "Fake Closed Cafe", affinity: 0.5, isClosed: true })];
    const withoutMembers = await researchMembers([], places);
    const withMembers = await researchMembers(["Fake Member Cafe", "Fake Closed Cafe"], places);
    const original = withoutMembers.results.get(FAKE_CATEGORY_ID)!;
    const marked = withMembers.results.get(FAKE_CATEGORY_ID)!;
    expect(marked.candidates.map((candidate) => candidate.businessMember)).toEqual([false, true]);
    expect(marked.candidates.map((candidate) => ({ ...candidate, businessMember: false }))).toEqual(original.candidates);
    expect(marked.independentCount).toBe(original.independentCount);
    expect(withMembers.excludedCounts).toEqual(withoutMembers.excludedCounts);
    expect(withMembers.excludedCounts.closed).toBe(1);
  });
});
