// Checks profile persistence under normal, corrupt, and unavailable storage.
// Called by: npm test with a small in-memory browser-storage substitute
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProfile, loadProfile, rememberBranchesByCity, saveProfile } from "@/lib/profile-storage";
import { FAKE_PROFILE } from "../fixtures/fake-plan";

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("browser profile storage", () => {
  it("loads an old saved profile with an empty branch memory", () => {
    const oldProfile = Object.fromEntries(Object.entries(FAKE_PROFILE).filter(([key]) => key !== "branchesByCity"));
    values.set("perkdesk:v1:profile", JSON.stringify(oldProfile));
    expect(loadProfile()).toEqual({ ...FAKE_PROFILE, branchesByCity: {} });
  });

  it("round-trips saved branches and their city order", () => {
    const profile = { ...FAKE_PROFILE, branchesByCity: {
      "Austin, TX": [{ ...FAKE_PROFILE.branches[0], id: "fake-austin", name: "Fake Austin Branch" }],
      "Denver, CO": FAKE_PROFILE.branches,
    } };
    saveProfile(profile);
    expect(loadProfile()).toEqual(profile);
    expect(Object.keys(loadProfile()!.branchesByCity)).toEqual(["Austin, TX", "Denver, CO"]);
  });

  it("round-trips a validated profile under the documented storage key", () => {
    saveProfile(FAKE_PROFILE);
    expect(values.has("perkdesk:v1:profile")).toBe(true);
    expect(loadProfile()).toEqual(FAKE_PROFILE);
  });

  it("saves valid current branches alongside an unfinished historical branch name", () => {
    const profile = { ...FAKE_PROFILE, branchesByCity: {
      "Austin, TX": [{ ...FAKE_PROFILE.branches[0], name: "" }],
    } };
    saveProfile(profile);
    expect(loadProfile()).toEqual(profile);
    const restored = { ...profile, city: "Austin, TX", branches: profile.branchesByCity["Austin, TX"] };
    saveProfile(restored);
    expect(loadProfile()).toEqual(restored);
    const completed = { ...restored, branches: [{ ...restored.branches[0], name: "Fake Completed Branch" }] };
    saveProfile(completed);
    expect(loadProfile()).toEqual(completed);
  });

  it.each([
    { name: "x".repeat(81) }, { address: "x".repeat(201) }, { lat: 91 }, { lon: 181 },
    { radiusMeters: 999 }, { radiusMeters: 20001 }, { id: "" },
  ])("still rejects malformed historical branch fields: %j", (invalidFields) => {
    saveProfile(FAKE_PROFILE);
    const profile = { ...FAKE_PROFILE, branchesByCity: {
      "Austin, TX": [{ ...FAKE_PROFILE.branches[0], ...invalidFields }],
    } };
    saveProfile(profile);
    expect(loadProfile()).toEqual(FAKE_PROFILE);
    values.set("perkdesk:v1:profile", JSON.stringify(profile));
    expect(loadProfile()).toBeNull();
  });

  it.each([0, 6])("still rejects a historical city with %i branches", (count) => {
    saveProfile(FAKE_PROFILE);
    saveProfile({ ...FAKE_PROFILE, branchesByCity: {
      "Austin, TX": Array.from({ length: count }, () => ({ ...FAKE_PROFILE.branches[0], name: "" })),
    } });
    expect(loadProfile()).toEqual(FAKE_PROFILE);
  });

  it.each(["{broken", JSON.stringify({ institutionName: "Incomplete" }), "null"])("ignores invalid stored profile %s", (stored) => {
    values.set("perkdesk:v1:profile", stored);
    expect(loadProfile()).toBeNull();
  });

  it("persists a temporarily empty required field as a browser draft", () => {
    saveProfile(FAKE_PROFILE);
    saveProfile({ ...FAKE_PROFILE, institutionName: "" });
    expect(loadProfile()).toEqual({ ...FAKE_PROFILE, institutionName: "" });
  });

  it("overwrites the profile with a saved blank and preserves unrelated storage", () => {
    saveProfile({ ...FAKE_PROFILE, branchesByCity: { "Fake City, CO": FAKE_PROFILE.branches },
      merchantStatus: { "fake-merchant": { name: "Fake Shop", status: "signed", updatedAt: "2026-10-25" } } });
    values.set("unrelated-key", "unrelated-value");
    saveProfile(emptyProfile());
    expect(loadProfile()).toEqual(emptyProfile());
    expect(JSON.parse(values.get("perkdesk:v1:profile")!)).toEqual(emptyProfile());
    expect(values.get("unrelated-key")).toBe("unrelated-value");
    expect([...values.keys()]).toEqual(["perkdesk:v1:profile", "unrelated-key"]);
  });

  it("persists incomplete editable drafts but rejects malformed field values", () => {
    saveProfile(emptyProfile());
    saveProfile({ ...emptyProfile(), city: "Fake City, CO" });
    expect(loadProfile()).toEqual({ ...emptyProfile(), city: "Fake City, CO" });
    const draft = { ...FAKE_PROFILE, branches: [{ ...FAKE_PROFILE.branches[0], name: "" }] };
    saveProfile(draft);
    expect(loadProfile()).toEqual(draft);
    saveProfile({ ...draft, branches: [{ ...draft.branches[0], radiusMeters: 0 }] });
    expect(loadProfile()).toEqual(draft);
  });

  it("is safe during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(loadProfile()).toBeNull();
    expect(() => saveProfile(FAKE_PROFILE)).not.toThrow();
  });

  it("ignores blocked storage getters and write-quota errors", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("Blocked"); } });
    expect(loadProfile()).toBeNull();
    expect(() => saveProfile(FAKE_PROFILE)).not.toThrow();
    vi.stubGlobal("window", { localStorage: { setItem: () => { throw new Error("Full"); } } });
    expect(() => saveProfile(FAKE_PROFILE)).not.toThrow();
  });
});

