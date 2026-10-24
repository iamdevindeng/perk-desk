# Perk Desk: Tasks T1–T12 (+ optional extras)

> Historical build plan. The judge access code and preset per-IP skip described below were removed in FIXES-R6 R16; current limits are in docs/ARCHITECTURE.md.

Run them **in order**, following the loop in `AGENTS.md` §2. Each task lists: goal, read-first, files, steps, acceptance, verification. "Standard checks" always means:

```bash
npm run lint && npm test && npm run build && npm run check:rules
```

Network: `npm install` is needed in T1. Live Qloo/DeepSeek calls happen only where a task says "live check (optional)"; they need `.env.local`. If `.env.local` is missing or a call fails, write that in PROGRESS and continue. Unit tests never touch the network (mock `fetch` / modules with vitest).

Time budget guide (whole run ≈ 8–10 h): T1 40 min · T2 30 · T3 60 · T4 50 · T5 60 · T6 60 · T7 70 · T8 50 · T9 40 · T10 60 · T11 30 · T12 30.

---

## T1: Scaffold, lint rules, test runner

**Goal:** a configured Next.js 16 app in this repo with readability rules enforced, `env.ts`, `config.ts`, and test/check scripts. No product logic.

**Read first:** AGENTS.md (all), ARCHITECTURE §2, §9, §10, §13.

**Files:** create-next-app output (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `public/*`); shadcn (`components.json`, `src/components/ui/*`, `src/lib/utils.ts`); `vitest.config.ts`; `vitest.eval.config.ts`; `src/lib/env.ts`; `src/lib/config.ts`; `tests/unit/env.test.ts`; `tests/unit/config.test.ts`. `scripts/check-rules.mjs` **already exists** (docs commit): do not weaken it; fix code, not the checker (bug fixes allowed, explain in PROGRESS).

**Steps:**
1. Scaffold in a temp dir (create-next-app refuses a non-empty directory) and copy in without overwriting our files:
   ```bash
   TMP=$(mktemp -d)
   npx create-next-app@16.4.2 "$TMP/app" --ts --tailwind --eslint --app --src-dir \
     --import-alias "@/*" --use-npm --no-agents-md --no-agent-feedback --disable-git --yes --skip-install
   rm -f "$TMP/app/README.md" "$TMP/app/.gitignore" "$TMP/app/AGENTS.md" "$TMP/app/CLAUDE.md" "$TMP/app/LICENSE"
   cp -R "$TMP/app/." . && rm -rf "$TMP"
   npm install
   ```
   If a flag is rejected by the CLI, drop only that flag and note it.
2. Dependencies (check `npm view react-leaflet@5 peerDependencies` first; see ARCHITECTURE §9):
   ```bash
   npm install ai@^7 @ai-sdk/deepseek@^3 zod@^4 @upstash/redis@^1 @upstash/ratelimit@^2 leaflet@^1.9 react-leaflet@^5
   npm install -D tsx@^4 vitest@^4 @types/leaflet@^1.9
   ```
3. shadcn (non-interactive):
   ```bash
   npx shadcn@4.22.1 init -d -y
   npx shadcn@4.22.1 add button card input label textarea badge separator select switch skeleton -y
   ```
   Add the 2-line header comment to the generated `src/lib/utils.ts` (it is not exempt).
4. `package.json`: add `"engines": { "node": ">=20.9" }`; set `"scripts"` to exactly:
   ```json
   {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
     "lint": "eslint",
     "test": "vitest run",
     "typecheck": "next typegen && tsc --noEmit",
     "check:rules": "node scripts/check-rules.mjs",
     "eval": "vitest run --config vitest.eval.config.ts",
     "smoke": "tsx --env-file=.env.local scripts/smoke.ts"
   }
   ```
5. `vitest.config.ts`:
   ```ts
   // Vitest config for unit tests (no network, no keys).
   // Called by: npm test
   import path from "node:path";
   import { defineConfig } from "vitest/config";
   export default defineConfig({
     resolve: { alias: { "@": path.resolve(__dirname, "src") } },
     test: { environment: "node", include: ["tests/unit/**/*.test.ts"] },
   });
   ```
   `vitest.eval.config.ts`: same alias; `include: ["tests/eval/**/*.test.ts"]`, `testTimeout: 180000`, `fileParallelism: false`; before `defineConfig`, load keys **without printing them**:
   ```ts
   import { existsSync } from "node:fs";
   // WHY: eval needs real keys from .env.local; Node ≥ 20.12 has process.loadEnvFile.
   if (existsSync(".env.local") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env.local");
   ```
