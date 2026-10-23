// Defines validated shared shapes for profiles, Qloo data, plans, runs, and trace events.
// Called by: server boundaries, client state, data loaders, and schema tests
import { z } from "zod";
import { DEFAULT_RADIUS_M, RUN_MAX_CATEGORIES } from "@/lib/config";

export const CategoryTagIdSchema = z.string().regex(/^urn:tag:category:place:[a-z0-9_]+$/);
export const EntityIdSchema = z.string().min(8).max(64);
export const BranchSchema = z.object({
  id: z.string().min(1).max(40), name: z.string().min(1).max(80), address: z.string().max(200).default(""),
  lat: z.number().min(-90).max(90).optional(), lon: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().min(1000).max(20000).default(DEFAULT_RADIUS_M),
  locationSource: z.enum(["preset", "map", "qloo_locality"]).optional(),
});
export const CategoryPreferencesSchema = z.object({
  removed: z.array(CategoryTagIdSchema).max(50), added: z.array(CategoryTagIdSchema).max(50),
});
export const MerchantStatusSchema = z.enum(["to_contact", "contacted", "signed", "not_a_fit"]);
export const MerchantStatusEntrySchema = z.object({ name: z.string(), status: MerchantStatusSchema, updatedAt: z.string() });
export const ProfileSchema = z.object({
  institutionName: z.string().min(1).max(100), city: z.string().min(2).max(80),
  branches: z.array(BranchSchema).min(1).max(5),
  signedMerchantsText: z.string().max(20000).default(""), businessMembersText: z.string().max(20000).default(""),
  categoryPreferences: CategoryPreferencesSchema.default({ removed: [], added: [] }),
  merchantStatus: z.record(z.string(), MerchantStatusEntrySchema).default({}),
});

export const TagRefSchema = z.object({ id: z.string(), name: z.string(), type: z.string() });
export const CategoryTagSchema = z.object({ tagId: CategoryTagIdSchema, label: z.string() });
export const BrandCandidateSchema = z.object({
  entityId: EntityIdSchema, name: z.string(), popularity: z.number(),
  shortDescription: z.string().default(""), tags: z.array(TagRefSchema),
});
export const PlaceSchema = z.object({
  entityId: EntityIdSchema, name: z.string(), address: z.string().default(""), lat: z.number(), lon: z.number(),
  phone: z.string().optional(), website: z.string().optional(), hoursText: z.string().optional(),
  googlePlaceId: z.string().optional(), businessRating: z.number().optional(),
  tripadvisorRating: z.number().optional(), tripadvisorCount: z.number().optional(), priceLevel: z.number().optional(),
  primaryGenreId: z.string().optional(), description: z.string().optional(), uniqueSellingPoint: z.string().optional(),
  isClosed: z.boolean().default(false), affinity: z.number().optional(),
  explain: z.array(z.object({ entityId: z.string(), score: z.number() })).default([]),
});

export const ResolvedBrandSchema = z.object({
  inputName: z.string(), entityId: EntityIdSchema, name: z.string(), shortDescription: z.string(),
  matchKind: z.enum(["exact", "prefix", "agent", "user", "fallback"]),
  candidates: z.array(BrandCandidateSchema.omit({ tags: true })).max(3),
});
export const CategoryEvidenceSchema = z.object({
  brandEntityId: EntityIdSchema, brandName: z.string(), brandTagId: z.string(),
  brandTagName: z.string(), reason: z.string().max(200),
});
export const PlannedCategorySchema = z.object({
  tagId: CategoryTagIdSchema, label: z.string(), evidence: z.array(CategoryEvidenceSchema).min(1),
  source: z.enum(["agent", "fallback"]), knownIndependents: z.number().int().optional(),
});
export const PlanRequestSchema = z.object({
  presetId: z.string().optional(), institutionName: z.string().min(1).max(100), city: z.string().min(2).max(80),
  branches: z.array(BranchSchema).min(1).max(5), brandNames: z.array(z.string().min(1).max(80)).min(1).max(10),
  brandOverrides: z.record(z.string(), EntityIdSchema).default({}),
  preferences: CategoryPreferencesSchema.default({ removed: [], added: [] }),
});

export const RunRequestSchema = z.object({
  presetId: z.string().optional(), institutionName: z.string().min(1).max(100), city: z.string(),
  branches: z.array(BranchSchema.extend({ lat: z.number(), lon: z.number() })).min(1).max(5),
  brands: z.array(z.object({ entityId: EntityIdSchema, name: z.string() })).min(1).max(10),
  categories: z.array(CategoryTagSchema).min(1).max(RUN_MAX_CATEGORIES),
  signedNames: z.array(z.string().max(120)).max(500).default([]),
  businessMemberNames: z.array(z.string().max(120)).max(500).default([]),
  excludeEntityIds: z.array(z.string()).max(500).default([]),
});
export const MerchantResultSchema = z.object({
  place: PlaceSchema, categoryTagId: CategoryTagIdSchema, categoryLabel: z.string(),
  branchId: z.string(), branchName: z.string(), distanceMeters: z.number(), tasteSignal: z.boolean(),
  seededRank: z.number().int().nullable(), baselineRank: z.number().int().nullable(), rankLift: z.number().int().nullable(),
  brandShares: z.array(z.object({ brandName: z.string(), sharePercent: z.number().int() })),
  multiLocation: z.boolean(), businessMember: z.boolean(), score: z.number(),
  pitch: z.string(), pitchSource: z.enum(["agent", "template"]), googleMapsUrl: z.string(),
});
// Internal research candidates carry ranking inputs until the shortlist adds a pitch.
export const MerchantCandidateSchema = MerchantResultSchema.omit({ pitch: true, pitchSource: true, googleMapsUrl: true }).extend({
  radiusMeters: z.number(), baselineLength: z.number().int(), affinity: z.number().nullable(),
  explain: PlaceSchema.shape.explain,
});
export const CategoryReportSchema = z.object({
  tagId: CategoryTagIdSchema, label: z.string(), independentCount: z.number().int(),
  status: z.enum(["ok", "thin", "replaced"]), replacedBy: CategoryTagIdSchema.optional(),
});
export const RunResultSchema = z.object({
  mode: z.enum(["agent", "fallback"]), merchants: z.array(MerchantResultSchema), categories: z.array(CategoryReportSchema),
  excludedCounts: z.object({ nationalChain: z.number(), noiseGenre: z.number(), closed: z.number(), signedOrExcluded: z.number() }),
  qlooCalls: z.number().int(), durationMs: z.number().int(), warnings: z.array(z.string()),
});

