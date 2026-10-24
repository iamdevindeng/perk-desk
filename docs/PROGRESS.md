# Perk Desk: Progress log

Codex appends one section per task (AGENTS.md §3). Never delete earlier entries. All times UTC+8.

## Summary

| Task | Status | Commit | Notes |
|---|---|---|---|
| T1 Scaffold | PARTIAL | `5f58676` | Native UI fallback; shadcn registry unavailable |
| T2 Types + data | DONE | `c0a37b6` | Shared schemas and validated hand-written data |
| T3 Qloo layer + cache | DONE | `dade1da` | Pacing, safe errors, slim caching |
| T4 Filter / scoring | DONE | `ca588fd` | Filtering, evidence scores, branch balance |
| T5 Tools + guards 1–2 | DONE | `85e0537` | Real category and brand-tag evidence checks |
| T6 /api/plan | DONE | `579e7f4` | Guarded planning plus fallback |
| T7 /api/run | DONE | `c361601` | Streaming research, pitches, limits, replay |
| T8 UI profile | DONE | `c4d0ffc` | Presets, local profile, branch editor/map |
| T9 Confirm + trace | DONE | `b0df1a5` | Explicit confirmation and six-step trace |
| T10 Cards, map, CSV, status | PARTIAL | `75c7388` | Implemented; native spreadsheet opening unverified |
| T11 Eval | DONE | `2766908` | 15/15 hits after one prompt refinement |
| T12 Smoke + summary | DONE | `2b10196` | Agent/fallback smoke and missing-key exit verified |

Optional extras: X1 list uploads completed in `29ddfe8`; X2 business-member matching and badges are DONE in the final `X2:` commit.

The local flow works from a saved profile through planning, explicit category confirmation, streamed research, evidence cards, map selection, CSV download, and saved follow-up exclusions. Live browser checks returned 10 merchants. The final category eval reached 15/15 hits with macro precision 0.536; this small development set does not establish general recommendation quality.

Final automated verification: 404 offline tests across 40 files, lint, production build, and repository rules all pass after X2. Live agent/fallback smoke evidence is recorded under T12; the category eval is under T11. The local dev server was stopped after browser checks; restart with `npm run dev`.

Known limits: native wrappers replace unavailable shadcn-generated components; spreadsheet opening remains unverified after a capture failure; fallback chooses the highest-popularity candidate for ambiguous brands (REI selected Real Madrid CF in the forced-fallback smoke, requiring user correction); cache/rate state without Upstash is per process; locations and live category coverage may vary. No deployment or remote repository action was performed. The existing `.env.example` deletion remains outside every task commit.

## Waiting for Devin

Things Codex must not do (remote actions, accounts, secrets) or could not finish. Add items as they come up.

- [ ] Push the repo to GitHub (no remote is configured on purpose).
- [ ] Create the Vercel project, set env vars (QLOO_API_KEY, DEEPSEEK_API_KEY, optional UPSTASH_*, JUDGE_BYPASS_CODE), deploy, check `maxDuration`.
- [ ] Set a private `JUDGE_BYPASS_CODE` for judging and verify the limit/retry flow in the deployed environment.
- [ ] Review the UI in a real browser, including mobile layout, keyboard use, and accessibility; check recognized brand choices before confirming, especially in fallback mode (see T12).
- [ ] Optional: create an Upstash Redis database and add its REST URL/token.
- [ ] Review the pre-existing deletion of `.env.example`; Codex leaves it untouched and outside task commits.
- [ ] Retry shadcn registry installation when reachable; T1 uses small native UI wrappers after initialization and direct registry downloads failed.
- [ ] Open the downloaded CSV in a spreadsheet: native Numbers capture failed during T10; the browser download and CSV parser checks passed.
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