6. `eslint.config.mjs`: keep the generated config; append these blocks inside the exported array (after the Next presets), and add `"src/components/ui/**"` to the global ignores:
   ```js
   {
     files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "tests/**/*.ts"],
     rules: {
       "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
       "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true, IIFEs: true }],
       "max-depth": ["error", 3],
       "@typescript-eslint/no-explicit-any": "error",
       "@typescript-eslint/explicit-module-boundary-types": "error",
       "no-restricted-syntax": ["error",
         { selector: "ClassDeclaration", message: "No classes (AGENTS.md §5.7). Use plain functions." },
         { selector: "TSConditionalType", message: "No conditional types (AGENTS.md §5.5)." }],
     },
   },
   {
     files: ["src/components/**/*.tsx", "src/app/page.tsx"],
     rules: { "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }] },
   },
   {
     files: ["tests/**/*.ts"],
     rules: { "max-lines-per-function": "off" },
   },
   {
     files: ["src/components/**/*.tsx", "src/app/page.tsx", "src/lib/profile-storage.ts", "src/lib/run-client.ts",
             "src/lib/request-builders.ts", "src/lib/csv.ts"],
     rules: { "no-restricted-imports": ["error", { patterns: [{
       group: ["@/lib/env", "@/lib/qloo/*", "@/lib/agent/*", "@/lib/store/*", "@/lib/fallback/*", "@/lib/merchants/*"],
       message: "Client code must not import server code (ARCHITECTURE §2)." }] }] },
   },
   ```
   (`tests/**` turns off the function limit because `describe` blocks are long; the 200-line file limit still applies.) If `@typescript-eslint` rules are not registered by the Next preset, import `typescript-eslint` (already installed by the preset) and register it; record what you did.
7. `next.config.ts`: leave as generated (`cacheComponents: true`). No segment configs (AGENTS.md §6).
8. `src/lib/env.ts`: `getEnv(): AppEnv` parses `process.env` with zod once (cached), **never throws at import**, all values optional strings; exports `getEnv`, `hasQlooKey()`, `hasDeepSeekKey()`, `hasUpstash()`, `isAgentDisabled()` (`PD_AGENT_DISABLED === "1"`). Variables: `QLOO_API_KEY`, `QLOO_BASE_URL` (default `QLOO_BASE_URL_DEFAULT`), `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` (default `"deepseek-flash"`), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `JUDGE_BYPASS_CODE`, `PD_AGENT_DISABLED`. Export a `resetEnvForTests()` that clears the cache.
9. `src/lib/config.ts`: every constant from ARCHITECTURE §10 (exact names and values), `as const` objects allowed.
10. `src/app/layout.tsx`: title "Perk Desk", description = the one-liner (PRD §1), footer text from ARCHITECTURE §12. `src/app/page.tsx`: placeholder heading "Perk Desk" + one-liner (replaced in T8). Add the 2-line header comments (directive first if any).
11. Tests: `env.test.ts` (use `vi.stubEnv` / `vi.unstubAllEnvs`, then `resetEnvForTests()`): missing keys → `hasQlooKey() === false`, defaults applied, `PD_AGENT_DISABLED=1` detected. `config.test.ts`: score weights sum to 1; `PLAN_MIN_CATEGORIES <= PLAN_MAX_CATEGORIES`.

**Acceptance:** standard checks pass; `npm run typecheck` passes; `git status --porcelain` shows no `.env.local`, `.next/`, `node_modules/`; `README.md`, `.env.example`, `LICENSE`, `docs/*` (except PROGRESS) unchanged.

**Verify:** standard checks; `npm run typecheck`; `npx eslint --print-config src/lib/config.ts | grep -c max-lines-per-function` ≥ 1.

---

## T2: Types and data loading

**Goal:** all zod schemas in `src/lib/types.ts`, validated access to `src/data/*.json`, canonical hashing.

**Read first:** ARCHITECTURE §3, §7 (cache keys), §14; the JSON files in `src/data/`.

**Files:** `src/lib/types.ts`, `src/lib/data.ts`, `src/lib/hash.ts`, `tests/unit/types.test.ts`, `tests/unit/data.test.ts`, `tests/unit/hash.test.ts`, `tests/fixtures/fake-plan.ts` (hand-written fake objects reused later).

**Steps:**
1. Write every schema in ARCHITECTURE §3 with the exact names, plus `PresetSchema` and `CityListSchema` (§3 end). Export `type X = z.infer<typeof XSchema>` for each. If `types.ts` would exceed 200 lines, keep the shared/plan/run schemas there and move only `TraceEventSchema` + `ErrorCodeSchema` + `StepIdSchema` into `src/lib/trace-types.ts` (the one allowed split; re-export from `types.ts`).
2. `data.ts`: import the JSON files (`import categoryDefaults from "@/data/category-defaults.json"`), validate each once with zod schemas defined in `data.ts` (`CategoryDefaultsSchema`, `BlacklistSchema`, `NationalChainsSchema`; ignore `_comment`), and export: `getCategoryDefaults()`, `getCategoryLabel(tagId): string` (falls back to a title-cased slug), `getBlacklist()`, `getNationalChainNames(): string[]`, `getPresets(): Preset[]`, `findPreset(id): Preset | null`, `getCities()`. Presets are imported explicitly (`denver-demo.json`, `austin-demo.json`); no filesystem reads (works on Vercel).
3. `hash.ts`: `canonicalJson(value: unknown): string` (object keys sorted recursively, arrays kept in order), `sha256Hex(text): string` (`node:crypto`), `cacheKey(kind, value): string` → `pd:v1:<kind>:<sha256(canonicalJson(value))>`; `citySlug(city)` (ARCHITECTURE §7). `hash.ts` is server-only; it may import `node:crypto`.
4. Tests: every schema accepts a valid fake object and rejects 2+ invalid ones (bad tag id, 6 branches, 0 brands, radius 500); `TraceEventSchema` parses each event type; data files parse; every `quickSegments[].categories` and every `adjacent` id exists in `categories`; every preset parses and has 1–5 branches with coords; `canonicalJson({b:1,a:{d:1,c:2}}) === canonicalJson({a:{c:2,d:1},b:1})`.

