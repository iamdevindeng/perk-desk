# Perk Desk: Progress log

Codex appends one section per task (AGENTS.md §3). Never delete earlier entries. All times UTC+8.

## Summary (filled in at T12)

| Task | Status | Commit | Notes |
|---|---|---|---|
| T1 Scaffold | – | – | |
| T2 Types + data | – | – | |
| T3 Qloo layer + cache | – | – | |
| T4 Filter / scoring | – | – | |
| T5 Tools + guards 1–2 | – | – | |
| T6 /api/plan | – | – | |
| T7 /api/run | – | – | |
| T8 UI profile | – | – | |
| T9 Confirm + trace | – | – | |
| T10 Cards, map, CSV, status | – | – | |
| T11 Eval | – | – | |
| T12 Smoke + summary | – | – | |

## Waiting for Devin

Things Codex must not do (remote actions, accounts, secrets) or could not finish. Add items as they come up.

- [ ] Push the repo to GitHub (no remote is configured on purpose).
- [ ] Create the Vercel project, set env vars (QLOO_API_KEY, DEEPSEEK_API_KEY, optional UPSTASH_*, JUDGE_BYPASS_CODE), deploy, check `maxDuration`.
- [ ] Optional: create an Upstash Redis database and add its REST URL/token.
- [ ] Review the pre-existing deletion of `.env.example`; Codex leaves it untouched and outside task commits.
- [ ] Retry shadcn registry installation when reachable; T1 uses small native UI wrappers after initialization and direct registry downloads failed.
- [ ] Review npm installation audit output (5 high-severity findings in the pinned dependency tree); no forced dependency upgrades were made.

## Decisions I made

(Interpretations of unclear spec points, with the reason. One bullet each.)

- T1: Preserve the pre-existing `.env.example` deletion. Stage task files with `git add -A -- . ":!.env.example"` instead of including that unrelated deletion.
- T1: Use system fonts to avoid build-time Google font requests. Keep generated Next configuration, including cache components and partial prefetching.
- T1: shadcn 4.22.1 initialization and direct component download failed with `other side closed`, including proxy retries. Use readable native wrappers with a local `components.json`; do not claim generated shadcn components were installed.
- T1: Fix the existing rule checker to compare only actual secret assignments, ignoring comments and public URL/model configuration; otherwise documented public defaults falsely match secrets. Tighten fake UUIDs to the exact required form. No protections were removed.
- T1: Turbopack needs a local worker port, blocked by the sandbox. Run verification with approved local execution permissions. Future build commands disable Next telemetry with `NEXT_TELEMETRY_DISABLED=1`.

- T3: Restrict Qloo URL overrides to the approved HTTPS hackathon origin and reject redirects, preventing credentials from reaching another host. Reserve pacing slots synchronously so concurrent calls remain spaced.
- T3: Cache failures emit one fixed warning, never provider error details. The local cache clones values to match Redis serialization isolation.

- T4: Add the internal MerchantCandidate schema to the existing shared types file; it carries ranking inputs until pitch creation. Score before filtering so affinity normalization uses the original seeded branch/category list.
- T4: Interleave per-branch quota picks before trimming, satisfying the documented three-branch minimum (4/3/3 rather than 4/4/2). Radius-only drops add no new exclusion field.

## Review guide (filled in at T12)

(Suggested reading order of files for Devin, one line each on what to look for.)

---

## Task entries

<!-- Copy this block for each task:

### T<n>: <title> — <DONE | PARTIAL | FAILED>
- Date/time (UTC+8):
- What was done:
  -
