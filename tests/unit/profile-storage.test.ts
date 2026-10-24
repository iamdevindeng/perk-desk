// Checks profile persistence under normal, corrupt, and unavailable storage.
// Called by: npm test with a small in-memory browser-storage substitute
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProfile, saveProfile } from "@/lib/profile-storage";
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
  it("round-trips a validated profile under the documented storage key", () => {
    saveProfile(FAKE_PROFILE);
    expect(values.has("perkdesk:v1:profile")).toBe(true);
    expect(loadProfile()).toEqual(FAKE_PROFILE);
  });

  it.each(["{broken", JSON.stringify({ institutionName: "Incomplete" }), "null"])("ignores invalid stored profile %s", (stored) => {
    values.set("perkdesk:v1:profile", stored);
    expect(loadProfile()).toBeNull();
  });

  it("preserves the last valid profile while a required field is temporarily empty", () => {
    saveProfile(FAKE_PROFILE);
    saveProfile({ ...FAKE_PROFILE, institutionName: "" });
    expect(loadProfile()).toEqual(FAKE_PROFILE);
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
