// Calculates great-circle distances between geographic points in meters.
// Called by: merchant scoring and tests/unit/distance.test.ts
import { EARTH_RADIUS_M } from "@/lib/config";

type Point = { lat: number; lon: number };

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function haversineMeters(first: Point, second: Point): number {
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lon - first.lon);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  // Clamp rounding noise near antipodal points so square roots stay defined.
  const bounded = Math.max(0, Math.min(1, haversine));
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}