**Acceptance:** standard checks pass. No change to tag ids in `src/data/*.json`.

**Verify:** standard checks.

---

## T3: Qloo layer and cache

**Goal:** typed, cached, paced Qloo functions returning slim shapes.

**Read first:** QLOO_API.md (all), ARCHITECTURE §5.5, §7, §11, §14.

**Files:** `src/lib/store/cache.ts`, `src/lib/qloo/client.ts`, `src/lib/qloo/search.ts`, `src/lib/qloo/tags.ts`, `src/lib/qloo/insights.ts`, `tests/fixtures/qloo-fake.ts`, `tests/unit/cache.test.ts`, `tests/unit/qloo-client.test.ts`, `tests/unit/qloo-search.test.ts`, `tests/unit/qloo-insights.test.ts`.

**Steps:**
1. `cache.ts` per ARCHITECTURE §7 (`getJson`, `setJson`, `clearMemoryCacheForTests()`). Upstash client created lazily only when both env vars are set. Cache failures (Upstash down) are logged once (no secrets) and treated as misses; they never fail a request.
2. `client.ts`: `qlooGet(path, params, options): Promise<unknown>` builds the URL with `URLSearchParams` (sorted keys), sends `X-Api-Key`, applies `QLOO_TIMEOUT_MS` (`AbortSignal.timeout`), keeps `QLOO_MIN_GAP_MS` between call starts (module-level timestamp; simple `await sleep`), retries once on 429 unless monthly remaining is `0`, and maps errors to `QlooError` (ARCHITECTURE §11, factory + type guard, no class). `cachedQlooCall<T>(path, params, slim: (raw: unknown) => T, schema, options): Promise<T>` = cache lookup by `cacheKey("qloo", { path, params })` → `qlooGet` → `slim` → `setJson(…, QLOO_CACHE_TTL_S)`; calls `options.onCall?.({ endpoint, summary, ms, cached })` either way. `options.onCall` is how agents emit `qloo_call` trace events. Missing key → throw `QlooError` code `config`.
3. `search.ts`: `searchBrands(name, options): Promise<BrandCandidate[]>` (take `BRAND_SEARCH_TAKE`; normalize `tag_id` → `TagRef.id`; apply `filterAllowedBrandTags`). `filterAllowedBrandTags(tags): TagRef[]` (QLOO_API §2 compliance rules, then ARCHITECTURE §5.5 order and cap). `searchBrandExact(name, options): Promise<BrandCandidate | null>` (take 1; for the chain brand check).
4. `tags.ts`: `searchPlaceCategories(query, options): Promise<CategoryTag[]>`; drops ids not matching the pattern and blacklisted slugs (`isBlacklistedCategory(tagId)` exported from here; guard layer 1 reuses it).
5. `insights.ts`: `findPlaces({ lat, lon, radiusMeters, tagId, brandIds }, options): Promise<Place[]>` (seeded when `brandIds.length > 0`, with `feature.explainability=true`; baseline otherwise); `resolveLocality(query, options): Promise<{ name: string; lat: number; lon: number } | null>`; `slimPlace(raw): Place | null` (skip entities without name/id/location); `formatHours(hours): string | undefined`.
6. Fixtures: hand-written fake raw responses (2–4 entities each, fake names, ids `00000000-0000-4000-8000-0000000000NN`) shaped like QLOO_API §2–§5, including one demographic tag type, one place without tripadvisor, one closed place.
7. Tests (mock `fetch` with `vi.stubGlobal`): URL contains `filter.location=POINT(-104.99 39.75)` (lon first) and `filter.location.radius=6000`; seeded vs baseline params; key only in headers (assert the URL string does not contain the fake key); demographic tags removed; 401 → `auth`; 429 then 200 → retried once; 429 with monthly remaining 0 → `quota`, no retry; second identical call is a cache hit (fetch called once) and reports `cached: true`; `slimPlace` maps every field in QLOO_API §4.2; `formatHours` groups days.

**Acceptance:** standard checks pass; no real API calls in tests.

**Verify:** standard checks. Live check (optional, keys present): `npx tsx --env-file=.env.local -e "import('./src/lib/qloo/search.ts').then(async m=>{const r=await m.searchBrands('REI',{});console.log(r.map(b=>b.name))})"` prints up to 3 names (names only).

---

## T4: Merchant filter and scoring (pure functions)

**Goal:** deterministic step ④ and the shortlist, fully unit-tested.

