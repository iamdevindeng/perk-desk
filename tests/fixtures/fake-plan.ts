// Supplies hand-written fictional inputs and outputs; contains no Qloo response data.
// Called by: schema, agent, route, and client unit tests
import type {
  Branch, BrandCandidate, CategoryEvidence, CategoryReport, CityList, MerchantResult,
  Place, PlannedCategory, PlanRequest, PlanResponse, Preset, Profile, ResolvedBrand,
  RunRequest, RunResult, TagRef, TraceEvent,
} from "@/lib/types";

export const FAKE_BRAND_ID = "00000000-0000-4000-8000-000000000001";
export const FAKE_PLACE_ID = "00000000-0000-4000-8000-000000000002";
export const FAKE_CATEGORY_ID = "urn:tag:category:place:coffee_shop";
export const FAKE_BRANCH = {
  id: "fake-central", name: "Fake Central Branch", address: "1 Example Lane",
  lat: 39.75, lon: -104.99, radiusMeters: 6000, locationSource: "map",
} satisfies Branch;
export const FAKE_PROFILE = {
  institutionName: "Fake Community CU", city: "Denver, CO", branches: [FAKE_BRANCH],
  signedMerchantsText: "", businessMembersText: "", categoryPreferences: { removed: [], added: [] }, merchantStatus: {},
} satisfies Profile;
export const FAKE_TAG = {
  id: "urn:tag:genre:brand:coffee", name: "Coffee", type: "urn:tag:genre:brand",
} satisfies TagRef;
export const FAKE_BRAND = {
  entityId: FAKE_BRAND_ID, name: "Fake Coffee Co", popularity: 0.4,
  shortDescription: "A fictional coffee brand.", tags: [FAKE_TAG],
} satisfies BrandCandidate;
export const FAKE_RESOLVED_BRAND = {
  inputName: FAKE_BRAND.name, entityId: FAKE_BRAND_ID, name: FAKE_BRAND.name,
  shortDescription: FAKE_BRAND.shortDescription, matchKind: "exact",
  candidates: [{ entityId: FAKE_BRAND_ID, name: FAKE_BRAND.name, popularity: 0.4, shortDescription: FAKE_BRAND.shortDescription }],
} satisfies ResolvedBrand;
export const FAKE_EVIDENCE = {
  brandEntityId: FAKE_BRAND_ID, brandName: FAKE_BRAND.name, brandTagId: FAKE_TAG.id,
  brandTagName: FAKE_TAG.name, reason: "Coffee interests support looking for a local coffee shop.",
} satisfies CategoryEvidence;
export const FAKE_CATEGORY = {
  tagId: FAKE_CATEGORY_ID, label: "Coffee shop", evidence: [FAKE_EVIDENCE], source: "agent", knownIndependents: 8,
} satisfies PlannedCategory;
export const FAKE_PLAN_REQUEST = {
  institutionName: FAKE_PROFILE.institutionName, city: FAKE_PROFILE.city, branches: [FAKE_BRANCH],
  brandNames: [FAKE_BRAND.name], brandOverrides: {}, preferences: { removed: [], added: [] },
} satisfies PlanRequest;
export const FAKE_PLACE = {
  entityId: FAKE_PLACE_ID, name: "Fake Corner Cafe", address: "2 Example Lane", lat: 39.751, lon: -104.99,
  phone: "555-0100", website: "https://example.invalid/cafe", hoursText: "Monday–Friday: 8am–5pm",
  googlePlaceId: "fake-google-place", businessRating: 4.5, tripadvisorRating: 4, tripadvisorCount: 12,
  priceLevel: 2, primaryGenreId: "urn:tag:genre:place:coffee_shop", description: "A fictional neighborhood cafe.",
  uniqueSellingPoint: "A quiet reading corner.", isClosed: false, affinity: 0.1,
  explain: [{ entityId: FAKE_BRAND_ID, score: 0.1 }],
} satisfies Place;
export const FAKE_MERCHANT = {
  place: FAKE_PLACE, categoryTagId: FAKE_CATEGORY_ID, categoryLabel: "Coffee shop",
  branchId: FAKE_BRANCH.id, branchName: FAKE_BRANCH.name, distanceMeters: 111,
  tasteSignal: true, seededRank: 1, baselineRank: 3, rankLift: 2,
  brandShares: [{ brandName: FAKE_BRAND.name, sharePercent: 100 }],
  multiLocation: false, businessMember: false, score: 0.8,
  pitch: "Fake Corner Cafe is near Fake Central Branch. Members enjoy coffee brands. Discuss a local member offer.",
  pitchSource: "template", googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Fake+Corner+Cafe",
} satisfies MerchantResult;
export const FAKE_CATEGORY_REPORT = {
  tagId: FAKE_CATEGORY_ID, label: "Coffee shop", independentCount: 8, status: "ok",
} satisfies CategoryReport;
export const FAKE_RUN_REQUEST = {
  institutionName: FAKE_PROFILE.institutionName, city: FAKE_PROFILE.city, branches: [FAKE_BRANCH],
  brands: [{ entityId: FAKE_BRAND_ID, name: FAKE_BRAND.name }],
  categories: [{ tagId: FAKE_CATEGORY_ID, label: "Coffee shop" }],
  signedNames: [], businessMemberNames: [], excludeEntityIds: [],
} satisfies RunRequest;
export const FAKE_RUN_RESULT = {
  mode: "agent", merchants: [FAKE_MERCHANT], categories: [FAKE_CATEGORY_REPORT],
  excludedCounts: { nationalChain: 0, noiseGenre: 0, closed: 0, signedOrExcluded: 0 },
  qlooCalls: 2, durationMs: 100, warnings: [],
} satisfies RunResult;
export const FAKE_TRACE_EVENTS: TraceEvent[] = [
  { type: "step", at: 0, step: "resolve_brands", status: "start", summary: "Resolving brands" },
  { type: "tool_call", at: 1, tool: "resolveBrands", summary: "Find Fake Coffee Co" },
  { type: "tool_result", at: 2, tool: "resolveBrands", summary: "Found one brand" },
  { type: "qloo_call", at: 3, endpoint: "/search", summary: "Brand search", ms: 1, cached: false },
  { type: "agent_note", at: 4, text: "The coffee category matches the brand tag." },
  { type: "guard", at: 5, layer: 1, summary: "Category is a valid candidate" },
  { type: "fallback", at: 6, reason: "Agent unavailable" },
  { type: "limited", at: 7, message: "Live-run limit reached" },
  { type: "result", at: 8, result: FAKE_RUN_RESULT },
  { type: "error", at: 9, code: "upstream", message: "Please try again" },
  { type: "done", at: 10 },
];
export const FAKE_PLAN_RESPONSE = {
  mode: "agent", limited: false, city: { label: "Denver, CO", lat: 39.75, lon: -104.99 },
  branches: [FAKE_BRANCH], brands: [FAKE_RESOLVED_BRAND], unresolved: [], categories: [FAKE_CATEGORY],
  candidateCategories: [{ tagId: FAKE_CATEGORY_ID, label: "Coffee shop" }], trace: [], warnings: [],
} satisfies PlanResponse;
export const FAKE_PRESET = {
  id: "fake-demo", label: "Fake CU demo", profile: FAKE_PROFILE, brandsText: FAKE_BRAND.name,
} satisfies Preset;
export const FAKE_CITY_LIST = {
  cities: [{ label: "Denver, CO", lat: 39.75, lon: -104.99, zoom: 12 }],
} satisfies CityList;