- T5: Installed ai 7.0.150 exposes `generateText` with `instructions`, `tool` (re-exported from provider-utils), `isStepCount`, `StopCondition`, `LanguageModel` (v2/v3/v4 supported), and `MockLanguageModelV4` from `ai/test`. No API-name substitutions are needed. `Output.object` is available for T7.
- T5: Expose up to 25 allowed tag names plus their exact IDs in tool results; otherwise the model could not submit the required real brandTagId evidence. No denied tags are exposed.
- T5: Preserve fatal Qloo errors in per-request context as well as throwing, because SDK tool execution can catch exceptions. Orchestrators must check this state before fallback or success. Count uncached logical Qloo lookups in qlooCalls; trace also records cache hits.

- T6: Follow ARCHITECTURE §5's two-category minimum when it conflicts with T6's one-valid-category test example. Two valid categories plus an invalid one can stay in agent mode; one valid category is preserved while fallback completes the plan.
- T6: Preserve ambiguous brand choices referenced by valid partial-plan evidence during fallback. Generic and saved-preference categories state that they need confirmation; every category still passes observed category and allowed-tag guards. Brands without permitted tags cannot justify fallback categories.
- T6: Stop model generation as soon as a fatal Qloo error is stored in context, then propagate the safe error instead of falling back.

- T7: The run orchestrator returns RunResult; the route alone emits result, and the stream helper alone emits done. This prevents duplicate terminal events. Replay marks Qloo events cached and resets elapsed timestamps.
- T7: Exact card identity labels are masked before pitch number/sentence checks, allowing real names such as “Cafe 42” without permitting unsupported numeric claims. Unsafe institution labels use “our credit union”; an impossible overlong merchant identity leaves the pitch empty with a warning.
- T7: Preset run exemptions additionally require matching resolved entity IDs and unique branch/brand identities. A customized preset without the canonical default plan cache uses normal limits. IP rejection does not consume global budget; global rejection may consume the IP attempt. Redis exhaustion remains remembered until its reset during outages.

- T8: Load browser storage after hydration in a queued microtask to keep server/client initial markup identical. Persist every valid profile edit; temporarily invalid required fields leave the last complete saved profile intact.
- T8: Changing an address clears its previous coordinates. Run request construction only borrows planned coordinates for the same branch ID and unchanged address. Business-member names stay empty until optional X2.
- T8: Use a consistent light slate/teal interface for the native component fallback. Member-brand text and preset selection remain session state; only the documented profile and judge-code keys persist.

- T9: A changed brand candidate disables confirmation until re-planning refreshes evidence. Category edits clear previous research results and trace; profile/brand edits also invalidate the plan.
- T9: Fix T8 request building to research only branches that survived location resolution, while keeping unresolved branches visible for repair. Preserve current edits on resolved branches and show readable validation errors instead of raw schema output.
- T9: The stream client requires one terminal outcome followed by done, handles UTF-8/chunk boundaries, and skips malformed lines with a static warning. A truncated stream is an error rather than an indefinitely running UI.

- T10: Export the currently visible merchant list, matching the map and Independents only filter. Label exclusion totals as candidate matches because repeated branch/category candidates are not distinct merchants. Display ratings with one decimal to avoid provider floating-point artifacts.

- T11: Force the normal Vitest eval reporter because its automatic agent reporter hides successful-test metrics. Report both macro-average and micro-average precision; errors score zero and never expose raw provider details. One prompt-only tuning round prefers core/common merchant categories over narrow synonyms; no case data or guards changed.

- T12: The npm smoke command uses a POSIX file-presence conditional so a missing `.env.local` reaches the required missing-key exit 2. This avoids a new dependency and stays compatible with Node 20.9; macOS/Linux or WSL is required. Empty plans or merchant lists fail the smoke check rather than reporting a false success.
- T12: Preserve the specified first-candidate fallback for ambiguous brands; document the observed REI ambiguity instead of adding an unrequested alias heuristic. The UI exposes candidate correction before research.

- X1: Both CSV and text uploads interpret columns; comma-containing names must be quoted. Import replaces the visible editable list, skips a first name/merchant/brand header, and shares existing dedupe/list limits. Normalize embedded cell line breaks to spaces. Reject malformed/empty or oversized files without clearing existing text; cap uploads at 1 MiB.