**Read first:** ARCHITECTURE §6.2, §6.3 (shortlist only), PRD §4.

**Files:** `src/lib/merchants/name-match.ts`, `distance.ts`, `chains.ts`, `filter.ts`, `scoring.ts`, `shortlist.ts`; `tests/fixtures/fake-places.ts`; `tests/unit/name-match.test.ts`, `distance.test.ts`, `chains.test.ts`, `filter.test.ts`, `scoring.test.ts`, `shortlist.test.ts`.

**Steps:**
1. Implement exactly ARCHITECTURE §6.2 items 1–7 and the shortlist rule of §6.3, as pure functions (inputs → outputs, no I/O, no `Date.now()`). Suggested API (ARCHITECTURE §14): `normalizeName`, `nameMatches`, `haversineMeters`, `isNationalChain`, `markDuplicateNames`, `filterPlaces` (returns `{ kept, excludedCounts }`), `mergeSeededAndBaseline`, `scoreCandidates`, `computeBrandShares`, `assignNearestBranch`, `countIndependents`, `buildShortlist`.
2. Tests with fake data, at least: `normalizeName("The Bike & Run Co.") === "bike and run"`; "Sweet Fake Ice Cream" matches "sweet fake ice cream llc"; "Cafe" does **not** match "Cafe Fake Corner" (shorter < 5 chars); haversine Denver↔Austin ≈ 1240 km ± 15; "Starbucks Reserve" is a national chain, "Starbuck Lane Books" is not (word boundary); rankLift with missing baseline uses `baselineLength + 1`; baseline-only places have `tasteSignal: false` and sort after taste ones; brand shares sum to 100; ties sort by name; shortlist with 3 branches × 2 categories gives 10 with ≥ 3 per branch when available and fills from others when one branch is empty; places beyond radius × 1.1 dropped; noise genres dropped and counted.

**Acceptance:** standard checks pass; ≥ 25 assertions across the six test files.

**Verify:** standard checks; `npx vitest run tests/unit/scoring.test.ts tests/unit/shortlist.test.ts`.

---

## T5: Agent tools and guard layers 1–2

**Goal:** the three tools, the agent context types, the model factory and guard layers 1–2, all testable without network.

**Read first:** ARCHITECTURE §5.3, §5.4, §5.5, §6.1, §6.2, §14; AGENTS.md §6 (AI SDK notes).

**Files:** `src/lib/agent/context.ts`, `src/lib/agent/model.ts`, `src/lib/agent/guards.ts`, `src/lib/agent/tools/resolve-brands.ts`, `src/lib/agent/tools/search-categories.ts`, `src/lib/agent/tools/find-merchants.ts`, `tests/unit/guards.test.ts`, `tests/unit/resolve-brands.test.ts`, `tests/unit/find-merchants.test.ts`.

**Steps:**
1. Read the installed AI SDK types first (`node_modules/ai/dist/index.d.ts`: `tool`, `generateText`, `isStepCount`, `StopCondition`, `LanguageModel`; `node_modules/ai/dist/test/index.d.ts`: `MockLanguageModelV4`). Write what you found (names, any differences from AGENTS.md §6) in PROGRESS.
2. `context.ts`: `PlanContext`, `RunContext`, `CategoryOutcome`, `BrandResolution` types and `createPlanContext(...)`, `createRunContext(...)`.
3. `model.ts`: `agentModel(): LanguageModel` using `createDeepSeek({ apiKey })` and `getEnv().DEEPSEEK_MODEL`; `AGENT_CALL_SETTINGS` = `{ temperature: 0, maxRetries: 1, providerOptions: { deepseek: { thinking: { type: "disabled" } } } }`.
4. Tools: each file exports a plain function doing the work (used by fallback and tests) **and** `buildXTool(context)` wrapping it with `tool({ description, inputSchema, execute })`. Tool `execute` never throws to the model: it catches errors and returns `{ error: string }` (except `QlooError` codes `auth`/`quota`/`config`, which are rethrown to end the request). Each tool emits `tool_call` and `tool_result` trace events with short summaries.
   - `resolve-brands.ts`: `matchBrand(inputName, candidates): { status, chosen?, matchKind? }` (pure) + `resolveBrandNames(names, context)`.
   - `search-categories.ts`: `searchCategoriesForContext(query, context)`; adds results to `context.candidateCategories`; attaches `knownIndependents` from the density cache and `usableInDemoCities`.
   - `find-merchants.ts`: `findMerchantsForCategory({ tagId, replacesTagId }, context)`: 2 calls per branch (seeded + baseline), T4 functions, stores `CategoryOutcome`, writes density cache, enforces the one-replacement rule (ARCHITECTURE §6.1). A failed call for one branch → warning, continue.
