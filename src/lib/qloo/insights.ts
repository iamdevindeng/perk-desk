// Fetches nearby places and approximate localities, keeping only documented slim fields.
// Called by: agent location resolution, merchant research, and tests/unit/qloo-insights.test.ts
import { z } from "zod";
import { INSIGHTS_TAKE } from "@/lib/config";
import { EntityIdSchema, PlaceSchema, type Place } from "@/lib/types";
import { cachedQlooCall, type QlooCallOptions } from "@/lib/qloo/client";

const OPTIONAL_TEXT = z.string().optional().catch(undefined);
const OPTIONAL_NUMBER = z.number().optional().catch(undefined);
const PointSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const PropertiesSchema = z.object({
  address: OPTIONAL_TEXT, phone: OPTIONAL_TEXT, website: OPTIONAL_TEXT, hours: z.unknown().optional(),
  is_closed: z.boolean().catch(false), business_rating: OPTIONAL_NUMBER, price_level: OPTIONAL_NUMBER,
  short_description: OPTIONAL_TEXT, description: OPTIONAL_TEXT, unique_selling_points: OPTIONAL_TEXT,
  primary_genre: z.object({ id: OPTIONAL_TEXT }).catch({}),
});
const ContributionSchema = z.object({ entity_id: z.string(), score: z.number() });
const QuerySchema = z.object({
  affinity: OPTIONAL_NUMBER,
  explainability: z.object({
    "signal.interests.entities": z.array(ContributionSchema.nullable().catch(null)).catch([]),
  }).catch({ "signal.interests.entities": [] }),
});
const ExternalSchema = z.object({
  google_place: z.array(z.object({ place_id: OPTIONAL_TEXT }).catch({})).catch([]),
  tripadvisor: z.array(z.object({ rating: OPTIONAL_NUMBER, rating_count: OPTIONAL_NUMBER }).catch({})).catch([]),
});
const RawPlaceSchema = z.object({
  entity_id: EntityIdSchema, name: z.string().trim().min(1), location: PointSchema,
  properties: PropertiesSchema.catch({ is_closed: false, primary_genre: {} }),
  external: ExternalSchema.catch({ google_place: [], tripadvisor: [] }),
  query: QuerySchema.catch({ explainability: { "signal.interests.entities": [] } }),
});
const LocalitySchema = PointSchema.extend({ name: z.string() });
const ResultsSchema = z.object({ entities: z.array(z.unknown()) });
type Locality = z.infer<typeof LocalitySchema>;
type PlaceQuery = { lat: number; lon: number; radiusMeters: number; tagId: string; brandIds: string[] };
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function slimPlace(raw: unknown): Place | null {
  const parsed = RawPlaceSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { entity_id, name, location, properties, external, query } = parsed.data;
  const contributions = query.explainability["signal.interests.entities"];
  const place = {
    entityId: entity_id, name, lat: location.lat, lon: location.lon, address: properties.address ?? "",
    phone: properties.phone, website: properties.website, hoursText: formatHours(properties.hours),
    googlePlaceId: external.google_place[0]?.place_id, businessRating: properties.business_rating,
    tripadvisorRating: external.tripadvisor[0]?.rating, tripadvisorCount: external.tripadvisor[0]?.rating_count,
    priceLevel: properties.price_level, primaryGenreId: properties.primary_genre.id,
    description: properties.short_description ?? properties.description,
    uniqueSellingPoint: properties.unique_selling_points, isClosed: properties.is_closed,
    affinity: query.affinity,
    explain: contributions.flatMap((entry) => entry ? [{ entityId: entry.entity_id, score: entry.score }] : []),
  };
  // Optional upstream nulls and unknown fields must not survive into cache values. See QLOO_API.md §8.
  return PlaceSchema.parse(Object.fromEntries(Object.entries(place).filter(([, value]) => value !== undefined)));
}

function slimPlaces(raw: unknown): Place[] {
  const response = z.object({ success: z.literal(true).optional(), results: ResultsSchema }).parse(raw);
  return response.results.entities.flatMap((entity) => {
    const place = slimPlace(entity);
    return place ? [place] : [];
  });
}

