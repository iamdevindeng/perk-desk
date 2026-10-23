// Defines shared limits, scoring weights, timeouts, and service URLs.
// Called by: server modules, client components, and tests/unit/config.test.ts

export const QLOO_BASE_URL_DEFAULT = "https://hackathon.api.qloo.com";
export const QLOO_TIMEOUT_MS = 12000;
export const QLOO_MIN_GAP_MS = 150;
export const QLOO_RETRY_AFTER_MS = 1000;
export const QLOO_CACHE_TTL_S = 604800;
export const DENSITY_TTL_S = 2592000;
export const RESULT_TTL_S = 2592000;
export const BRAND_SEARCH_TAKE = 3;
export const BRAND_TAGS_MAX = 40;
export const TAG_SEARCH_TAKE = 15;
export const INSIGHTS_TAKE = 30;
export const DEFAULT_RADIUS_M = 6000;
export const MIN_INDEPENDENTS = 6;
export const PLAN_MIN_CATEGORIES = 2;
export const PLAN_MAX_CATEGORIES = 6;
export const RUN_MAX_CATEGORIES = 5;
export const PLAN_MAX_STEPS = 6;
export const RUN_MAX_STEPS = 6;
export const PLAN_TIMEOUT_MS = 60000;
export const RUN_AGENT_TIMEOUT_MS = 120000;
export const PITCH_TIMEOUT_MS = 45000;
export const SHORTLIST_TOTAL = 10;
export const BRAND_CHECK_MAX = 10;
export const BRAND_CHECK_MIN_POPULARITY = 0.5;
export const SCORE_WEIGHTS = {
  affinity: 0.4,
  lift: 0.25,
  distance: 0.2,
  rating: 0.15,
} as const;
export const PLAN_LIMIT_PER_IP = 60;
export const PLAN_LIMIT_GLOBAL = 1000;
export const RUN_LIMIT_PER_IP = 20;
export const RUN_LIMIT_GLOBAL = 400;
export const RUN_REPLAY_DELAY_MS = 60;
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const RADIUS_SLACK = 1.1;
export const NAME_CONTAINS_MIN_LENGTH = 5;
export const EARTH_RADIUS_M = 6371000;
export const RANK_LIFT_OFFSET = 10;
export const RANK_LIFT_RANGE = 20;
export const SCORE_DECIMALS = 3;
export const RATING_MAX = 5;
export const DEFAULT_RATING_NORM = 0.5;