5. `guards.ts`: `checkCategoryCandidate`, `checkEvidence`, `applyPlanGuards(submission, context): { kept: PlannedCategory[]; errors: string[] }` (layers 1–2, dedupe, cap, brand-choice rule). `checkPitch` is added in T7.
6. Tests (mock `@/lib/qloo/*` with `vi.mock`): `matchBrand("REI", [Recreational Equipment Inc, Real Madrid CF, Reiss])` → ambiguous; `matchBrand("Ulta Beauty", [Ulta])` → prefix; `matchBrand("Sierra Nevada", [Sierra Nevada Brewing Co.])` → prefix; layer 1 rejects an id not returned by `searchCategories`, a malformed id, and a blacklisted slug (`..._school`); layer 2 rejects a `brandTagId` not in the brand's allowed tags and a demographic tag; a category with only invalid evidence is dropped; replacement allowed once, second replacement rejected; `findMerchantsForCategory` makes 2 × branches calls and returns the independent count.

**Acceptance:** standard checks pass.

**Verify:** standard checks; `npx vitest run tests/unit/guards.test.ts`.

---

## T6: `/api/plan` with agent and fallback

**Goal:** steps ① ② end to end: locations, plan agent loop with guards, fallback plan, plan cache, JSON route.

**Read first:** ARCHITECTURE §4.1, §5 (all), §7 (cache only), §8 (fallback-plan, category-map), §11; PRD §5.

**Files:** `src/lib/agent/prompts.ts`, `src/lib/agent/plan-agent.ts`, `src/lib/fallback/category-map.ts`, `src/lib/fallback/fallback-plan.ts`, `src/app/api/plan/route.ts`, `tests/unit/category-map.test.ts`, `tests/unit/plan-agent.test.ts`, `tests/unit/plan-route.test.ts`.

**Steps:**
1. `prompts.ts`: `PLAN_SYSTEM_PROMPT`, `buildPlanUserPrompt(context)`, `RUN_SYSTEM_PROMPT`, `buildRunUserPrompt(context)`, `PITCH_SYSTEM_PROMPT`, `buildPitchPrompt(input)` (ARCHITECTURE §5.6, §6.1, §6.3). Plain template strings; no demographics.
2. `plan-agent.ts`: `runPlan(request, options): Promise<PlanResponse>`: preset expansion (if `presetId`), locations (§5.1), then agent loop (§5.2) unless `!hasDeepSeekKey() || isAgentDisabled()`, guard completion, fallback on any agent failure (§8 triggers), trace collection (`options.emit` optional; events also returned in `trace`). `options.model` overrides the model (tests).
3. `category-map.ts` + `fallback-plan.ts` per ARCHITECTURE §8.
4. `route.ts`: validate → (rate limit is added in T7; leave a `// T7: rate limit here` comment) → plan cache (`cacheKey("plan", request)`, `RESULT_TTL_S`; only cache responses with ≥ 1 category) → `runPlan` → JSON. Error mapping per §4.1/§11. `export const maxDuration = 300;` and nothing else exported besides `POST`.
5. Tests: `MockLanguageModelV4` scripted to call `resolveBrands` → `searchCategories` → `submitPlan` (one valid + one invalid category) with Qloo mocked → plan has the valid category, a `guard` event, `mode: "agent"`; model throws → `mode: "fallback"` with rule evidence (`reason` starts with `"Rule:"`); every `category-map.ts` target exists in `category-defaults.json`; route: invalid body → 400; missing Qloo key → 503 `config`; preset id loads preset brands.

**Acceptance:** standard checks pass; plan route returns `PlanResponse`-valid JSON in tests.

**Verify:** standard checks. Live check (optional): `npm run dev` in the background, then
`curl -s -X POST localhost:3000/api/plan -H 'content-type: application/json' -d '{"presetId":"denver-demo","institutionName":"x","city":"Denver, CO","branches":[{"id":"a","name":"a","address":"","radiusMeters":6000}],"brandNames":["x"]}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.mode,j.categories.map(c=>c.label),j.unresolved)})"`; stop the server afterwards.

---

## T7: `/api/run` streaming, pitches, fallback, rate limits

**Goal:** steps ③–⑥ streamed as NDJSON, with pitch guard, fallback run, result cache + replay, and rate limits on both routes.

**Read first:** ARCHITECTURE §4.2, §4.3, §6 (all), §7, §8 (fallback-run, pitch-template), §11.

**Files:** `src/lib/stream.ts`, `src/lib/agent/run-agent.ts`, `src/lib/agent/pitch-writer.ts`, `src/lib/agent/guards.ts` (add `checkPitch`), `src/lib/fallback/pitch-template.ts`, `src/lib/fallback/fallback-run.ts`, `src/lib/store/rate-limit.ts`, `src/app/api/run/route.ts`, `src/app/api/plan/route.ts` (add limits), `tests/unit/stream.test.ts`, `pitch.test.ts`, `rate-limit.test.ts`, `run-agent.test.ts`, `run-route.test.ts`.