- Files touched:
  -
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  ```
- Live checks (if any; counts/names only, never response bodies or keys):
- Open issues / decisions:
- New dependencies (name, why):
- For Devin:

-->

### T1: Scaffold, lint rules, test runner — PARTIAL
- Date/time (UTC+8): 2026-10-23 21:52
- What was done:
  - Scaffolded Next 16.4.2 / React 19.3 with cache components; installed the pinned application/test dependency families.
  - Added exact npm scripts, strict readability/import-boundary ESLint rules, and unit/eval configurations.
  - Added lazy environment parsing, shared constants, and seven passing environment/config tests.
  - Added metadata, compliance footer, system fonts, and small native UI wrappers for the unavailable shadcn registry.
  - Fixed checker false positives for public environment settings and tightened fixture UUID validation.
- Files touched: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `components.json`, `vitest.config.ts`, `vitest.eval.config.ts`, `src/app/{layout.tsx,page.tsx,globals.css,favicon.ico}`, `public/*.svg`, `src/lib/{env.ts,config.ts,utils.ts}`, `src/components/ui/*.tsx`, `tests/unit/{env,config}.test.ts`, `scripts/check-rules.mjs`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run typecheck
  npx eslint --print-config src/lib/config.ts | rg -c max-lines-per-function
  ```
- Verification: PASS (7 tests, production build, rules, typecheck); printed lint rule count 1. First standard attempt failed only because the sandbox blocked Turbopack's local worker port; approved execution passed. Final checks passed after wrappers were added.
- Live checks: no Qloo or DeepSeek calls. No tracked secrets, dependency folders, or build output.
- Open issues / decisions: shadcn initialization and direct registry requests failed with `other side closed`; native wrappers keep later tasks moving. Generated scaffold uses Tailwind's Turbopack loader and creates no PostCSS config. Original README, LICENSE and specification docs are unchanged. Pre-existing `.env.example` deletion stays outside the commit.
- New dependencies: only Architecture §9 runtime/dev families plus create-next-app's generated Tailwind/ESLint/TypeScript support. No extra UI libraries added.
- For Devin: retry shadcn install; review pre-existing template deletion and npm audit findings (listed above).

### T2: Types and data loading — DONE
- Date/time (UTC+8): 2026-10-23 21:55
- What was done:
  - Added all shared schemas and inferred types in dependency order, with no circular imports or lazy schemas.
  - Added validated, static JSON loaders for categories, blacklists, national chains, presets, and map cities.
  - Added canonical JSON, SHA-256 cache keys and city slugs.
  - Added fake fixtures and tests covering every schema with valid/two invalid inputs, every trace event, data references, and cache-key stability.
- Files touched: `src/lib/{types.ts,data.ts,hash.ts}`, `tests/fixtures/fake-plan.ts`, `tests/unit/{types,data,hash}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  ```
- Verification: PASS first standard attempt; 60 tests across 5 files, production build and rule checker pass.
- Live checks: none.
- Open issues / decisions: schemas fit one file (143 total lines), so no trace split. Added reusable CategoryTag schema for the documented tag/label pair. Enforced the documented 200-character trace-summary cap. JSON data and tag IDs are unchanged.
- New dependencies: none.
- For Devin: none beyond the existing Waiting list.

### T3: Qloo layer and cache — DONE
- Date/time (UTC+8): 2026-10-23 21:59
- What was done:
  - Added lazy optional Redis and expiring memory cache with safe failure handling.
  - Added paced Qloo transport, typed sanitized errors, one short-term 429 retry, quota detection, and validated slim caching.
  - Added brand/category searches with filtering before caching and strict query parameter names.
  - Added seeded/baseline places, locality resolution, optional field mapping, and grouped opening hours.
  - Added hand-written fake raw fixtures and transport/cache/parser tests; no real API data is stored.
- Files touched: `src/lib/store/cache.ts`, `src/lib/qloo/{client,search,tags,insights}.ts`, `tests/fixtures/qloo-fake.ts`, `tests/unit/{cache,qloo-client,qloo-search,qloo-insights}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  ```
- Verification: PASS first standard attempt; 109 tests across 9 files. An earlier targeted insights type check found optional-hours/default-null typing issues; fixed before standard verification.
- Live checks: authorized T3 REI search succeeded, returning 3 candidate names; no response files written. Observed ambiguity matches QLOO_API.md.
- Open issues / decisions: tags without a usable type are dropped; malformed category IDs are blocked; searchBrandExact returns the first result and leaves equality checking to the chain-check caller. Optional fields are omitted rather than invalidating an otherwise usable place.
- New dependencies: none.
- For Devin: no new blockers.

### T4: Merchant filter and scoring — DONE
- Date/time (UTC+8): 2026-10-23 22:04
- What was done:
  - Added pure name normalization/matching, word-boundary national-chain checks, and duplicate-location flags.
  - Added haversine distance and deterministic exclusion reasons with radius slack.
  - Added seeded/baseline union, rank lift, normalized weighted scores, largest-remainder brand shares, and nearest-branch/category deduplication.
  - Added balanced round-robin shortlists and fake merchant fixtures with over 100 assertions across the six task test files.
- Files touched: `src/lib/merchants/{name-match,distance,chains,filter,scoring,shortlist}.ts`, `src/lib/{types,config}.ts`, `tests/fixtures/fake-places.ts`, `tests/unit/{name-match,distance,chains,filter,scoring,shortlist,types}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npx vitest run tests/unit/scoring.test.ts tests/unit/shortlist.test.ts
  ```
- Verification: PASS first standard attempt; 149 tests across 15 files; required focused check 20 tests passed.
- Live checks: none; all merchant functions and tests are pure/offline.
- Open issues / decisions: shared candidate schema and tuning constants extend earlier T1/T2 files because T4 needs them. Nearest branch wins first, then the higher-scoring category within that branch; deterministic ties. Business-member flag remains false until X2.
- New dependencies: none.
- For Devin: no new blockers.