- Final review correction to T12 wording: `fallback-plan.ts` already sorts ambiguous candidates by popularity and selects the highest; it does not simply use Qloo response order. The observed REI mismatch and need for user correction are unchanged. Earlier T12 wording is retained as history.

- X2: Apply business-member name matching after filtering/scoring so it changes only the badge field. Reuse the local list editor/upload control for signed and business-member lists. Existing CSV export automatically includes the membership flag.

## Review guide

1. `src/lib/types.ts`: follow the validated profile, plan, run, and trace shapes.
2. `src/lib/config.ts`: review limits, timeouts, score weights, and display constants.
3. `src/lib/qloo/client.ts`: check approved-host enforcement, key header, pacing, errors, and slim cache boundaries.
4. `src/lib/merchants/scoring.ts` and `shortlist.ts`: review rank lift, brand shares, deduplication, and branch balance.
5. `src/lib/agent/guards.ts`: review category provenance, allowed-tag evidence, and pitch checks.
6. `src/lib/agent/plan-agent.ts` and `run-agent.ts`: follow model/tool orchestration and deterministic fallback.
7. `src/app/api/run/route.ts` and `src/lib/stream.ts`: check validation, cache replay, rate limits, and terminal-event ownership.
8. `src/lib/request-builders.ts` and `run-client.ts`: follow profile conversion, status exclusions, and chunk-safe NDJSON reading.
9. `src/app/page.tsx`: follow useState-based UI coordination and invalidation after edits.
10. `src/components/{CategoryConfirm,AgentTrace,MerchantCard,MerchantMap}.tsx`: inspect evidence, progress, status controls, and linked selection.
11. `src/lib/csv.ts`, `tests/eval/category-eval.test.ts`, and `scripts/smoke.ts`: review exports and repeatable verification.
12. `tests/unit/`: inspect offline fake-data coverage for the behavior you change.

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

### T5: Agent tools and guard layers 1–2 — DONE
- Date/time (UTC+8): 2026-10-23 22:10
- What was done:
  - Added isolated plan/run contexts, safe trace helpers, fatal-error state, and deterministic DeepSeek settings.
  - Added brand-resolution and category-search tools with real evidence IDs and cached density hints.
  - Added merchant research tools with seeded/baseline calls, partial-failure handling, one replacement per original category, and global duplicate/count refresh.
  - Added submission/category/evidence guards with real chosen-brand membership and defensive tag filtering.
  - Verified the installed SDK APIs and added mocked tool/context/guard tests.
- Files touched: `src/lib/agent/{context,model,guards}.ts`, `src/lib/agent/tools/{resolve-brands,search-categories,find-merchants}.ts`, `src/lib/config.ts`, `tests/unit/{context,guards,resolve-brands,search-categories,find-merchants}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npx vitest run tests/unit/guards.test.ts
  ```
- Verification: PASS first standard attempt; 202 tests across 20 files; focused guard check 10 tests passed.
- Live checks: none; all services mocked.
- Open issues / decisions: original ambiguous status is retained when a model chooses a brand so the one correction can change that choice. Guard code leaves submit counts and acceptance to T6. Category density refresh includes previously found categories when later results reveal duplicate names. SDK Tool<Input,Output> annotations are library types, not custom generic abstractions.
- New dependencies: none.
- For Devin: no new blockers.

### T6: Planning API with guarded agent and fallback — DONE
- Date/time (UTC+8): 2026-10-23 22:21
- What was done:
  - Added compact plan, research, and pitch prompts with only the relevant public business and aggregate taste fields.
  - Added preset expansion, locality resolution, plan tool loop, one correction, deterministic omitted-brand completion, and fatal-error propagation.
  - Added all documented fallback keyword rules, honest default evidence, saved preferences, and guarded backfill preserving valid agent categories.
  - Added validated `/api/plan`, canonical nonempty-result caching, and safe JSON errors.
  - Added model-driven, fallback, route, and prompt boundary tests.
