// Tests geographic distances and numerical edge cases using hand-entered coordinates.
// Called by: npm test
import { describe, expect, it } from "vitest";
import { haversineMeters } from "@/lib/merchants/distance";

describe("great-circle distance", () => {
  const denver = { lat: 39.7392, lon: -104.9903 };
  const austin = { lat: 30.2672, lon: -97.7431 };
  it("matches Denver to Austin within the documented tolerance", () => {
    const distance = haversineMeters(denver, austin);
    expect(distance / 1000).toBeGreaterThan(1225);
    expect(distance / 1000).toBeLessThan(1255);
    expect(haversineMeters(austin, denver)).toBeCloseTo(distance, 6);
  });
  it("returns zero for identical points", () => {
    expect(haversineMeters(denver, denver)).toBe(0);
  });
  it("handles antimeridian and antipodal points", () => {
    expect(haversineMeters({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 })).toBeLessThan(23000);
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(20015086.8, 0);
  });
});
