// Exercises branch search controls, selections, resets, and late responses with invented places.
// Called by: npm test; fetch is stubbed and every hook is rendered by the offline component harness
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProfileForm from "@/components/ProfileForm";
import { DEFAULT_RADIUS_M } from "@/lib/config";
import type { BranchLookupResponse, Profile } from "@/lib/types";
import { FAKE_PROFILE } from "../fixtures/fake-plan";
import { componentText, findComponents, renderComponents, resetComponents, type TestElement } from "../fixtures/component-harness";
import { flushPage, invoke } from "../fixtures/page-harness";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const fake = await import("../fixtures/component-harness");
  return { ...actual, useState: fake.componentState, useRef: fake.componentRef, useEffect: fake.componentEffect };
});

const fetchMock = vi.fn<typeof fetch>();
const previewChange = vi.fn<(places: BranchLookupResponse["places"]) => void>();
let profile: Profile;
let disabled: boolean;
let version: number;
let tree: TestElement;
function render(): void {
  tree = renderComponents(createElement(ProfileForm, { profile, disabled, branchLookupVersion: version,
    onChange: (updated) => { profile = updated; }, onPickBranch: vi.fn(), onPreviewChange: previewChange }));
}
function field(id: string): TestElement { return findComponents(tree, (element) => element.props.id === id)[0]; }
function button(label: string): TestElement {
  return findComponents(tree, (element) => element.type === "button" && componentText(element) === label)[0];
}
function checks(): TestElement[] { return findComponents(tree, (element) => element.props.type === "checkbox"); }
function edit(id: string, value: string): void { invoke(field(id).props.onChange, { target: { value } }); render(); }
function response(status: BranchLookupResponse["status"] = "found"): BranchLookupResponse {
  return { status, query: "Fake Community CU", cityLabel: "Fakeville, CO", suggestions: [],
    places: status === "found" ? Array.from({ length: 6 }, (_, index) => ({
      entityId: `00000000-0000-4000-8000-00000000000${index + 1}`, name: `Fake Community CU Branch ${index + 1}`,
      address: `${index + 1} Example Lane`, lat: 39 + index / 100, lon: -104, distanceMeters: (index + 1) * 1200,
    })) : [] };
}
async function search(body = response()): Promise<void> {
  fetchMock.mockResolvedValueOnce(Response.json(body));
  invoke(button("Find branches").props.onClick); await flushPage(); render();
}
beforeEach(() => {
  resetComponents(); vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  profile = structuredClone(FAKE_PROFILE); disabled = false; version = 0; render();
});
afterEach(() => { resetComponents(); vi.unstubAllGlobals(); });

it("follows the institution name until the search name is edited", () => {
  expect(field("branch-search-name").props.value).toBe(profile.institutionName);
  edit("institution-name", "Fake New Credit Union");
  expect(field("branch-search-name").props.value).toBe("Fake New Credit Union");
  edit("branch-search-name", "FNCU"); edit("institution-name", "Fake Later CU");
  expect(field("branch-search-name").props.value).toBe("FNCU");
});

it("shows the searched name and city, prechecks five nearest, and caps selection", async () => {
  const body = response(); body.places.reverse(); await search(body);
  expect(componentText(tree)).toContain('Searched Qloo for "Fake Community CU" within 50 km of Fakeville, CO.');
  expect(componentText(tree)).toContain("Found 6 locations. Select up to 5.");
  expect(componentText(tree)).toContain("1.2 km");
  expect(checks().map((checkbox) => checkbox.props.checked)).toEqual([true, true, true, true, true, false]);
  expect(previewChange).toHaveBeenLastCalledWith(response().places.slice(0, 5));
  expect(componentText(tree)).toContain("Checked locations are previewed on the map.");
  expect(checks()[5].props.disabled).toBe(true);
  invoke(checks()[0].props.onChange, { target: { checked: false } }); render();
  expect(previewChange).toHaveBeenLastCalledWith(response().places.slice(1, 5));
  expect(checks()[5].props.disabled).toBe(false);
  invoke(checks()[5].props.onChange, { target: { checked: true } }); render();
  expect(previewChange).toHaveBeenLastCalledWith(response().places.slice(1, 6));
  expect(checks()[0].props.disabled).toBe(true);
});

it("replaces branches in distance order with exact Qloo locations and keeps current profile edits", async () => {
  await search(); edit("institution-name", "Fake Updated CU");
  edit("signed-merchants", "Fake Already Signed Shop");
  invoke(button("Use selected branches").props.onClick);
  expect(previewChange).toHaveBeenLastCalledWith([]); render();
  expect(previewChange).toHaveBeenLastCalledWith([]);
  expect(profile.institutionName).toBe("Fake Updated CU");
  expect(profile.signedMerchantsText).toBe("Fake Already Signed Shop");
  expect(profile.branches).toEqual(response().places.slice(0, 5).map((place, index) => ({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: `Branch ${index + 1}`, address: place.address,
    lat: place.lat, lon: place.lon, radiusMeters: DEFAULT_RADIUS_M, locationSource: "qloo_place",
  })));
  expect(new Set(profile.branches.map((branch) => branch.id)).size).toBe(5);
  expect(componentText(tree)).toContain("Added 5 branches from Qloo. You can edit or remove them.");
  expect(checks()).toHaveLength(0);
  expect(profile).not.toHaveProperty("branchLookupVersion");
});