- Files touched: `src/lib/config.ts`, `src/lib/agent/{prompts,plan-agent}.ts`, `src/lib/fallback/{category-map,fallback-plan}.ts`, `src/app/api/plan/route.ts`, `tests/unit/{category-map,fallback-plan,plan-agent,plan-route,prompts}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npx vitest run tests/unit/plan-agent.test.ts tests/unit/plan-route.test.ts tests/unit/category-map.test.ts tests/unit/fallback-plan.test.ts
  ```
- Verification: PASS (256 tests, production build, lint, rules). Repeated the standard checks after the fatal-error stop-condition review fix.
- Live checks: documented Denver preset call returned agent mode, 6 categories (Outdoor clothing and equipment shop, Coffee shop, Brewery, Yoga studio, Health food store, Pet supply store), and 0 unresolved names. Response time about 16 seconds. Printed only mode/counts/names, stored no response files, and stopped the local server.
- Open issues / decisions: architecture's two-category minimum takes precedence over the inconsistent task test example; fallback labels unsupported generic/default inference honestly. Location approximation requires later user map confirmation. See decisions above.
- New dependencies: none.
- For Devin: no new action beyond the existing list.

### T7: Streaming research, grounded pitches, cache replay, and limits — DONE
- Date/time (UTC+8): 2026-10-23 22:28
- What was done:
  - Added NDJSON framing, elapsed timestamps, safe errors, cancellation handling, and exactly one terminal outcome followed by done.
  - Added research orchestration with deterministic completion, one adjacent fallback per thin category, balanced shortlist, brand checks, category reports, and six step pairs.
  - Added batched structured pitches, metric/identity guards, honest baseline templates, and safe handling of impossible pitch lengths.
  - Added run cache/replay and both-route daily limits, with judge/preset exemptions and Redis outage behavior.
  - Added offline route integration with fake Qloo data and model disabled, plus boundary, pitch, stream, limit, and model tests.
- Files touched: `src/lib/{stream,config}.ts`, `src/lib/agent/{run-agent,pitch-writer,guards,prompts}.ts`, `src/lib/fallback/{fallback-run,pitch-template}.ts`, `src/lib/store/rate-limit.ts`, `src/app/api/{plan,run}/route.ts`, `tests/unit/{stream,pitch,rate-limit,run-agent,run-route,run-route-integration,plan-route}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npx vitest run tests/unit/run-route-integration.test.ts tests/unit/run-agent.test.ts tests/unit/pitch.test.ts tests/unit/rate-limit.test.ts
  ```
- Verification: PASS (329 tests, production build, lint, rules). First standard attempt passed lint/tests but build found an AI SDK Tool return-type literal mismatch; explicit execute return typing fixed it and typecheck passed. The next standard run passed. A separate optional live-check command had a missing closing delimiter before making requests; corrected and rerun successfully.
- Live checks: Denver plan returned agent mode with 5 categories and 0 unresolved names. Research returned agent mode with 10 merchants; stream contained 12 step events, 6 tool calls, 40 Qloo events, 6 tool results, 3 agent notes, exactly 1 result and 1 done. Printed counts/names only and wrote no response files; local server stopped.
- Open issues / decisions: local fallback budgets remain per process, as designed; shared production enforcement needs optional Upstash. Customized preset plans can fall under normal limits. Pitch guard validates allowed numbers, length and identity; it is not a general fact checker. Decisions above explain identity handling and terminal-event ownership.
- New dependencies: none.
- For Devin: optional Upstash and judge-code setup remain in the waiting list.

### T8: Saved profile, presets, taste input, and branch map — DONE
- Date/time (UTC+8): 2026-10-23 22:35
- What was done:
  - Added browser profile/judge storage, safe line-list parsing, validated plan/run request builders, and planning HTTP handling.
  - Added two preset buttons, institution/city fields, signed-merchant paste box, 1–5 branch editor with radius and map picking, and six taste segments.
  - Added a client-only Leaflet map with branch markers, trade-area circles, city panning, and OpenStreetMap attribution.
  - Connected page state, form invalidation, saved profiles, pending/error planning feedback, and temporary category labels.
