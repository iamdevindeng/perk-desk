// Checks exact blank-profile recognition without depending on branch IDs or object property order.
// Called by: npm test; all profiles are constructed locally without browser or provider requests
import { expect, it } from "vitest";
import { emptyProfile, isEmptyProfile } from "@/lib/profile-storage";
import { ProfileSchema, type Branch, type Profile } from "@/lib/types";

it("recognizes the blank profile with any branch ID and reordered properties", () => {
  const blank = emptyProfile();
  const reordered = Object.fromEntries(Object.entries(blank).reverse()) as Profile;
  reordered.branches = [{ ...Object.fromEntries(Object.entries(blank.branches[0]).reverse()), id: "different-id" } as Branch];
  expect(isEmptyProfile(blank)).toBe(true);
  expect(isEmptyProfile(reordered)).toBe(true);
});

it("keeps the shared request profile schema unchanged", () => {
  expect(ProfileSchema.safeParse(emptyProfile()).success).toBe(false);
});

const PROFILE_EDITS: { label: string; fields: Partial<Profile> }[] = [
  { label: "institution name", fields: { institutionName: "Fake Credit Union" } },
  { label: "city", fields: { city: "Fake City, CO" } },
  { label: "signed merchants", fields: { signedMerchantsText: "Fake Shop" } },
  { label: "business members", fields: { businessMembersText: "Fake Shop" } },
  { label: "removed categories", fields: { categoryPreferences: { removed: ["urn:tag:category:place:coffee_shop"], added: [] } } },
  { label: "added categories", fields: { categoryPreferences: { removed: [], added: ["urn:tag:category:place:coffee_shop"] } } },
  { label: "merchant status", fields: { merchantStatus: { "fake-merchant": { name: "Fake Shop", status: "signed", updatedAt: "2026-10-25" } } } },
  { label: "city memory", fields: { branchesByCity: { "Fake City, CO": emptyProfile().branches } } },
  { label: "no branches", fields: { branches: [] } },
  { label: "extra branch", fields: { branches: [...emptyProfile().branches, { ...emptyProfile().branches[0], id: "second-id" }] } },
];
it.each(PROFILE_EDITS)("requires confirmation after changing $label", ({ fields }) => {
  expect(isEmptyProfile({ ...emptyProfile(), ...fields })).toBe(false);
});

const BRANCH_EDITS: { label: string; fields: Partial<Branch> }[] = [
  { label: "name", fields: { name: "Fake Branch" } },
  { label: "address", fields: { address: "1 Example Lane" } },
  { label: "radius", fields: { radiusMeters: 1000 } },
  { label: "latitude", fields: { lat: 0 } },
  { label: "longitude", fields: { lon: 0 } },
  { label: "location source", fields: { locationSource: "map" } },
];
it.each(BRANCH_EDITS)("requires confirmation after changing the branch $label", ({ fields }) => {
  const blank = emptyProfile();
  expect(isEmptyProfile({ ...blank, branches: [{ ...blank.branches[0], ...fields }] })).toBe(false);
});
