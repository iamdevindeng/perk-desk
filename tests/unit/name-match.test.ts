// Checks merchant-name normalization and the minimum-length substring safeguard.
// Called by: npm test through the Vitest unit-test configuration.
import { describe, expect, it } from "vitest";
import { nameMatches, normalizeName } from "@/lib/merchants/name-match";

describe("normalizeName", () => {
  it("normalizes the documented name and repeated legal suffixes", () => {
    expect(normalizeName("The Bike & Run Co.")).toBe("bike and run");
    expect(normalizeName("The Fake Coffee Company LLC")).toBe("fake coffee");
    expect(normalizeName("Fake, Coffee! Inc.")).toBe("fake coffee");
  });

  it("handles compatibility characters, whitespace, and apostrophes", () => {
    expect(normalizeName("Ｔｈｅ Ｆａｋｅ Ｃａｆｅ")).toBe("fake cafe");
    expect(normalizeName("  The   Fake\tTea  Co. ")).toBe("fake tea");
    expect(normalizeName("Fake’s Books")).toBe(normalizeName("Fake's Books"));
    expect(normalizeName("Fake-Tea")).toBe("fake tea");
  });

  it("only removes standalone leading articles and trailing suffixes", () => {
    expect(normalizeName("Theater Fake")).toBe("theater fake");
    expect(normalizeName("Fake Company Store")).toBe("fake company store");
    expect(normalizeName("Fake Cocoa")).toBe("fake cocoa");
  });
});

describe("nameMatches", () => {
  it("matches normalized equals and long substrings in either direction", () => {
    expect(nameMatches("Sweet Fake Ice Cream", ["sweet fake ice cream llc"])).toBe(true);
    expect(nameMatches("Fake Coffee", ["The Fake Coffee Downtown"])).toBe(true);
    expect(nameMatches("Fake Coffee Downtown", ["Fake Coffee"])).toBe(true);
  });

  it("does not match a short substring or an empty name", () => {
    expect(nameMatches("Cafe", ["Cafe Fake Corner"])).toBe(false);
    expect(nameMatches("Cafe Fake Corner", ["Cafe"])).toBe(false);
    expect(nameMatches("", [""])).toBe(false);
    expect(nameMatches("Fake Coffee", ["", "  "])).toBe(false);
    expect(nameMatches("Fake Coffee", [])).toBe(false);
  });

  it("still matches short exact names", () => {
    expect(nameMatches("Tea", ["TEA"])).toBe(true);
  });
});