- Files touched: `src/app/{page.tsx,globals.css}`, `src/components/{PresetPicker,ProfileForm,BranchEditor,TasteInput,MerchantMap}.tsx`, `src/lib/{config,profile-storage,request-builders,run-client}.ts`, `tests/unit/{profile-storage,request-builders,post-plan}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  Open http://localhost:3000, select Try Denver demo, inspect three trade-area circles, then reload.
- Verification: PASS (351 tests, production build without a Leaflet SSR/window error, lint, rules).
- Live checks: in-app browser rendered the Denver fictional institution, 3 branches and 3 map circles. Reload retained the profile, branch locations and signed-merchant list. Brand input resets on reload as session state. No live API research was triggered during this browser check. Local server stopped.
- Open issues / decisions: storage-unavailable sessions still work but cannot persist. Temporarily invalid profiles keep the last valid saved version. T9 adds category confirmation and research controls; current planning output is intentionally temporary.
- New dependencies: none.
- For Devin: broader real-browser and accessibility review remains for final acceptance.

### T9: Category confirmation, preference memory, and live trace — DONE
- Date/time (UTC+8): 2026-10-23 22:48
- What was done:
  - Added recognized-brand choices, guarded re-planning, evidence rows, category add/remove controls, and explicit confirmation capped at five categories.
  - Added conflict-free preference merging and saved preferences when confirming research.
  - Added robust NDJSON reading with judge headers, safe errors, chunk handling, and completion validation.
  - Added six progress rows, capped detail lines, Qloo/cache counts, fallback/error/limit panels, and masked judge-code retry controls.
  - Fixed partial branch resolution and cleared stale results when categories change.
- Files touched: `src/app/page.tsx`, `src/components/{CategoryConfirm,AgentTrace}.tsx`, `src/lib/{config,request-builders,run-client}.ts`, `tests/unit/{run-client,preferences,request-builders}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  In the browser: Denver demo → Plan → edit categories → Confirm & find merchants → inspect progress and result preview.
- Verification: PASS (370 tests, production build, lint, rules). Full checks repeated after independent integration review fixes.
- Live checks: Denver plan completed in about 16 seconds. Six proposed categories initially selected five; removed one and selected the sixth. Server log showed only `/api/plan` before Confirm. After Confirm, live research completed in about 23 seconds with 10 merchants and six done steps. Editing a category afterward cleared the prior result. A browser permission-review timeout succeeded on its single retry; a stale tab after server restart was replaced with a fresh local test tab.
- Open issues / decisions: evidence cards arrive in T10; this task displays a merchant-name result preview. Invalid/truncated stream behavior is covered offline. The existing local dev server stays running for the next browser check.
- New dependencies: none.
- For Devin: no new owner-only action.

### T10: Evidence cards, map selection, CSV, and follow-up status — PARTIAL
- Date/time (UTC+8): 2026-10-24 10:32
- What was done:
  - Added branch-grouped cards with available evidence, ratings, links, pitches, copy feedback, and saved follow-up statuses.
  - Added result/category/exclusion summaries, independent filtering, and agent/fallback labels.
  - Added selectable merchant markers, keyboard activation, two-way selection, card scrolling, and result bounds fitting.
  - Added CSV export with exact column order, RFC 4180 escaping, text formula protection, and status lookup.