export async function findPlaces(query: PlaceQuery, options: QlooCallOptions = {}): Promise<Place[]> {
  const params: Record<string, string | number | boolean> = {
    "filter.type": "urn:entity:place", "filter.location": `POINT(${query.lon} ${query.lat})`,
    "filter.location.radius": query.radiusMeters, "filter.tags": query.tagId, take: INSIGHTS_TAKE,
  };
  if (query.brandIds.length > 0) {
    params["signal.interests.entities"] = query.brandIds.join(",");
    params["feature.explainability"] = true;
  }
  return cachedQlooCall("/v2/insights", params, slimPlaces, z.array(PlaceSchema), options);
}

function slimLocality(raw: unknown): Locality | null {
  const response = z.object({
    success: z.literal(true).optional(), results: ResultsSchema.optional(),
    query: z.object({ localities: z.object({ filter: z.array(z.unknown()).optional() }).optional() }).optional(),
  }).refine((value) => value.results !== undefined || value.query !== undefined).parse(raw);
  // Valid responses with missing/empty localities remain unresolved. See QLOO_API.md §5.
  const locality = z.object({ name: z.string(), location: PointSchema }).safeParse(response.query?.localities?.filter?.[0]);
  if (!locality.success) return null;
  return { name: locality.data.name, ...locality.data.location };
}

export async function resolveLocality(query: string, options: QlooCallOptions = {}): Promise<Locality | null> {
  if (!query.trim()) return null;
  const params = { "filter.type": "urn:entity:place", "filter.location.query": query.trim(), take: 1 };
  // Address lookups return approximate district centers, not street-level coordinates. See QLOO_API.md §5.
  return cachedQlooCall("/v2/insights", params, slimLocality, LocalitySchema.nullable(), options);
}

function formatInterval(raw: unknown): string | undefined {
  const interval = z.object({ closed: z.boolean().optional(), opens: OPTIONAL_TEXT, closes: OPTIONAL_TEXT }).safeParse(raw);
  if (!interval.success) return undefined;
  if (interval.data.closed) return "closed";
  const clockPattern = /^T?((?:[01]\d|2[0-3]):[0-5]\d)(?::[0-5]\d)?$/;
  const opens = clockPattern.exec(interval.data.opens ?? "")?.[1];
  // Midnight at the end of a day may use 24:00, but opening times still use the ordinary clock.
  const closes = clockPattern.exec(interval.data.closes ?? "")?.[1]
    ?? (/^T?24:00(?::00)?$/.test(interval.data.closes ?? "") ? "24:00" : undefined);
  return opens && closes ? `${opens}–${closes}` : undefined;
}

function formatDay(raw: unknown): string | undefined {
  const parsed = z.array(z.unknown()).min(1).safeParse(raw);
  if (!parsed.success) return undefined;
  const intervals = parsed.data.map(formatInterval);
  if (intervals.some((interval) => interval === undefined)) return undefined;
  const openIntervals = intervals.filter((interval) => interval !== "closed");
  return openIntervals.length ? openIntervals.join(", ") : "closed";
}

export function formatHours(hours: unknown): string | undefined {
  const parsed = z.record(z.string(), z.unknown()).safeParse(hours);
  if (!parsed.success) return undefined;
  const groups: { start: number; end: number; hours: string }[] = [];
  for (const [index, day] of DAYS.entries()) {
    if (parsed.data[day] === undefined) continue;
    const dayHours = formatDay(parsed.data[day]);
    if (!dayHours) return undefined;
    const previous = groups.at(-1);
    if (previous && previous.end === index - 1 && previous.hours === dayHours) {
      previous.end = index;
    } else {
      groups.push({ start: index, end: index, hours: dayHours });
    }
  }
  if (!groups.length) return undefined;
  // Unlisted days are unknown, so a partial schedule cannot claim all-week opening (FIXES-R7 R35).
  const allDaysPresent = DAYS.every((day) => parsed.data[day] !== undefined);
  if (allDaysPresent && groups.every((group) => group.hours === "00:00–00:00" || group.hours === "00:00–24:00")) return "Open 24 hours";
  return groups.map((group) => {
    const dayRange = group.start === group.end ? DAY_LABELS[group.start] : `${DAY_LABELS[group.start]}–${DAY_LABELS[group.end]}`;
    return `${dayRange} ${group.hours}`;
  }).join(" · ");
}