**Steps:**
1. `stream.ts` per §4.2 (always `done` last; `at` filled by `emit`).
2. `run-agent.ts`: `runResearch(request, emit, options): Promise<RunResult>`: agent loop (§6.1) or fallback, deterministic completion, shortlist + brand check + pitches (§6.3), `step` events for all six steps.
3. `pitch-writer.ts` + `checkPitch` + `pitch-template.ts` (§6.3, §8). Template output must itself pass `checkPitch` (test it).
4. `rate-limit.ts` (§7) with `getClientIp(request)` (AGENTS.md §6) and `hasJudgeBypass(request)`.
5. Routes: limits + cache order exactly as §7; `/api/run` cache stores the emitted events (excluding `done`) and replays them.
6. Tests: NDJSON lines parse and end with `done`; thrown error → `error` + `done`; `checkPitch` rejects an invented number ("20% off"), a 4-sentence pitch, a pitch without the merchant name; accepts the template; rate limit allows 20 then blocks (in-memory), preset skips per-IP, judge header skips all, cache hit not counted; run route with mocked Qloo + `PD_AGENT_DISABLED=1` streams `step`… `result` with ≤ 10 merchants; over limit → `limited` + `done` (HTTP 200).

**Acceptance:** standard checks pass.

**Verify:** standard checks. Live check (optional): with `npm run dev`, POST the denver preset to `/api/plan`, then the returned brands/categories (max 5) and preset branches to `/api/run` with `curl -N`, and count lines by `type` (print counts and merchant names only).

---

## T8: UI part 1: profile, presets, taste input, base map

**Goal:** the first half of the page: preset picker, program profile (persisted), branch editor with map picking, taste input with quick segments, and the Plan button calling `/api/plan`.

**Read first:** PRD §2 (steps 1–2), ARCHITECTURE §4.3, §12; AGENTS.md §5 rule 8 and §6 (Leaflet).

**Files:** `src/app/page.tsx`, `src/components/PresetPicker.tsx`, `ProfileForm.tsx`, `BranchEditor.tsx`, `TasteInput.tsx`, `MerchantMap.tsx` (base version), `src/lib/profile-storage.ts`, `src/lib/request-builders.ts`, `src/lib/run-client.ts` (`postPlan` now; `streamRun` in T9), `tests/unit/profile-storage.test.ts`, `tests/unit/request-builders.test.ts`.

**Steps:**
1. `profile-storage.ts`: `loadProfile(): Profile | null`, `saveProfile(profile)`, `loadJudgeCode()`, `saveJudgeCode()`; keys `perkdesk:v1:profile`, `perkdesk:v1:judge`; safe when `window` is undefined; invalid JSON → null.
2. `request-builders.ts`: `parseListText(text): string[]` (split on line breaks only, not commas, because shop names contain commas; trim; drop empty; dedupe case-insensitively keeping the first spelling; max 500), `buildPlanRequest(profile, brandsText, presetId?)`, `buildRunRequest(profile, plan, confirmedCategories, brandOverrides, presetId?)` (`excludeEntityIds` from `merchantStatus` signed/not_a_fit).
3. Components (shadcn `Card`, `Input`, `Textarea`, `Button`, `Select`, `Badge`):
   - `PresetPicker`: two buttons ("Try Denver demo", "Try Austin demo"); fills profile + brands text; remembers `presetId` until the user edits any field (then `presetId` = undefined).
   - `ProfileForm`: institution name; city select (cities.json) + free text "Other city (City, ST)"; signed merchants paste box; renders `BranchEditor` (1–5 branches: name, address, radius km slider/input 1–20, "Pick on map" toggles map pick mode; shows coords and source).
   - `TasteInput`: brands paste box (one per line, 1–10), six quick-segment buttons that replace the box content with the segment's `seedBrands` (visible and editable), hint "Aggregated brand names only".
   - `MerchantMap` (base): props per ARCHITECTURE §12; OSM tiles; city center; branch `CircleMarker` + radius `Circle`; `onPickLocation` on click. Loaded in `page.tsx` via `dynamic(() => import("@/components/MerchantMap"), { ssr: false })`.
4. `page.tsx`: state per ARCHITECTURE §12; Plan button disabled until name, city, ≥ 1 branch and ≥ 1 brand; shows spinner "Planning…" and then (temporary) the JSON category labels until T9.
5. Tests: `parseListText` (blank lines, duplicates, CRLF), `buildRunRequest` exclusions, `loadProfile` with corrupt data (stub `localStorage` with a small in-memory object).

**Acceptance:** standard checks pass; `npm run build` has no SSR `window is not defined` error.

**Verify:** standard checks; `npm run dev`, open http://localhost:3000, click "Try Denver demo": 3 branches with circles appear; reload keeps the profile.

---

## T9: Category confirm (guard layers 3–4) and agent trace

**Goal:** the confirm step with evidence chips, brand candidate switching, preference memory, and the live trace for the run.

**Read first:** PRD §2 step 3–4, §5; ARCHITECTURE §4.3, §12.

**Files:** `src/components/CategoryConfirm.tsx`, `src/components/AgentTrace.tsx`, `src/lib/run-client.ts` (add `streamRun`), `src/app/page.tsx`, `tests/unit/run-client.test.ts`, `tests/unit/preferences.test.ts` (tests a pure `mergePreferences` exported from `request-builders.ts`).