- Files touched: `src/app/page.tsx`, `src/components/{MerchantCard,MerchantMap,ExportButton}.tsx`, `src/lib/{config,csv}.ts`, `tests/unit/csv.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  Denver demo → Plan → Confirm → copy a pitch, select a card/marker, export CSV, mark a merchant Not a fit, and Confirm again.
- Verification: PASS (380 tests, production build, lint, rules). Independent review fixed stale Copied feedback after a later clipboard failure; browser inspection prompted one-decimal rating display. Final standard checks passed after both changes.
- Live checks: Denver produced 10 cards and 10 merchant markers. Copy showed Copied; card selection changed the matching marker; clicking a marker highlighted and scrolled its card. CSV downloaded after an overnight browser permission wait; an offline parser verified 10 data rows and 16 columns. Marked Denver ChopHouse & Brewery Not a fit; the next completed 10-merchant run omitted it and showed one status exclusion. Screenshot saved outside the repository.
- Open issues / decisions: implementation is complete, but opening CSV in a native spreadsheet remains unverified. Attempting Numbers failed with ScreenCaptureKit capture error -3811 before the file could be opened. No approval bypass or alternative UI automation was attempted. This manual acceptance gap makes the task PARTIAL; independent work continues under the unattended rule.
- New dependencies: none.
- For Devin: open the downloaded CSV in a spreadsheet (also in Waiting for Devin).

### T11: Live category evaluation — DONE
- Date/time (UTC+8): 2026-10-24 10:43
- What was done:
  - Added the exact 15 hand-written case definitions and validated all expected category IDs against defaults.
  - Added sequential live planning, safe per-case progress and summary metrics, with missing-key skipping.
  - Added explicit evaluation timing/metric constants and a normal reporter so successful runs display metrics.
  - Tuned only the planning prompt once to favor core products/services and common broader merchant categories supported by real evidence.
- Files touched: `tests/eval/{cases.json,category-eval.test.ts}`, `vitest.eval.config.ts`, `src/lib/config.ts`, `src/lib/agent/prompts.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run eval
  env QLOO_API_KEY= DEEPSEEK_API_KEY= npm run eval
  ```
- Verification: PASS (380 offline tests, production build, lint, rules). With empty keys, static case validation passed and the live test skipped. Offline tests also passed with empty keys. Final standard checks passed after prompt tuning.
- Live checks: the initial successful run took 147.96 seconds but the automatic reporter hid metrics, so it was repeated with explicit reporting. Measured baseline: 10/15 hits (66.7%), macro precision 0.300, micro precision 0.288, 0 fallbacks, 0 errors, 125.697 seconds. Prompt tuning round 1: 15/15 hits (100%), macro precision 0.536, micro precision 0.540, 0 fallbacks, 0 errors, 138.256 seconds. No second tuning round was needed. Only names and metrics were printed; no response files were written.
- Open issues / decisions: this is a small development evaluation, not proof of general relevance; precision remains below perfect and live results can vary. The baseline misses often reflected narrower plausible categories rather than failed brand resolution. Reporter configuration is a necessary T1 follow-up for this task.
- New dependencies: none.
- For Devin: no new owner-only action.

### T12: Smoke script and final review summary — DONE
- Date/time (UTC+8): 2026-10-24 10:48
- What was done:
  - Added a CJS-safe Denver pipeline smoke command with safe reporting, missing-key handling, event counts, and repeat-plan cache timing.
  - Verified real-key agent research and explicitly disabled-agent fallback research.
  - Updated only the README status and local-run section, preserving compliance text.
  - Filled the task/commit summary, end-to-end status, known limits, owner waiting list, and file review guide.
- Files touched: `scripts/smoke.ts`, `package.json`, `README.md`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run smoke
  PD_AGENT_DISABLED=1 npm run smoke
  env QLOO_API_KEY= DEEPSEEK_API_KEY= npm run smoke
  ```
  The last command must exit 2 with the missing-key message; all other commands should exit 0 with working keys.