describe("branch memory", () => {
  it("saves current branches under the trimmed city without mutating previous memory", () => {
    const previous = { "Austin, TX": [{ ...FAKE_PROFILE.branches[0], name: "Fake Austin Branch" }] };
    const profile = { ...FAKE_PROFILE, city: " Denver, CO ", branchesByCity: previous };
    const memory = rememberBranchesByCity(profile);
    expect(memory).toEqual({ ...previous, "Denver, CO": profile.branches });
    expect(profile.branchesByCity).toEqual(previous);
    expect(Object.keys(previous)).toEqual(["Austin, TX"]);
  });

  it.each(["", "   "])("does not save an empty current city %j", (city) => {
    const branchesByCity = { "Denver, CO": FAKE_PROFILE.branches };
    expect(rememberBranchesByCity({ ...FAKE_PROFILE, city, branchesByCity })).toEqual(branchesByCity);
  });

  it("drops only the oldest saved city when adding an eleventh", () => {
    const branchesByCity = Object.fromEntries(Array.from({ length: 10 }, (_, index) =>
      [`Fake City ${index}, CO`, FAKE_PROFILE.branches]));
    const memory = rememberBranchesByCity({ ...FAKE_PROFILE, branchesByCity });
    expect(Object.keys(memory)).toEqual([...Object.keys(branchesByCity).slice(1), "Denver, CO"]);
    expect(memory["Denver, CO"]).toEqual(FAKE_PROFILE.branches);
    expect(Object.keys(branchesByCity)).toHaveLength(10);
    expect(branchesByCity["Fake City 0, CO"]).toEqual(FAKE_PROFILE.branches);
  });

  it("updates a saved city as the newest entry before applying the cap", () => {
    const branchesByCity = Object.fromEntries(Array.from({ length: 10 }, (_, index) =>
      [`Fake City ${index}, CO`, FAKE_PROFILE.branches]));
    const branches = [{ ...FAKE_PROFILE.branches[0], name: "Fake Updated Branch" }];
    const refreshed = rememberBranchesByCity({ ...FAKE_PROFILE, city: "Fake City 0, CO", branches, branchesByCity });
    expect(Object.keys(refreshed)).toEqual([...Object.keys(branchesByCity).slice(1), "Fake City 0, CO"]);
    const memory = rememberBranchesByCity({ ...FAKE_PROFILE, branchesByCity: refreshed });
    expect(Object.keys(memory)).toHaveLength(10);
    expect(memory).not.toHaveProperty("Fake City 1, CO");
    expect(memory["Fake City 0, CO"]).toEqual(branches);
  });
});