**Steps:**
1. `CategoryConfirm`: recognized brands list (name, match kind; ambiguous/fallback brands show a `Select` of candidates; changing one shows "Re-plan with this brand" → calls `/api/plan` again with `brandOverrides`); unresolved names in a muted line; category chips with evidence lines `Brand → tag name → category: reason` (fallback ones labelled "Rule"); remove ×; "Add category" `Select` (plan candidates ∪ quick-pick defaults, not already chosen); max 5 confirmed (disable add at 5; if the plan returned 6, the 6th starts unchecked); warnings shown; **Confirm & find merchants** button.
2. On confirm: `mergePreferences(profile.categoryPreferences, planned, confirmed)` (ARCHITECTURE §12) → save profile → `streamRun`.
3. `AgentTrace`: list of events as they arrive: six step rows with status icons (pending/running/done), and under the running step the latest `tool_call`/`qloo_call`/`guard`/`agent_note` lines (max 30 shown, "N Qloo calls · cached M"); `fallback` shows a yellow "Fallback mode: <reason>" banner; `limited` shows the limit message + judge code input; `error` shows the mapped message + Retry.
4. `streamRun` per §4.3; test with a fake `ReadableStream` that splits a JSON line across chunks.

**Acceptance:** standard checks pass; no merchant search starts before Confirm.

**Verify:** standard checks; manual (keys present): Denver demo → Plan → edit chips → Confirm → trace animates → result JSON arrives (cards come in T10).

---

## T10: Evidence cards, map highlight, CSV export, follow-up status

**Goal:** the results view per PRD §4.

**Read first:** PRD §2 step 4–5, §4; ARCHITECTURE §6.3 (maps URL), §12.

**Files:** `src/components/MerchantCard.tsx`, `src/components/MerchantMap.tsx` (merchant markers + highlight), `src/components/ExportButton.tsx`, `src/lib/csv.ts`, `src/app/page.tsx`, `tests/unit/csv.test.ts`.

**Steps:**
1. Results grouped by branch (branch name + count), per-category report line (`ok` / `thin`: "Few independent shops in this category near your branches" / `replaced`: "Not enough local shops in X; tried Y"), excluded counts summary, "Independents only" `Switch` (hides `multiLocation`), mode badge (Agent / Fallback).
2. `MerchantCard`: all PRD §4 fields; missing fields are simply omitted (never "undefined"); distance `x.x km from <branch>`; brand shares; lift text (`+N places vs. baseline`, `N places below baseline` for negative, or "category match (no taste signal)"); ratings; badges; pitch with Copy (`navigator.clipboard.writeText`, show "Copied"); status `Select` writing `profile.merchantStatus`; card `id="merchant-<entityId>"`; hover/click → `selectedMerchantId`.
3. `MerchantMap`: merchant `CircleMarker`s (selected = larger + different color), click → `onSelectMerchant` → page scrolls the card into view (`scrollIntoView({ behavior: "smooth", block: "center" })`); fit bounds to branches + merchants after a result.
4. `csv.ts`: `toCsv(merchants, merchantStatus): string` with the PRD §4 columns in that order (`status` from `merchantStatus[entityId]`, default `to_contact`; booleans as `yes`/`no`; `distance_km` with 1 decimal); RFC 4180 quoting (quote fields containing `"`, `,`, CR or LF; double the quotes); text cells starting with `=`, `+`, `-`, `@` get a leading `'` (spreadsheet formula injection), but numeric cells such as a rank lift of `-3` are left as numbers. `ExportButton`: `Blob` + `URL.createObjectURL` → `perk-desk-<yyyy-mm-dd>.csv`.
5. Next run excludes `signed`/`not_a_fit` (already in `buildRunRequest`); show "N merchants excluded by your follow-up status" in the summary.

**Acceptance:** standard checks pass; CSV test covers quoting, injection prefix and column order.

**Verify:** standard checks; manual: run Denver demo → 10 cards, map markers, two-way highlight, CSV opens in a spreadsheet, marking one "Not a fit" and re-running excludes it.

---

## T11: Category eval set

**Goal:** a repeatable measure of category-pick quality with real keys.

**Read first:** PRD §5 (last line), ARCHITECTURE §5.

**Files:** `tests/eval/cases.json`, `tests/eval/category-eval.test.ts`.