- Verification: PASS (380 tests, production build, lint, rules). A sandbox-only smoke attempt failed before script execution because tsx could not open its local IPC socket; approved local execution resolved it. The keyless run exited 2 with the exact required message. No remote actions were performed.
- Live checks: agent plan resolved 8 brands with 0 unresolved, proposed 6 categories in 14,177 ms; research used the first 5, returned 10 merchants and 10 agent pitches in 16,268 ms with 40 Qloo calls. Repeat plan: 10,081 ms, faster=true, 12 Qloo cache hits. Forced fallback: 8 resolved/0 unresolved, 4 categories in 3,671 ms; 10 merchants and 10 template pitches in 14,163 ms with 34 Qloo calls. Repeat plan: 14 ms, faster=true, 12 cache hits. Both live commands exited 0 and wrote no response files. AI SDK printed its static JSON-schema compatibility warning during the agent run.
- Open issues / decisions: forced fallback selected Real Madrid CF for the ambiguous input REI, following the documented first-candidate rule; agent mode selected Recreational Equipment Inc correctly. Users must inspect and correct recognized brands before confirming. This exposes a fallback relevance limit, not a failed pipeline. CSV spreadsheet opening and shadcn registry installation remain the earlier PARTIAL items. Timing comparisons are observations, not performance guarantees.
- New dependencies: none.
- For Devin: push/deploy/resources/judge code and broader browser review are listed above; all remain owner actions.

### X1: CSV/text upload for editable lists — DONE
- Date/time (UTC+8): 2026-10-24 10:53
- What was done:
  - Added accessible CSV/text inputs beside signed-merchant and member-brand paste boxes.
  - Added first-column parsing for quoted/escaped/multiline CSV, header skipping, trimming, deduplication, and list limits.
  - Added readable errors, file-size guards, same-file retry, and protection against stale reads overwriting newer input.
  - Kept imported text visible and editable, including the existing over-10-brand validation.
- Files touched: `src/components/{ProfileForm,TasteInput}.tsx`, `src/lib/{config,request-builders}.ts`, `tests/unit/uploaded-list.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  Import a small CSV/text file into each list; inspect and edit the resulting first-column names.
- Verification: PASS (397 tests, production build, lint, rules). Parser coverage includes mixed line endings, quoted commas/quotes, multiline cells, headers, empty data, malformed quotes, deduplication, and cap behavior.
- Live checks: browser imported one handwritten fake CSV into both fields; each displayed three expected names, preserved a quoted comma and escaped quotes, and the brand count showed 3/10. No API research was requested for this check.
- Open issues / decisions: uploads use CSV syntax even for .txt; ordinary pasted text remains one name per line and retains unquoted commas. Business-member upload arrives with X2's new field.
- New dependencies: none.
- For Devin: no new owner-only action.

### X2: Business-member matching and badges — DONE
- Date/time (UTC+8): 2026-10-24 10:57
- What was done:
  - Added an optional saved business-member paste box with the same CSV/text import controls.
  - Included parsed/deduplicated business-member names in research requests.
  - Matched normalized merchant names after scoring/filtering and displayed the Already a business member badge.
  - Verified unchanged scores, order, exclusions, independent counts, and coexistence with multi-location badges.
- Files touched: `src/components/{ProfileForm,MerchantCard}.tsx`, `src/lib/request-builders.ts`, `src/lib/agent/tools/find-merchants.ts`, `tests/unit/{request-builders,business-members,merchant-card}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  npm run dev
  ```
  Add business-member names before planning; matching cards show a badge without a ranking boost.
- Verification: PASS (404 tests, production build, lint, rules). One targeted test initially assumed incidental alphabetical ordering; it was corrected to compare membership by name while a separate test compares the complete ranking/order before and after matching. Final standard checks passed.
- Live checks: imported handwritten fake names into the business-member field, reloaded, and verified persistence. Restored the Denver preset afterward. No API calls were made for this UI check; matching and rendered badge behavior were verified with offline fake fixtures. Local development server stopped after checks.
- Open issues / decisions: business membership is a badge only and does not exclude merchants, change ranks, or become a pitch claim. Final review corrected T12's explanation of ambiguous fallback selection (highest popularity, as the existing code already implemented); earlier historical wording remains with an explicit correction above. Previously recorded T1/T10 gaps remain owner review items.
- New dependencies: none.
- For Devin: all owner-only actions and remaining manual checks are listed in Waiting for Devin.