// Trace depends on RunResult; PlanResponse depends on Trace. See ARCHITECTURE.md §3.
export const StepIdSchema = z.enum(["resolve_brands", "pick_categories", "find_merchants", "filter_score", "data_check", "rank_pitch"]);
export const ErrorCodeSchema = z.enum(["bad_request", "config", "auth", "quota", "upstream", "timeout", "no_brands", "internal"]);
export const TraceEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), at: z.number(), step: StepIdSchema, status: z.enum(["start", "done"]), summary: z.string().max(200) }),
  z.object({ type: z.literal("tool_call"), at: z.number(), tool: z.string(), summary: z.string().max(200) }),
  z.object({ type: z.literal("tool_result"), at: z.number(), tool: z.string(), summary: z.string().max(200) }),
  z.object({ type: z.literal("qloo_call"), at: z.number(), endpoint: z.enum(["/search", "/v2/tags", "/v2/insights"]), summary: z.string().max(200), ms: z.number(), cached: z.boolean() }),
  z.object({ type: z.literal("agent_note"), at: z.number(), text: z.string() }),
  z.object({ type: z.literal("guard"), at: z.number(), layer: z.union([z.literal(1), z.literal(2)]), summary: z.string().max(200) }),
  z.object({ type: z.literal("fallback"), at: z.number(), reason: z.string() }),
  z.object({ type: z.literal("limited"), at: z.number(), message: z.string() }),
  z.object({ type: z.literal("result"), at: z.number(), result: RunResultSchema }),
  z.object({ type: z.literal("error"), at: z.number(), code: ErrorCodeSchema, message: z.string() }),
  z.object({ type: z.literal("done"), at: z.number() }),
]);
export const PlanResponseSchema = z.object({
  mode: z.enum(["agent", "fallback"]), limited: z.boolean().default(false), message: z.string().optional(),
  city: z.object({ label: z.string(), lat: z.number(), lon: z.number() }).optional(),
  branches: z.array(BranchSchema), brands: z.array(ResolvedBrandSchema), unresolved: z.array(z.string()),
  categories: z.array(PlannedCategorySchema), candidateCategories: z.array(CategoryTagSchema),
  trace: z.array(TraceEventSchema), warnings: z.array(z.string()),
});
export const PresetSchema = z.object({
  id: z.string(), label: z.string(), brandsText: z.string(),
  profile: ProfileSchema.pick({ institutionName: true, city: true, branches: true, signedMerchantsText: true, businessMembersText: true }),
});
export const CityListSchema = z.object({ cities: z.array(z.object({ label: z.string(), lat: z.number(), lon: z.number(), zoom: z.number().int() })) });

export type CategoryTagId = z.infer<typeof CategoryTagIdSchema>;
export type EntityId = z.infer<typeof EntityIdSchema>;
export type Branch = z.infer<typeof BranchSchema>;
export type CategoryPreferences = z.infer<typeof CategoryPreferencesSchema>;
export type MerchantStatus = z.infer<typeof MerchantStatusSchema>;
export type MerchantStatusEntry = z.infer<typeof MerchantStatusEntrySchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type TagRef = z.infer<typeof TagRefSchema>;
export type CategoryTag = z.infer<typeof CategoryTagSchema>;
export type BrandCandidate = z.infer<typeof BrandCandidateSchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type ResolvedBrand = z.infer<typeof ResolvedBrandSchema>;
export type CategoryEvidence = z.infer<typeof CategoryEvidenceSchema>;
export type PlannedCategory = z.infer<typeof PlannedCategorySchema>;
export type PlanRequest = z.infer<typeof PlanRequestSchema>;
export type RunRequest = z.infer<typeof RunRequestSchema>;
export type MerchantResult = z.infer<typeof MerchantResultSchema>;
export type MerchantCandidate = z.infer<typeof MerchantCandidateSchema>;
export type CategoryReport = z.infer<typeof CategoryReportSchema>;
export type RunResult = z.infer<typeof RunResultSchema>;
export type StepId = z.infer<typeof StepIdSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type TraceEvent = z.infer<typeof TraceEventSchema>;
export type PlanResponse = z.infer<typeof PlanResponseSchema>;
export type Preset = z.infer<typeof PresetSchema>;
export type CityList = z.infer<typeof CityListSchema>;