**Steps:**
1. `cases.json`: `{ "cases": [ { "id", "city", "brands": [...], "expectedAnyOf": [tag ids] } ] }` with exactly these 15 cases (expected slugs → `urn:tag:category:place:<slug>`):
   | id | city | brands | expectedAnyOf |
   |---|---|---|---|
   | coffee | Denver, CO | Starbucks, Blue Bottle Coffee | coffee_shop, cafe |
   | dessert | Austin, TX | Krispy Kreme, Starbucks | donut_shop, bakery, dessert_shop, coffee_shop |
   | craft-beer | Denver, CO | Sierra Nevada, New Belgium Brewing | brewery, beer_garden, bar |
   | aperitif | Austin, TX | Aperol | cocktail_bar, wine_bar, bar |
   | pets | Denver, CO | Chewy, BarkBox, Petco | pet_supply_store, pet_store, pet_groomer |
   | fitness | Austin, TX | Lululemon, Peloton, Nike | gym, sporting_goods_store |
   | outdoor | Denver, CO | REI, Patagonia, YETI | sporting_goods_store, bicycle_shop |
   | beauty | Austin, TX | Sephora, Ulta Beauty | nail_salon, day_spa, facial_spa, spa |
   | hair | Denver, CO | Aveda | hair_salon, barber_shop, day_spa |
   | healthy-dining | Austin, TX | Sweetgreen, Whole Foods Market | health_food_restaurant, juice_shop, cafe |
   | burgers | Denver, CO | Shake Shack | hamburger_restaurant, american_restaurant |
   | mexican | Austin, TX | Chipotle | mexican_restaurant, taco_restaurant |
   | western-wear | Austin, TX | Tecovas | clothing_store, mens_clothing_store, womens_clothing_store |
   | sneakers | Denver, CO | Allbirds, Nike | clothing_store, sporting_goods_store |
   | mixed-denver | Denver, CO | REI, Lululemon, Starbucks, New Belgium Brewing | sporting_goods_store, gym, coffee_shop, brewery |
   All expected ids exist in `category-defaults.json`; add a unit-free assertion in the eval test that they do.
2. `category-eval.test.ts`: `describe.skipIf(!hasQlooKey() || !hasDeepSeekKey())`; for each case call `runPlan` (one branch at the preset city center, radius 6000); **hit** = any picked category in `expectedAnyOf`; **precision** = picked ∩ expected / picked; print a table (`id, mode, picked labels, hit`) and totals; `expect(hitRate).toBeGreaterThanOrEqual(0.5)` (informational target 0.8). Cases run sequentially.
3. Run `npm run eval` once if keys exist; record hit rate, precision, fallback count and runtime in PROGRESS. If below 0.8, you may tune **only** `prompts.ts` (max 2 tuning rounds), re-run, and record before/after.

**Acceptance:** `npm test` still passes without keys (eval is not part of it); `npm run eval` without keys reports skipped, not failed.

**Verify:** standard checks; `npm run eval`.

---

## T12: Smoke script and final PROGRESS summary

**Goal:** one command that proves the whole pipeline with real keys, and a morning-ready summary.

**Read first:** AGENTS.md §3, §4; ARCHITECTURE §14.

**Files:** `scripts/smoke.ts`, `docs/PROGRESS.md`, `README.md` (only the "Status" line and a "Run locally" section).

**Steps:**
1. `scripts/smoke.ts` (CJS-safe: `async function main()`; no top-level await): if `QLOO_API_KEY` missing → print "Missing QLOO_API_KEY in .env.local" and `process.exit(2)` (use `hasQlooKey()`; never print values). Run `runPlan` for the Denver preset, take the first ≤ 5 categories, run `runResearch` with an `emit` that counts events by type. Print only: plan mode, resolved brand names, unresolved names, category labels + evidence brand names, per-category independent counts/status, the shortlisted merchant names with branch and distance km, pitch source counts, Qloo calls, durations. Then run the plan again and print whether it was faster (cache). Exit 0 on success, 1 on failure (print error code + message only). If `DEEPSEEK_API_KEY` is missing, run anyway (fallback) and say so.
2. Run `npm run smoke`; record the outcome in PROGRESS (counts and timings; no response bodies). Also run `PD_AGENT_DISABLED=1 npm run smoke` and record that fallback works.
3. README: update the status line and add "Run locally" (Node ≥ 20.9, `npm install`, `cp .env.example .env.local`, fill keys, `npm run dev`, `npm test`, `npm run smoke`). Keep the compliance line.
4. PROGRESS final summary at the top: overall status table T1–T12, what works end to end, known issues, **Waiting for Devin** list (at least: push to GitHub, Vercel project + env vars + `maxDuration` check, optional Upstash database, judge code, real-browser review of the UI), and a **Review guide**: suggested reading order of files for Devin (e.g. `types.ts` → `qloo/client.ts` → `merchants/scoring.ts` → `agent/guards.ts` → `agent/plan-agent.ts` → `api/run/route.ts` → `page.tsx`), each with one line on what to look for.

**Acceptance:** standard checks pass; smoke exits 0 with keys, or exit 2 is recorded when keys are missing.

**Verify:** standard checks; `npm run smoke`.

---

## Optional extras (only after T12 is committed; follow PRD §9 cut order; commit prefix `X<n>:`)

- **X1: CSV/text upload for lists.** In `ProfileForm` and `TasteInput`, an `<input type="file" accept=".csv,.txt">` per paste box; read with `file.text()`; take the first column of each row (strip quotes, skip a header row named `name`/`merchant`/`brand`), fill the paste box (user still sees/edits it). No new dependency; parsing in `request-builders.ts` (`parseUploadedList`), unit-tested.
- **X2: Business-member match.** Business members paste box in `ProfileForm` (field already in `ProfileSchema`), `RunRequest.businessMemberNames`, set `businessMember` in step ④ with `nameMatches`, show the "Already a business member" badge and boost nothing (badge only). Unit-test the match.

Until X2 is done, `businessMember` is always `false` and the business-members box is hidden.