it("reruns suggestion names and explains the acronym mismatch", async () => {
  await search({ ...response("other_names"), suggestions: [{ name: "Fake Short CU", locations: 3 }] });
  expect(previewChange).toHaveBeenLastCalledWith([]);
  expect(componentText(tree)).toContain("No exact match. Qloo lists these credit unions and banks near Fakeville, CO.");
  expect(componentText(tree)).toContain("Tip: Qloo often lists the short name members use, such as an acronym.");
  fetchMock.mockResolvedValueOnce(Response.json({ ...response("none"), query: "Fake Short CU" }));
  invoke(button("Fake Short CU (3 locations)").props.onClick); await flushPage(); render();
  expect(field("branch-search-name").props.value).toBe("Fake Short CU");
  expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ name: "Fake Short CU", city: profile.city });
  expect(componentText(tree)).toContain('Searched Qloo for "Fake Short CU"');
});

it.each([
  ["none", "Your institution may not be listed yet, so add branches manually."],
  ["city_not_found", "We couldn't locate that city. Check the City, ST spelling."],
  ["limited", "Fake daily limit reached."],
] as const)("explains the %s status", async (status, message) => {
  await search({ ...response(status), message }); expect(componentText(tree)).toContain(message);
  expect(previewChange).toHaveBeenLastCalledWith([]);
  expect(findComponents(tree, (element) => element.props["aria-live"] === "polite")).toHaveLength(1);
});

it("shows requested query/city context with server error messages", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "upstream", message: "Fake service paused." }, { status: 502 }));
  invoke(button("Find branches").props.onClick); await flushPage(); render();
  expect(componentText(tree)).toContain('Searched Qloo for "Fake Community CU" within 50 km of Denver, CO.');
  expect(componentText(tree)).toContain("Fake service paused.");
  expect(previewChange).toHaveBeenLastCalledWith([]);
});

it("clears the panel on city change, keeps the edited name, and does not restore old results", async () => {
  edit("branch-search-name", "Fake Short CU"); await search();
  edit("profile-city", "Austin, TX");
  expect(previewChange).toHaveBeenLastCalledWith([]);
  expect(componentText(tree)).not.toContain("Searched Qloo");
  expect(field("branch-search-name").props.value).toBe("Fake Short CU");
  edit("profile-city", "Denver, CO"); expect(componentText(tree)).not.toContain("Searched Qloo");
});

it("clears results and the edited name when a same-city preset is applied", async () => {
  edit("branch-search-name", "Fake Short CU"); await search();
  version += 1; profile = { ...profile, institutionName: "Fake Preset CU" }; render();
  expect(previewChange).toHaveBeenLastCalledWith([]);
  expect(componentText(tree)).not.toContain("Searched Qloo");
  expect(field("branch-search-name").props.value).toBe("Fake Preset CU");
});

it.each(["city", "preset"])("aborts and ignores a late response after a %s reset", async (change) => {
  let finish!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  invoke(button("Find branches").props.onClick);
  expect(previewChange).toHaveBeenLastCalledWith([]); render();
  expect(button("Searching…").props.disabled).toBe(true);
  if (change === "city") edit("profile-city", "Austin, TX"); else { version += 1; render(); }
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  finish(Response.json(response())); await flushPage(); render();
  expect(componentText(tree)).not.toContain("Searched Qloo");
  expect(button("Find branches").props.disabled).toBe(false);
});

it("disables search for blank fields or a disabled form, and blocks a captured selection action", async () => {
  edit("branch-search-name", "  "); expect(button("Find branches").props.disabled).toBe(true);
  edit("branch-search-name", "Fake CU"); profile = { ...profile, city: " " }; render();
  expect(button("Find branches").props.disabled).toBe(true);
  profile = { ...profile, city: "Denver, CO" }; render(); await search();
  const useSelected = button("Use selected branches").props.onClick;
  const original = profile.branches; disabled = true; render();
  expect(button("Find branches").props.disabled).toBe(true);
  expect(checks().every((checkbox) => checkbox.props.disabled)).toBe(true);
  invoke(useSelected); expect(profile.branches).toBe(original);
});

it("clears a found preview as soon as another search starts, before its response", async () => {
  await search();
  let finish!: (value: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  invoke(button("Find branches").props.onClick); render();
  expect(previewChange).toHaveBeenLastCalledWith([]);
  finish(Response.json(response("none"))); await flushPage(); render();
  expect(previewChange).toHaveBeenLastCalledWith([]);
});

it("clears the preview on unmount and never puts candidates into the profile", async () => {
  const original = structuredClone(profile);
  await search();
  expect(profile).toEqual(original);
  resetComponents();
  expect(previewChange).toHaveBeenLastCalledWith([]);
});
