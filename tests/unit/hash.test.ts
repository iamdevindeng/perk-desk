// Verifies cache key stability without reordering meaningful array inputs.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { cacheKey, canonicalJson, citySlug, sha256Hex } from "@/lib/hash";

describe("canonical cache keys", () => {
  it("sorts nested object keys independently of insertion order", () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } }))
      .toBe(canonicalJson({ a: { c: 2, d: 1 }, b: 1 }));
    expect(cacheKey("plan", { a: 1, b: 2 })).toBe(cacheKey("plan", { b: 2, a: 1 }));
  });
  it("preserves array order and JSON scalar semantics", () => {
    expect(canonicalJson([2, 1, null, true, "quoted\"text"])).toBe('[2,1,null,true,"quoted\\\"text"]');
    expect(cacheKey("run", [1, 2])).not.toBe(cacheKey("run", [2, 1]));
    expect(canonicalJson({ absent: undefined, present: null })).toBe('{"present":null}');
    expect(canonicalJson([undefined])).toBe("[null]");
  });
  it("uses SHA-256 and namespaced keys", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(cacheKey("qloo", { path: "/search" })).toMatch(/^pd:v1:qloo:[a-f0-9]{64}$/);
    expect(cacheKey("plan", {})).not.toBe(cacheKey("run", {}));
  });
  it("normalizes city labels for density keys", () => {
    expect(citySlug("Denver, CO")).toBe("denver-co");
    expect(citySlug("  Austin, TX  ")).toBe("austin-tx");
  });
});
