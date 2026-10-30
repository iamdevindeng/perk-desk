# Perk Desk: Progress log

Codex appends one section per task (AGENTS.md §3). Never delete earlier entries. All times UTC+8.

## Summary

| Task | Status | Commit | Notes |
|---|---|---|---|
| T1 Scaffold | PARTIAL | `c0e2952` | Native UI fallback; shadcn registry unavailable |
| T2 Types + data | DONE | `93c69d1` | Shared schemas and validated hand-written data |
| T3 Qloo layer + cache | DONE | `f4f588a` | Pacing, safe errors, slim caching |
| T4 Filter / scoring | DONE | `1337f4a` | Filtering, evidence scores, branch balance |
| T5 Tools + guards 1–2 | DONE | `cef91f0` | Real category and brand-tag evidence checks |
| T6 /api/plan | DONE | `c1bbfa0` | Guarded planning plus fallback |
| T7 /api/run | DONE | `2251cef` | Streaming research, pitches, limits, replay |
| T8 UI profile | DONE | `207e99e` | Presets, local profile, branch editor/map |
| T9 Confirm + trace | DONE | `a8df356` | Explicit confirmation and six-step trace |
| T10 Cards, map, CSV, status | PARTIAL | `1cdce09` | Implemented; native spreadsheet opening unverified |
| T11 Eval | DONE | `3eede5a` | 15/15 hits after one prompt refinement |
| T12 Smoke + summary | DONE | `3748a6f` | Agent/fallback smoke and missing-key exit verified |

Optional extras: X1 list uploads are DONE in `c12eab3`; X2 business-member matching and badges are DONE in `5a50d52`.

R13–R15 update (2026-10-24): all three fixes pass. Final verification: 868 offline tests / 58 files, lint, typecheck, production build, and repository/privacy checks. Exact-name chains are excluded without blocking the specified independent names; fresh Denver/Austin fallback smoke checks each return 10 merchants with zero chain matches. Actual CI/Vercel clean installs create no hooks, local hooks retain every required check, and merchant sample names are plausible invented examples. Detailed evidence follows in the R13–R15 entries.

The local flow works from a saved profile through planning, explicit category confirmation, streamed research, evidence cards, map selection, CSV download, and saved follow-up exclusions. Live browser checks returned 10 merchants. The final category eval reached 15/15 hits with macro precision 0.536; this small development set does not establish general recommendation quality.

Latest automated verification after R11: 634 offline tests across 52 files, lint, typecheck, production build, and repository rules all pass. R11 adds chain exclusions and smoke assertions, removes local machine paths, and checks every tracked text file for their recurrence. Both fallback presets pass the maintained exclusion predicates; the ambiguous Chico's name remains a documented limitation. R10 passed 555 offline tests across 51 files. R10 lowers daily budgets, requires shared rate limits for live Vercel production requests, and logs private usage counts. The R1–R9 second review passed 524 offline tests across 48 files plus fresh Denver/Austin agent and fallback smoke checks; see that entry below. The category eval is under T11. The local dev server was stopped after browser checks; restart with `npm run dev`.

Known limits: native wrappers replace unavailable shadcn-generated components; spreadsheet opening remains unverified after a capture failure; fallback uses name matching and asks for a user choice when names do not match; cache/rate state without Upstash is per process; locations and live category coverage may vary. The requested pull completed; no push or deployment was performed during R1–R9. R3 restored `.env.example` exactly from the original docs commit.

Earlier T1–T12 review repairs (2026-10-24): all seven reported findings were fixed locally; 467 offline tests across 44 files, lint, production build, repository rules (142 files), and typecheck passed. Agent/fallback smoke and the Confirm/map browser check passed. See that review-repair entry for its evidence and cache recovery. T1 and T10 remain PARTIAL.

## Waiting for Devin

- [ ] R41: review the local branch-lookup commit and test Find branches in the local browser; live API checks were intentionally left to Devin. No push is authorized.

- [ ] R9: review the local R39–R40 commits before deciding on any push.

- [ ] R8: review the local R36–R38 commits and decide when to push.

- [ ] R7: review and push the R6 + R7 commits together when ready. Replace the public social preview with a real demo screenshot after the existing R27 demo re-warm.

- [ ] R31: verify the public limit/retry flow after deployment and remove the retired access-code variable from Vercel settings.

- [ ] R27: re-warm Denver and Austin once after deploy by opening each demo. Known category mismatches invalidate only their cached run, so the next run stores a clean result; this supersedes the R20 manual-key-deletion suggestion. No remote cache was changed here.

- [ ] R20: re-warm Austin once after deploy if a full ten-card cached demo is wanted; the client removes its duplicate immediately. R27 will also handle stale category caches.

Things Codex must not do (remote actions, accounts, secrets) or could not finish. Add items as they come up.

- [ ] R6: review R16–R29 local commits and authorize a push after completion. No push or deployment is authorized by this request.
- [x] R16 supersedes the older code-setup items below: public demos and live research require no access code.

- [x] Authorize the R11c/R12 push: on 2026-10-24 the user explicitly authorized coordination, commit, and push despite the no-remote-actions rule. The coordinated finalization entry below supersedes the earlier publishing blocker.
- [x] Authorize publishing the local commits: the R10 request explicitly permits the agent to push the rebased R1–R9/review commits together with R10 after verification, superseding the earlier no-push instruction.
- [ ] Create the Vercel project, set env vars (QLOO_API_KEY, DEEPSEEK_API_KEY, required UPSTASH_* for production live work), deploy, check `maxDuration`.
- [x] Older private-code setup is superseded by R16; public research uses no access code.
- [ ] Review the UI in a real browser, including mobile layout, keyboard use, and accessibility; check recognized brand choices before confirming, especially in fallback mode (see T12).
- [ ] Before enabling live Vercel production research, create an Upstash Redis database and add both REST URL/token values. R10 returns HTTP 503 for live cache misses without them; validate this behavior in the deployed environment.
- [x] Restore `.env.example`: completed by R3 from `cfe3521`; `.env.local` remains untouched.
- [ ] Retry shadcn registry installation when reachable; T1 uses small native UI wrappers after initialization and direct registry downloads failed.
- [ ] Open the downloaded CSV in a spreadsheet: native Numbers capture failed during T10; the browser download and CSV parser checks passed.
- [ ] Review npm installation audit output (5 high-severity findings in the pinned dependency tree); no forced dependency upgrades were made.

- [x] Review the remaining ambiguous-name case: R13 adds exact-name matching for Chico's and the other requested ambiguous chains. The fresh Austin smoke no longer returns Chico's; Chico's Cafe remains eligible. See the R13 entry for current smoke evidence.

## Decisions I made

(Interpretations of unclear spec points, with the reason. One bullet each.)

- R13–R15: the current user request explicitly authorizes pulling and pushing after all three items pass, superseding the older no-remote-actions rule for those Git operations. Keep one commit per item and leave deployment and resource provisioning out of scope.
- R13: keep ambiguous-name normalization separate from general merchant matching so leading articles and legal-name words are not silently dropped. Use deterministic fallback with real Qloo calls and memory cache for both city smoke checks, matching the R11 baseline. Add GANNI and Tecovas to the unambiguous list because successive Austin shortlists exposed them after the requested exclusions; their official store locators confirm nationwide retail presence.
- R12 coordinated finalization: the user's explicit push authorization supersedes the previous no-remote-actions blocker for publishing R11c/R12. The other active R12 chat confirmed its subagents and tool processes stopped; this chat owns final staging, verification, commit, and push. Deployment and resource provisioning remain out of scope.
- R12 follow-up: interpret public SVG path data narrowly as numeric `d` attributes on `path` elements in the five existing exact asset paths. Mask that data only for IP/phone checks, preserving line positions; scan all original bytes for every other content rule. Add ICO to the image restriction so the exact Next.js favicon exception is meaningful. Preserve existing R12 work and include it in the completed local commit.
- R11c/R12: R11a and R11b are already committed at task start; verify their implementation and continue with the remaining items in order. Automatic approval review blocked the requested pull because of the older remote-action rule. Continue authorized local work while explicit confirmation for pull/push is pending; do not bypass that block.

- R11: The current request authorizes pulling and pushing the two verified R11 commits; deployment and resource provisioning remain out of scope.
- R11a: Remove the existing bare Gap entry because whole-word matching rejects Mind the Gap Cafe. Omit bare Columbia, Marmot, and Chico's for the same ambiguity risk; use the distinctive Columbia Sportswear name. Keep the matching algorithm, local multi-location badges, and default visibility unchanged. Zero smoke matches means zero matches against the maintained chain/team-store predicates, not proof that every result is independent.
- R11b: Sanitize the task document's own home-directory examples as well as the historical screenshot path, because the no-allowlist requirement applies to all tracked text. Scan before the existing lockfile/asset exemptions. Skip NUL-containing or invalid UTF-8 binary content, and use NUL-delimited Git filenames so unusual names remain covered. Previously published Git history remains unchanged.

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

- Review repair: preserve failure separately from successful empty data. An unavailable baseline has null rank lift before scoring; an incomplete category has a new `incomplete` report status so the UI does not claim sparse local supply. This small extension to ARCHITECTURE §3 is required for truthful partial results; no endpoint or existing field was renamed.
- Review repair: keep fixed cache keys and TTLs, but require `{ complete: true, events }` for run replay, `{ count, complete: true }` for density hints, and `{ validated: true, value }` for slim Qloo values. Legacy values are misses and recover lazily from healthy requests. Run cache eligibility is passed internally through `RunOptions.onCacheable`; RunResult needs no cache metadata field.
- Review repair: ARCHITECTURE §3's RunRequest example replaces bounded Branch coordinates with bare `z.number()`, losing bounds. Reuse the required inner Branch schemas instead. Architecture is left unchanged as instructed; this discrepancy is recorded here.
- Review repair: use request-generation refs and an immediate busy ref to ignore late events/errors/stage changes and block captured map handlers before React rerenders. These refs do not replace frontend useState.

- R1 review fixes: the current user explicitly authorized `git pull` and forbade pushing; only the pull overrides the older remote-action restriction. R1–R9 use separate local commits under the requested author.
- R1: use whole-word prefixes so REI cannot match Reiss; calculate acronyms before stripping corporate suffixes. Add optional `ambiguousBrands` to PlanResponse so unmatched names can be explicitly chosen without a guessed entity. PresetSchema has no brandOverrides, so preset JSON stays unchanged. Smoke now checks both presets sequentially.

- R4: no tag hierarchy is available in CategoryEvidence, so specificity uses tag-name word count then character length, with stable ties. Sort stronger agent/rule evidence first, dedupe by brand/tag pair, and cap only after category frequency ranking. Native details/summary provides the requested keyboard-accessible expansion. R6 will replace legacy reason-prefix classification with explicit kinds.

- R6: extend CategoryEvidence with a required discriminant: agent/rule carry real brand/tag fields; preference/default carry only kind and reason. Defaults can therefore be suggested for resolved brands with no permitted tags, while still passing the observed-category guard. Non-brand suggestions dedupe by kind/reason. Missing-kind cached plans are misses at the same keys; no cache flush or migration is needed.

- R1–R9 second review: preserve explicit agent/user brand choices independently of which evidence survives the cap. Successful agent completion keeps its observed exact/prefix matches; failed/disabled planning still ranks implicit choices by name then popularity. Backfill reuses finalized choices so it cannot detach retained evidence. Merge saved-preference and observed rule evidence for the same category without changing preference order or removal precedence.

- R10: The current user explicitly authorized `git pull --rebase` and a combined push after completing R10. This overrides the older remote-action ban for those Git operations only; deployment and provisioning remain owner actions. The pull preserved ten local commits by rebasing them onto the remote R10 task document.
- R10: Every cache miss, including judge and cold-preset requests, needs the global budget and a working shared store in Vercel production. Cached results remain unlimited. Judge codes bypass only per-IP limits. Both routes return the existing client-compatible `config` error code with the requested safe message and HTTP 503 on store failure.
- R10: Add `src/lib/store/usage.ts` (also listed in ARCHITECTURE §2) to separate usage counting from rate limiting. Node's built-in AsyncLocalStorage isolates concurrent live runs without threading counters through every helper; no dependency was added. Log actual outbound HTTP attempts including retries/failures, excluding cache hits. Existing result/trace logical Qloo counts keep their current meaning.

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

### Review repair: seven reported findings — DONE
- Date/time (UTC+8): 2026-10-24 11:38
- What was done:
  - Preserved successful-empty, failed, and partial place lookups; full outages emit error/done, partial merchants remain useful, and incomplete research is never stored as a complete run or density.
  - Cleared map picking on Confirm and Retry, disabled picking while busy, and invalidated stale planning/research successes, failures, trace events, and stage writes on edits, newer requests, and unmount.
  - Removed unsupported rank-lift evidence before scoring when the baseline fails, while preserving taste evidence and the documented formula for successful empty baselines.
  - Rejected malformed and explicit-failure Qloo HTTP-200 envelopes with safe upstream errors; retained valid empty arrays, optional/unknown fields, and missing/empty locality behavior.
  - Propagated pitch provider/structured-output failures to a sanitized warning, fallback trace, and fallback mode without losing research; kept individual guard rejections separate. Preserved required coordinate bounds at both HTTP and direct research boundaries.
  - Documented per-process memory cache/rate-limit limitations and shared Redis configuration in README's Run locally section; added regression coverage and lazy recovery for legacy cache values at unchanged keys.
- Files touched: `README.md`, `docs/PROGRESS.md`; `src/app/{page.tsx,api/run/route.ts}`; `src/components/MerchantCard.tsx`; `src/lib/types.ts`; `src/lib/agent/{context,run-agent,pitch-writer}.ts`; `src/lib/agent/tools/{find-merchants,search-categories}.ts`; `src/lib/fallback/fallback-run.ts`; `src/lib/merchants/scoring.ts`; `src/lib/qloo/{client,insights,search,tags}.ts`; `tests/fixtures/page-harness.ts`; `tests/unit/{find-merchants,pitch,qloo-client,qloo-search,run-agent,run-route,search-categories,types,page-races,pitch-fallback-integration,qloo-envelopes,run-recovery}.test.ts`.
- Finding evidence:
  1. Run outage caching: `run-recovery.test.ts` verifies error/done, preserved prior density, same-request recovery without flushing, healthy replay without new limits/lookups, partial branch/taste/baseline failures, missing categories, chain-check failure, genuine empty success, and legacy envelope replacement.
  2. Map/request race: `page-races.test.ts` verifies Confirm and Retry with an armed pick, a captured old map callback, late plan success/failure, late run result/error/rejection, newer requests, and unmount. The real browser Confirm case also passed.
  3. Failed baseline: `find-merchants.test.ts` asserts null baseline rank/lift and score 0.32 before shortlist/pitches, retained taste signal, no density, and no false-thin replacement; `run-recovery.test.ts` covers both partial directions.
  4. Qloo envelopes: `qloo-envelopes.test.ts` verifies malformed-to-healthy recovery and caching for brands, categories, places, and localities; valid empty responses, optional metadata, and legacy values are covered. Existing normalization tests still pass.
  5. Pitch failure: `pitch-fallback-integration.test.ts` uses the real writer with scripted provider and structured-output failures; asserts retained grounded templates, sanitized fallback mode/event/warning, no run caching, and a separate ordinary guard-rejection path.
  6. Coordinates: `types.test.ts` covers accepted extreme bounds and rejected missing/out-of-range fields; `run-route.test.ts` verifies rejection before cache/limits/research; `run-agent.test.ts` verifies direct-call rejection before lookups or trace.
  7. README: Run locally now explains memory loss on restart, lack of sharing between serverless instances, and both Upstash environment names for shared cache/rate limits.
- How to verify:
  ```bash
  npm run lint && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run typecheck
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' npm run smoke
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' PD_AGENT_DISABLED=1 npm run smoke
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' NEXT_TELEMETRY_DISABLED=1 npm run dev -- --hostname 127.0.0.1
  ```
  Browser: Denver demo → Plan → Pick on map → Confirm → click the map while research runs. Picking turns off, profile controls remain disabled, coordinates remain unchanged, and results arrive normally.
- Verification: PASS: 467 offline tests in 44 files, lint, production build, check:rules over 142 files, typecheck, and `git diff --check`. Initial lint caught a custom-hook ref name that React did not recognize; renamed it to `versionRef`. The next full pass caught one test-table tuple typing error during build; corrected the table to named cases. The third full pass passed every required command. No lint/checker protections or dependencies were changed.
- Live checks: both smoke commands exited 0 with Redis disabled for the process. Agent plan: 8 resolved/0 unresolved, 6 categories, 22 Qloo calls, 16,090 ms; first 5 categories researched, 10 merchants/10 agent pitches, 40 Qloo calls, 16,844 ms; repeat plan 11,850 ms and 13 cache hits. Forced fallback: 8 resolved/0 unresolved, 4 categories, 12 Qloo calls, 4,154 ms; 10 merchants/10 template pitches, 34 Qloo calls, 15,189 ms; repeat plan 16 ms and 12 cache hits. The static SDK JSON-schema compatibility warning remains. No response data files were written.
- Browser check: fresh local Denver plan, armed LoDo map pick, Confirm, and map click during the active run. Picking changed to off, the profile stayed locked, all three original demo coordinates remained unchanged, and 10 Agent-mode results appeared. Screenshot: local screenshot, not committed. Retry and stale-request failure races were verified offline, not by inducing a real provider outage. Development server stopped afterward.
- Cache recovery: no key rename, Redis access, flush, or resource provisioning. Old run envelopes, bare density numbers (zero or positive), and unmarked Qloo slim values are rejected as misses. Healthy lookups overwrite the same keys with validated metadata; failures leave existing entries alone and uncached, so the next request can recover. This intentionally refreshes old healthy entries too, costing a first live request and normal rate-limit checks. Existing plan cache values and rate-limit keys are unchanged; historical density hints inside an old plan expire normally, and new research does not use them as completeness evidence. Shared-store migration was tested through the same cache API using memory only, not a live Redis service.
- Open issues / decisions: all seven findings have local regression evidence. Independent recheck remains for the coordinator after the stable commit. T1's shadcn registry gap and T10's native spreadsheet-opening gap remain PARTIAL. Prompt tuning was not changed or rerun; T11 still has one tuning round used. Fallback's ambiguous REI highest-popularity choice remains an existing documented relevance limit. Architecture/cache-shape discrepancies are recorded under Decisions I made above.
- New dependencies: none. No remote repository/deployment/resource action. The pre-existing `.env.example` deletion remains excluded. Read-only helper reviews finished; the root agent made every repair edit.
- For Devin: the existing Waiting for Devin list remains applicable; no additional infrastructure action is needed to recover legacy caches.

## R1 review fixes

| Fix | Final status | Notes |
|---|---|---|
| R1 Fallback brand matching | DONE | Initial verification blocker resolved and rechecked in R2 |
| R2 Ignore local translations | DONE | Both local files preserved byte for byte |
| R3 Restore environment template | DONE | Exact `cfe3521` bytes; local secrets untouched |
| R4 Evidence dedupe and cap | DONE | Maximum 5 stored, 3 initially displayed |
| R5 Research category validation | DONE | Invalid/blacklisted categories rejected before work |
| R6 Explicit evidence kinds | DONE | Preferences/defaults carry no borrowed brand tags |
| R7 Merchant exclusions | DONE | Live filtering and cached replay both covered |
| R8 Judge comparison | DONE | Timing-safe byte comparison; header precedence retained |
| R9 Progress reconciliation | DONE | Historical hashes verified; all checks and both fallback presets pass |

### R1: Match fallback brands by name — FAILED (verification blocked; implementation complete)
- Date/time (UTC+8): 2026-10-24 18:04
- What was done:
  - Ranked exact names, whole-word prefixes, and acronyms before popularity; unrelated candidates remain unresolved.
  - Added explicit candidate selection/re-planning for ambiguous names and removed stale partial evidence for implicit unrelated choices.
  - Extended smoke to both presets with input-to-resolved-name reporting; preserved user and explicit agent selections.
  - Added 12 offline regression cases, including ranking and unresolved-to-user-choice recovery.
- Files touched: `src/lib/{types,agent/plan-agent,fallback/fallback-plan}.ts`, `src/components/CategoryConfirm.tsx`, `scripts/smoke.ts`, `tests/unit/{fallback-brand-match,fallback-plan,plan-agent}.test.ts`, `docs/PROGRESS.md`.
- How to verify: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`; `UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' PD_AGENT_DISABLED=1 npm run smoke`.
- Verification: lint, typecheck, 479 tests in 45 files, and production build pass. Three verification rounds could not finish green: two builds hit a Turbopack worker-port permission error (the second reused its cached error); moving generated `.next` to `/private/tmp/perk-desk-r1-next-build-cache` and separately approved `NEXT_TELEMETRY_DISABLED=1 npm run build` succeeded. Final `npm run check:rules` still fails on the pre-existing tracked translation folder, which R2 specifically fixes next. No more R1 edits after the third failed round.
- Last failing output (complete, fewer than 20 lines):
  ```text
  > perk-desk@0.1.0 check:rules
  > node scripts/check-rules.mjs
  ✗ directory not in ARCHITECTURE §2 tree: docs/translate
  check:rules FAILED: 1 problem(s)
  ```
- Live checks: both fallback presets completed with 8 recognized brands, 0 unresolved, and 10 merchants / 10 template pitches each. All input-to-company name pairs were reviewed; REI resolved to Recreational Equipment Inc. Denver plan/research: 5,704 / 13,635 ms; Austin: 1,635 / 14,401 ms. No response files were written and Redis was disabled for this process.
- Open issues / decisions: keep R1 before R2 as requested; the rule-check failure will be reverified after R2. No schema support for preset overrides and none needed. An independent review found and prompted the partial-evidence cleanup regression.
- New dependencies: none.
- For Devin: no new owner-only action.

### R2: Keep local translations out of Git — DONE
- Date/time (UTC+8): 2026-10-24 18:03
- What was done:
  - Ignored `docs/translate/` and removed its two tracked files from the index only.
  - Confirmed both on-disk files retain identical SHA-256 checksums.
  - Kept the checker and architecture tree unchanged; the R1 verification blocker is resolved.
- Files touched: `.gitignore`, Git index entries for `docs/translate/{PROGRESS,TASKS}.md`, `docs/PROGRESS.md`.
- How to verify: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`; `git check-ignore docs/translate/PROGRESS.md docs/translate/TASKS.md`.
- Verification: PASS: 479 tests / 45 files, lint, typecheck, production build, rules (144 files), diff whitespace. Both local translations remain intact and ignored.
- Open issues / decisions: R1 now passes every standard check; its earlier FAILED entry and WIP commit remain as required history. R1 final status is DONE after this revalidation.
- New dependencies: none.
- For Devin: no new action.

### R3: Restore the committed environment template — DONE
- Date/time (UTC+8): 2026-10-24 18:04
- What was done:
  - Restored `.env.example` directly from `cfe3521` and checked byte-for-byte equality.
  - Preserved the README copy command and Git ignore exception.
  - Left `.env.local` untouched and closed the old template-restoration waiting item.
- Files touched: `.env.example`, `docs/PROGRESS.md`.
- How to verify: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`; compare `.env.example` with `git show cfe3521:.env.example`.
- Verification: PASS: 479 tests / 45 files, lint, typecheck, production build, rules (145 files), and diff whitespace.
- Open issues / decisions: exact historical bytes take precedence over reformatting the template.
- New dependencies: none.
- For Devin: no new action.

### R4: Deduplicate and limit category evidence — DONE
- Date/time (UTC+8): 2026-10-24 18:06
- What was done:
  - Shared evidence compaction between agent guards and fallback mapping: strength/specificity sort, pair dedupe, maximum five.
  - Preserved full distinct-support counts for fallback category ranking before trimming evidence.
  - Added the schema cap, configurable limits, and top-three display with a closed +N more details control.
  - Added pure, agent/fallback integration, and rendered confirmation tests with synthetic evidence.
- Files touched: `src/lib/{config,types,agent/guards,fallback/category-map}.ts`, `src/components/CategoryConfirm.tsx`, `tests/unit/{category-evidence,category-map,guards}.test.ts`, `docs/PROGRESS.md`.
- How to verify: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`.
- Verification: PASS: 490 offline tests / 46 files, lint, typecheck, production build, rules (146 files), diff whitespace. New test-file lint/typecheck and the full test suite passed after the independent test contribution arrived.
- Open issues / decisions: specificity is a documented heuristic, not a Qloo strength score. Agent evidence still passes layer 2 before compaction. Cached plans exceeding five records fail schema validation and refresh normally.
- New dependencies: none.
- For Devin: no new action.

### R5: Recheck research categories on the server — DONE
- Date/time (UTC+8): 2026-10-24 18:07
- What was done:
  - Reused `isBlacklistedCategory` after schema validation in `/api/run`.
  - Returned clear HTTP 400 messages for malformed/non-place and blacklisted category IDs, before cache, limits, or research.
  - Added route tests and retained outage-cache coverage with a permitted category whose lookup fails.
- Files touched: `src/app/api/run/route.ts`, `tests/unit/{run-route,run-recovery}.test.ts`, `docs/PROGRESS.md`.
- How to verify: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`.
- Verification: PASS: 494 tests / 46 files, lint, typecheck, production build, rules (146 files), diff whitespace. First attempt exposed an old outage test using a now-rejected hospital category; replaced that setup with an unavailable bakery lookup and added the healthy-merchant assertion. Second attempt passed.
- Open issues / decisions: a syntactically valid category outside the hand-written defaults remains allowed unless blacklisted, matching the existing category helper.
- New dependencies: none.
- For Devin: no new action.

### R6: Make category evidence provenance explicit — DONE
- Date/time (UTC+8): 2026-10-24 18:09
- What was done:
  - Added explicit agent/rule/preference/default evidence shapes; suggestions contain no brand or tag fields.
  - Removed borrowed first tags from saved preferences, quick-segment defaults, and generic defaults.
  - Displayed Saved preference / Default suggestion without evidence arrows; kept rule/agent arrows and the R4 expansion control.
  - Preserved agent layer-2 validation and trusted server stamping of kind; added forged-kind and legacy-cache tests.
- Files touched: `src/lib/{types,agent/guards,agent/plan-agent,fallback/category-map,fallback/fallback-plan}.ts`, `src/components/CategoryConfirm.tsx`, `scripts/smoke.ts`, `tests/fixtures/fake-plan.ts`, `tests/unit/{category-evidence,category-map,fallback-plan,guards,plan-route}.test.ts`, `docs/PROGRESS.md`.
- How to verify: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`.
- Verification: PASS: 502 offline tests / 46 files, lint, typecheck, production build, rules (146 files), diff whitespace. Independent targeted evidence tests (15 cases) and read-only semantic review also passed.
- Open issues / decisions: the evidence union is the explicit R6 extension to architecture shapes. Existing generated plans need refresh because old evidence has no kind; route regression confirms replacement at the unchanged key. The model cannot bypass observed-tag checks by claiming default provenance.
- New dependencies: none.
- For Devin: no new action.

### R7: Exclude Rack Attack and team/stadium stores — DONE
- Date/time (UTC+8): 2026-10-24 18:10
- What was done:
  - Added Rack Attack to the hand-written national-chain names.
  - Excluded normalized stadium/team store phrases even when Qloo labels them sporting goods.
  - Tested both reported names, punctuation/case handling, word boundaries, retained local names, and exclusion counts.
- Files touched: `src/data/national-chains.json`, `src/lib/merchants/filter.ts`, `tests/unit/{chains,filter}.test.ts`, `docs/PROGRESS.md`.
- How to verify: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`.
- Verification: PASS: 504 tests / 46 files, lint, typecheck, production build, rules (146 files), diff whitespace.
- Open issues / decisions: team/stadium stores count as existing noise exclusions, not national chains; no new reporting field or category tag ID is introduced. R9's final two-preset smoke will recheck the full result after all fixes.
- New dependencies: none.
- For Devin: no new action.
- R7 follow-up before R8 commit: independent review found that old complete run envelopes could replay newly excluded names. Extracted `isTeamStore` into the existing chain helper and reject cached shortlists containing a national-chain/team-store name as misses. Three route regressions verify recomputation and replacement at unchanged keys. Additional files: `src/lib/merchants/chains.ts`, `src/app/api/run/route.ts`, `tests/unit/run-route.test.ts`. Full checks pass with this follow-up (513 tests including the pending R8 cases). The still-local R7 commit is amended to keep one commit for this task; no published history is rewritten.

### R8: Compare judge codes with timingSafeEqual — DONE
- Date/time (UTC+8): 2026-10-24 18:11
- What was done:
  - Compared UTF-8 buffers using Node's `timingSafeEqual`, after checking equal byte lengths.
  - Preserved nonblank, exact-code semantics and documented the first forwarded IP choice on Vercel.
  - Tested equal-length mismatches, shorter/longer/blank values, and multibyte strings without exceptions.
- Files touched: `src/lib/store/rate-limit.ts`, `tests/unit/rate-limit.test.ts`, `docs/PROGRESS.md`.
- How to verify: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`.
- Verification: PASS: 513 tests / 46 files, lint, typecheck, production build, rules (146 files), diff whitespace. Independent review found no remaining issue in R7's cache fix or R8.
- Open issues / decisions: compare byte lengths, not JavaScript string lengths; keep header precedence unchanged.
- New dependencies: none (Node built-in crypto).
- For Devin: no new action.

### R9: Reconcile progress with the rewritten Git history — DONE
- Date/time (UTC+8): 2026-10-24 18:12
- What was done:
  - Corrected all T1–T12 summary hashes from current Git history and added exact X1/X2 hashes.
  - Updated current summary statements for fixed fallback matching, restored template, configured origin, and final verification.
  - Added final statuses for R1–R9 while retaining earlier task/failure history.
  - Completed final standard checks and both live fallback presets after all code changes.
- Files touched: `docs/PROGRESS.md` only.
- How to verify:
  ```bash
  npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' PD_AGENT_DISABLED=1 npm run smoke
  git log --oneline
  git status --short
  ```
- Verification: PASS: 513 offline tests / 46 files, lint, typecheck, production build, rules (146 files), and diff whitespace. Every T/X summary hash resolves to its matching task subject. Build uses `NEXT_TELEMETRY_DISABLED=1` and the approved local worker-port permission.
- Final live checks: Denver and Austin each resolved all 8 intended brand names with 0 unresolved, and each completed with 10 merchants and 10 template pitches in fallback mode. REI resolved to Recreational Equipment Inc. Denver plan/research: 7,284 / 19,101 ms; Austin: 1,584 / 13,918 ms. Repeat plans took 11 ms each (12 / 10 Qloo cache hits respectively). The Denver result omitted Rack Attack and the stadium store. The smoke command exited 0, used only memory cache, and wrote no response data to disk.
- Open issues / decisions: R1's original WIP commit records its initial verification failure; R2 cleared that blocker and final R9 verification confirms R1 is DONE. T1/T10's earlier manual acceptance gaps remain historical owner items outside R1–R9. R9 does not embed its own hash, which would change that hash; the R1–R9 status table is independent of commit IDs.
- New dependencies: none. No checker/ESLint protections were weakened. `.env.local` was never edited. Both local translation files remain intact and ignored.
- For Devin: review the nine local commits; push/deploy remain owner actions and were not performed.

### R1–R9 second review: Preserve confirmed brands and category evidence — DONE
- Date/time (UTC+8): 2026-10-24 18:24
- What was done:
  - Re-reviewed all nine fixes, including translation/template preservation, request guards, cache replay, merchant exclusions, judge-code comparison, evidence display, and summary hashes.
  - Fixed an R1 integration regression: finalization could discard explicit agent choices without retained category evidence, or replace a successful exact/prefix choice with a more popular candidate and discard its valid plan.
  - Kept implicit unrelated candidates unresolved and removed their stale evidence; fallback backfill now preserves the already-finalized brand choices.
  - Fixed an R4/R6 integration gap: a saved preference no longer hides genuine rule evidence for the same category. Merged evidence remains sorted, deduplicated, capped at five, and guarded.
  - Added 11 offline regression cases and independently reviewed both repairs. No other actionable R1–R9 issue was found in this review.
- Files touched: `src/lib/agent/plan-agent.ts`, `src/lib/fallback/fallback-plan.ts`, `tests/unit/fallback-preferences.test.ts`, `tests/unit/plan-brand-preservation.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm run typecheck && npm test
  NEXT_TELEMETRY_DISABLED=1 npm run build
  npm run check:rules && git diff --check
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' PD_AGENT_DISABLED=1 npm run smoke
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' PD_AGENT_DISABLED=0 npm run smoke
  ```
- Verification: PASS on the first full verification round: 524 tests / 48 files, lint, typecheck, production build, repository rules (148 files), and diff whitespace. Independent repair review also passed 69 targeted tests across seven files. No tests or checker protections were weakened.
- Live fallback checks: both presets resolved all 8 intended brands with 0 unresolved and returned 10 merchants / 10 template pitches. Denver plan/research: 5,605 / 14,138 ms; Austin: 2,061 / 12,309 ms. Repeat plans: 11 / 13 ms. REI resolved to Recreational Equipment Inc; Denver omitted Rack Attack and the stadium store.
- Live agent checks: both presets stayed in agent mode, resolved all 8 intended brands with 0 unresolved, and returned 10 merchants. Denver plan/research: 15,129 / 15,240 ms, with 9 agent pitches and 1 guarded template fallback. Austin: 11,120 / 17,588 ms, with 10 agent pitches. Repeat plans also completed. The SDK emitted its existing JSON-schema compatibility warning; both smoke commands exited 0.
- Open issues / decisions: both smoke runs used only in-memory cache and wrote no provider response data to disk. Real browser interaction was not repeated because these repairs affect server planning; existing UI and request-flow tests passed. T1/T10 acceptance gaps remain outside R1–R9. The repairs use one additional local commit without rewriting the nine task commits.
- New dependencies: none. `.env.local`, the restored template, and both ignored translations remain untouched.
- For Devin: review the local repair commit; no push or deployment was performed.

### R10: Protect live API quotas and expose private usage counts — DONE
- Date/time (UTC+8): 2026-10-24 18:31
- What was done:
  - Lowered daily limits to 10 runs per IP / 60 globally and 30 plans per IP / 200 globally. Judge codes skip only per-IP limits; cached responses remain unlimited.
  - Added Vercel production detection only in `env.ts`. Missing either Upstash credential, rejected rate-limit operations, and SDK fail-open timeouts now deny live work with HTTP 503 before any research or streaming starts.
  - Preserved local/preview memory fallback and its fixed warning, cached preset access, existing Redis prefixes, and global limits for cold presets.
  - Added one structured server usage line per accepted live run, including failed runs: a 12-character SHA-256 IP hash plus actual Qloo/LLM HTTP attempt counts. Retries count; cache hits do not; concurrent requests remain isolated.
  - Updated README/PRD/ARCHITECTURE and added regression coverage for production gates, cache access, judge limits, transport retries/failures, privacy, and concurrent usage accounting.
- Files touched: `src/lib/{config,env}.ts`, `src/lib/store/{rate-limit,usage}.ts`, `src/lib/qloo/client.ts`, `src/lib/agent/model.ts`, `src/app/api/{plan,run}/route.ts`, `tests/unit/{config,rate-limit,plan-route,run-route,production-limits,usage,usage-transport}.test.ts`, `README.md`, `docs/{PRD,ARCHITECTURE,PROGRESS}.md`.
- How to verify:
  ```bash
  npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules
  npx vitest run tests/unit/production-limits.test.ts tests/unit/usage.test.ts tests/unit/usage-transport.test.ts tests/unit/plan-route.test.ts tests/unit/run-route.test.ts tests/unit/rate-limit.test.ts
  git diff --check
  ```
- Verification: PASS: 555 offline tests / 51 files, lint, typecheck, production build, repository rules (153 files), and diff whitespace. Independent final review found no actionable issues and passed 106 focused tests across six files. The first verification attempt reached a sandbox-only Turbopack worker-port failure after lint/typecheck/tests passed; moved generated `.next` into a unique `/private/tmp/perk-desk-r10-build.*` backup and reran the production build with approved local worker-port access, then rules passed. No source change was needed for the build.
- Open issues / decisions: runtime Upstash failures were simulated with mocked Redis transport and real route/limiter code; no live Redis, Qloo, or DeepSeek calls, deployment, or resource provisioning were needed. R10 explicitly permits the README/PRD/ARCHITECTURE updates. Client error handling already shows the safe 503 messages. The user's requested combined push follows this verified commit; `git pull --rebase` already succeeded.
- New dependencies: none. Secrets, preset data, cache key formats, and dependency versions remain unchanged.
- For Devin: provision/configure Upstash before live Vercel production use and verify the deployed behavior; the top waiting list records this requirement.

### R11a: Expand chain exclusions and verify both fallback presets — DONE
- Date/time (UTC+8): 2026-10-24 18:46
- What was done:
  - Added 28 distinctive apparel, footwear, outdoor, pet, and fitness chain names/aliases, including Urban Outfitters, Madewell, Rainbow Shops, and Fleet Feet.
  - Removed the ambiguous Gap entry; covered normalization, whole-word boundaries, and independent-name non-collisions with offline tests.
  - Made both preset smoke runs fail on any `isNationalChain` or `isTeamStore` match, while retaining the nonempty-shortlist check.
  - Preserved local multi-location merchants and their badges; the Independents only toggle still starts off. Existing cached-run checks apply the expanded list without a cache migration.
  - Used the first two smoke runs to catch and add Three Dog Bakery, K&G Fashion Superstore, and Boot Barn, then repeated both presets with the final list.
- Files touched: `src/data/national-chains.json`, `scripts/smoke.ts`, `tests/unit/{chains,filter}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' PD_AGENT_DISABLED=1 npm run smoke
  git diff --check
  ```
- Verification: PASS: 615 offline tests / 51 files, lint, typecheck, production build, repository rules (154 files), and diff whitespace. Independent review found no actionable implementation issue and verified cache/card behavior with 31 focused tests. No failed verification round.
- Final live fallback checks: both presets resolved all 8 brands with 0 unresolved names and returned 10 merchants / 10 template pitches. Both had zero matches against `isNationalChain` and `isTeamStore`. Denver plan/research: 3,943 / 12,744 ms, 12 / 34 Qloo calls; Austin: 2,242 / 12,129 ms, 10 / 30 Qloo calls. Repeat plans took 16 / 11 ms with 12 / 10 Qloo cache hits. Command exited 0. Only memory cache was used; no provider response files were saved.
- Denver returned names: Two Pals & A Pup; Mouthfuls; Chewy's Bonetique; SloHi Bike Co.; Mike's Bikes of Denver Downtown; Wilderness Exchange Unlimited; Little Brown Dog; Z Cycle Shop; evo Denver; Arvada Army Navy Surplus.
- Austin returned names: Allens Boots; Tom's Dive & Swim; Atown; Monkies Vintage & Thrift; Flat Track Coffee; University Co-op; STAG Provisions For Men; Clown Dog Bikes; Blue Velvet; Chico's.
- Open issues / decisions: bare Gap, Columbia, Marmot, and Chico's remain intentionally absent under R11's collision constraint. In particular, Chico's remains in Austin's result; zero predicate matches does not establish exhaustive national-chain removal. This limitation is in Waiting for Devin. R11 explicitly requests the returned-name audit above; no IDs, response bodies, or other provider data were committed.
- New dependencies: none. `.env.local` is unchanged.
- For Devin: review the ambiguous-name limitation; R11b follows before the authorized push.

### R11b: Remove local paths and prevent their return — DONE
- Date/time (UTC+8): 2026-10-24 18:47
- What was done:
  - Replaced the historical screenshot's absolute path with a neutral description.
  - Reworded the task document's own path examples while preserving its requirements and a usable search command.
  - Added a no-allowlist text scan before existing checker exemptions, covering lockfiles, SVGs, generated files, and newly added files as well as tracked files.
  - Kept binary files out of the text scan and handled filenames with spaces/newlines using NUL-delimited Git output. Diagnostics include only the relative filename and line number.
  - Added 19 offline regression cases using synthetic staged files in isolated temporary repositories; they cover both home-directory prefixes, file-type exemptions, unusual names, safe text, and binary handling.
- Files touched: `scripts/check-rules.mjs`, `tests/unit/check-rules.test.ts`, `docs/{FIXES-R3,FIXES-R4,PROGRESS}.md`.
- How to verify:
  ```bash
  npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules
  npx vitest run tests/unit/check-rules.test.ts
  rg '/(Users|home)/' -g '!node_modules' .
  git diff --check
  ```
  The search should print nothing and exit 1 (no matches).
- Verification: PASS on the first round: 634 offline tests / 52 files, lint, typecheck, production build, repository rules (156 files), and diff whitespace. The repository search returned no matches. Independent review confirmed coverage and no actionable issues. Both live fallback smoke results and returned names are recorded under R11a; R11b does not change the research pipeline.
- Open issues / decisions: the historical log entry changed only to remove its local screenshot path, as explicitly required by R11b. The task document was also sanitized rather than allowlisted. No published-history rewrite, deployment, resource changes, or new dependency. No new owner action for this sub-item.
- For Devin: both verified R11 commits are ready for the push authorized in this request; the R11a ambiguous-name limitation remains in the waiting list.
- Push integration: the first push was rejected because remote commit `25c301e` added `docs/FIXES-R4.md` during this work. Fetched and inspected it, then rebased the two unpublished R11 commits onto that commit. Sanitized the new document's home-directory examples under R11b's no-allowlist requirement; its future R11c/R12 tasks were not executed. Re-ran all standard checks after integration. The remote commit and previously published history are preserved; no force push is used.

### R11c: Add downloadable examples beside every list upload — DONE
- Date/time (UTC+8): 2026-10-24 18:56
- What was done:
  - Added three hand-written sample CSVs with eight consumer brands and five fictional names per merchant/business list, including a quoted comma-containing name.
  - Added accessible Download sample links beside all three upload controls.
  - Accepted case-insensitive business name and merchant name headers while retaining first-column parsing and ignored extra columns.
  - Added sample-file parsing tests and extended header coverage; documented and permitted only the requested public samples directory.
- Files touched: `public/samples/{brands,signed-merchants,business-members}-sample.csv`, `src/components/{ProfileForm,TasteInput}.tsx`, `src/lib/request-builders.ts`, `tests/unit/{sample-uploads,uploaded-list}.test.ts`, `scripts/check-rules.mjs`, `docs/{ARCHITECTURE,PROGRESS}.md`.
- How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules` and `git diff --check`.
- Verification: PASS: 639 offline tests / 53 files, lint, typecheck, production build, repository rules (160 files), and diff whitespace. The first build failed on the sandbox's local worker-port restriction; the next attempt reused that cached failure. Moving generated `.next` to a temporary backup and building with approved local worker-port access passed without source changes.
- Open issues / decisions: R11 was already completed in commits `3c5e083` and `99a1072`; its two-preset smoke evidence remains under R11a. Samples are hand-written examples, not Qloo responses or customer data. No new dependency.
- Staged change list before adding this progress entry (`git diff --cached --stat`):
  ```text
   docs/ARCHITECTURE.md                       |  1 +
   public/samples/brands-sample.csv           |  9 +++++++++
   public/samples/business-members-sample.csv |  6 ++++++
   public/samples/signed-merchants-sample.csv |  6 ++++++
   scripts/check-rules.mjs                    |  2 +-
   src/components/ProfileForm.tsx             |  4 ++++
   src/components/TasteInput.tsx              |  2 ++
   src/lib/request-builders.ts                |  2 +-
   tests/unit/sample-uploads.test.ts          | 19 +++++++++++++++++++
   tests/unit/uploaded-list.test.ts           |  2 +-
   10 files changed, 50 insertions(+), 3 deletions(-)
  ```
- For Devin: pull/push remain blocked by automatic approval review pending confirmation of the project-rule override; all R11c local work is complete.

### R12: Automatic privacy guards and exact allowlist follow-up — DONE
- Date/time (UTC+8): 2026-10-24 19:02
- What was done:
  - Completed the pending staged-file privacy scanner, full-tree index/worktree scan, author check, and guarded Git-hook installer. Diagnostics contain relative filenames, line numbers, and rule names without matched private values.
  - Exempted only root `package-lock.json` from the 50 KB JSON size limit and only `src/app/favicon.ico` from the source image restriction. Both retain all content checks, including response-data detection.
  - Kept the three exact RFC 5737 documentation networks exempt, with comments and tests for endpoints, adjacent networks, and ambiguous leading-zero prefixes.
  - Exempted numeric SVG path data from only IP/phone patterns in the exact files `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, and `public/window.svg`. Each path has a reason comment; metadata, comments, CDATA, other attributes, and all other rules remain scanned.
  - Added offline staged-file regressions proving synthetic secrets, home-directory paths, and non-placeholder personal emails are blocked. The 64 follow-up cases also exercise exact paths, nearby paths, numeric known secrets, and preserved diagnostic line numbers.
  - Preserved the pending R12 sanitization of documentation and synthetic test literals; no new documentation-wide, directory-wide, or extension-wide exception was added. The required commit/push hooks remain installed.
- Files touched: `AGENTS.md`, `docs/{ARCHITECTURE,FIXES-R4,QLOO_API,PROGRESS}.md`, `package.json`, `package-lock.json`, `scripts/{check-author,check-privacy,check-rules,install-hooks,privacy-rules}.mjs`, `tests/fixtures/{privacy-repository,qloo-fake}.ts`, `tests/unit/{check-rules,csv,git-hooks,privacy-allowlist,privacy-content,privacy-files,privacy-git,qloo-client,qloo-insights}.test.ts`.
- How to verify:
  ```bash
  VERCEL=1 npm ci --offline --no-audit --no-fund
  npm run prepare
  npm run lint && npm run typecheck && npm test
  NEXT_TELEMETRY_DISABLED=1 npm run build
  npm run check:rules
  node scripts/check-privacy.mjs --all
  node scripts/check-author.mjs
  git diff --cached --check
  ```
- Verification: PASS: 824 offline tests across 58 files; lint, typecheck, production build, repository rules, author check, and staged whitespace checks. The explicit full-tree command reported `check:privacy OK (170 tracked files)` before any push. The Vercel-style clean install succeeded from the local package cache and skipped hook installation as intended; local prepare then installed both hooks. The build used approved local worker-port access. Independent review found no remaining actionable issue in the exemptions, staged/full-tree behavior, or hook commands.
- Blocked-content record: the initial full-tree scan reported eight old-index findings: a local-path example and response markers in documentation, synthetic phone literals, and a URL credential string matching the email rule. Their working copies were already sanitized by the pending R12 work; staging those reviewed files removed the findings without weakening detection. No matched value was logged here.
- Open issues / decisions: the follow-up explicitly authorizes these narrow changes to the protected privacy rules. Other privacy checks and hook commands remain strict. No Qloo/DeepSeek calls, deployment, push, remote changes, or resource provisioning occurred. The existing no-remote-actions rule remains applicable.
- New dependency: `simple-git-hooks@2.14.0`, explicitly required by R12b and already present in the pending R12 changes; existing application dependencies do not manage Git hooks.
- Staged change list before adding this progress entry (`git diff --cached --stat`):
  ```text
   AGENTS.md                            |  13 ++-
   docs/ARCHITECTURE.md                 |   2 +
   docs/FIXES-R4.md                     |   5 +-
   docs/QLOO_API.md                     |  19 +++--
   package-lock.json                    |  12 +++
   package.json                         |   8 ++
   scripts/check-author.mjs             |  22 +++++
   scripts/check-privacy.mjs            |  70 +++++++++++++++
   scripts/check-rules.mjs              |   9 +-
   scripts/install-hooks.mjs            |  19 +++++
   scripts/privacy-rules.mjs            | 159 +++++++++++++++++++++++++++++++++++
   tests/fixtures/privacy-repository.ts |  39 +++++++++
   tests/fixtures/qloo-fake.ts          |   2 +-
   tests/unit/check-rules.test.ts       |   9 +-
   tests/unit/csv.test.ts               |   5 +-
   tests/unit/git-hooks.test.ts         | 102 ++++++++++++++++++++++
   tests/unit/privacy-allowlist.test.ts | 127 ++++++++++++++++++++++++++++
   tests/unit/privacy-content.test.ts   | 135 +++++++++++++++++++++++++++++
   tests/unit/privacy-files.test.ts     | 107 +++++++++++++++++++++++
   tests/unit/privacy-git.test.ts       | 120 ++++++++++++++++++++++++++
   tests/unit/qloo-client.test.ts       |   2 +-
   tests/unit/qloo-insights.test.ts     |   2 +-
   22 files changed, 965 insertions(+), 23 deletions(-)
  ```
- For Devin: the verified local commits are ready for the owner-authorized publishing step recorded in Waiting for Devin.

#### R12 coordinated finalization — DONE
- Date/time (UTC+8): 2026-10-24 19:10
- Coordination: the user explicitly authorized coordination with the other R12 chat, followed by commit and push despite the project no-remote-actions rule. The other chat confirmed its subagents had stopped writing and no tool processes remained active. Its changes were reviewed and explicitly restaged before final checks.
- Additional work preserved from that handoff:
  - Tightened IPv4 matching to detect an address after a hyphen and before a filename extension, with negative coverage for invalid octets.
  - Redacted private filenames and directory names from legacy rule-checker diagnostics; removed UUID excerpts that could coincide with a known secret.
  - Shared exact known-secret collection between the privacy checker and rule checker, with the corresponding environment-access rule documented.
  - Preserved `public/window.svg` separator normalization; its SVG commands and numeric tokens are unchanged. This file is additional to the earlier Files touched list.
- Final verification: PASS: 829 offline tests across 58 files, lint, production build, typecheck, repository rules, author check, staged whitespace checks, and index/worktree consistency. `node scripts/check-privacy.mjs --all` reported `check:privacy OK (170 tracked files)`. Independent review found no actionable code issue. A refresh of `origin/main` confirmed zero remote-only commits; the existing local R11c commit remains ready to publish with R12.
- How to verify: use the commands in the R12 entry above. The final pre-commit and pre-push hooks remain enabled and will recheck the commit/push; no bypass or Git configuration change is used.
- Final staged change list before this finalization note (`git diff --cached --stat`):
  ```text
   AGENTS.md                            |  13 ++-
   docs/ARCHITECTURE.md                 |   2 +
   docs/FIXES-R4.md                     |   5 +-
   docs/PROGRESS.md                     |  55 ++++++++++++
   docs/QLOO_API.md                     |  19 +++--
   package-lock.json                    |  12 +++
   package.json                         |   8 ++
   public/window.svg                    |   2 +-
   scripts/check-author.mjs             |  22 +++++
   scripts/check-privacy.mjs            |  70 +++++++++++++++
   scripts/check-rules.mjs              |  46 ++++++----
   scripts/install-hooks.mjs            |  19 +++++
   scripts/privacy-rules.mjs            | 159 +++++++++++++++++++++++++++++++++++
   tests/fixtures/privacy-repository.ts |  39 +++++++++
   tests/fixtures/qloo-fake.ts          |   2 +-
   tests/unit/check-rules.test.ts       |  43 ++++++++--
   tests/unit/csv.test.ts               |   5 +-
   tests/unit/git-hooks.test.ts         | 102 ++++++++++++++++++++++
   tests/unit/privacy-allowlist.test.ts | 127 ++++++++++++++++++++++++++++
   tests/unit/privacy-content.test.ts   | 135 +++++++++++++++++++++++++++++
   tests/unit/privacy-files.test.ts     | 107 +++++++++++++++++++++++
   tests/unit/privacy-git.test.ts       | 134 +++++++++++++++++++++++++++++
   tests/unit/qloo-client.test.ts       |   2 +-
   tests/unit/qloo-insights.test.ts     |   2 +-
   24 files changed, 1088 insertions(+), 42 deletions(-)
  ```
- Open issues / decisions: no remaining implementation blocker for R12. The authorized push follows this recorded verification; existing deployment and manual product-review items remain separate.

### R13: Exact-name chains and fresh two-city smoke checks — DONE
- Date/time (UTC+8): 2026-10-24 19:32
- What was done:
  - Added an explicit validated `exactNames` list with all 11 requested ambiguous chains and removed overlapping entries from the existing word-boundary list.
  - Matched exact names after case, punctuation, whitespace, and terminal store/outlet/factory-store normalization while preserving other words and independent-name collisions.
  - Covered required examples, retail suffixes, normalization, list validation, and stale cached results containing Chico's or Gap.
  - Added GANNI and Tecovas to the unambiguous list after successive live Austin audits exposed them. Official references: [GANNI stores](https://www.ganni.com/us/stores-find) and [Tecovas stores](https://www.tecovas.com/stores). Added matching regressions.
  - Re-ran both live fallback presets using memory cache; no provider response files were saved. This entry supersedes the earlier R11 smoke names and ambiguous-name limitation.
- Files touched: `src/data/national-chains.json`, `src/lib/data.ts`, `src/lib/merchants/chains.ts`, `tests/unit/{chains,data,run-route}.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules
  UPSTASH_REDIS_REST_URL='' UPSTASH_REDIS_REST_TOKEN='' PD_AGENT_DISABLED=1 npm run smoke
  git diff --check
  ```
- Verification: PASS: 863 offline tests / 58 files, lint, typecheck, production build, repository/privacy rules (171 files), and whitespace checks. Independent review found no actionable issue in exact matching or cache coverage. All automated rounds passed; the first two live name audits exposed GANNI and then Tecovas, both fixed before acceptance.
- Final smoke: both cities resolved all 8 brands with 0 unresolved names, returned 10 merchants / 10 template pitches, and reported 0 national-chain/team-store matches. No remaining known national chain was identified in the returned-name audit. Regional multi-location flags and visibility remain unchanged.
- Denver: plan/research 5,339 / 21,498 ms; 12 / 34 Qloo calls; category independent counts 6, 6, 10, 7. Repeat plan 18 ms with 12 cache hits. Names: Two Pals & A Pup; Mouthfuls; Chewy's Bonetique; SloHi Bike Co.; Mike's Bikes of Denver Downtown; Wilderness Exchange Unlimited; Little Brown Dog; Z Cycle Shop; evo Denver; Arvada Army Navy Surplus.
- Austin: plan/research 2,322 / 12,881 ms; 10 / 30 Qloo calls; category independent counts 4 (replaced), 20, 18, 16, 6. Repeat plan 11 ms with 10 cache hits. Names: Allens Boots; Tom's Dive & Swim; Atown; Monkies Vintage & Thrift; Flat Track Coffee; University Co-op; STAG Provisions For Men; YTX Yoga, Strength, Pilates, & Recovery; Clown Dog Bikes; Blue Velvet.
- Open issues / decisions: normalization intentionally keeps extra words for exact-only entries; this is a maintained chain list, not a claim of exhaustive business classification. No new dependency, key changes, or resource provisioning. Names/counts above are the smoke evidence explicitly requested by R13; no IDs or response bodies are recorded.
- Staged change list before adding this progress entry (`git diff --cached --stat`):
  ```text
   src/data/national-chains.json | 22 ++++++++++++++++------
   src/lib/data.ts               |  9 ++++++++-
   src/lib/merchants/chains.ts   | 15 +++++++++++++--
   tests/unit/chains.test.ts     | 34 +++++++++++++++++++++++++++++-----
   tests/unit/data.test.ts       | 14 +++++++++-----
   tests/unit/run-route.test.ts  |  2 +-
   6 files changed, 76 insertions(+), 20 deletions(-)
  ```
- For Devin: no new action required; R14 and R15 follow before the authorized push.

### R14: Install Git hooks directly and skip CI/Vercel — DONE
- Date/time (UTC+8): 2026-10-24 19:34
- What was done:
  - Removed `simple-git-hooks` and its package configuration; the lockfile changes only remove that dependency.
  - Replaced the third-party installer with built-in filesystem calls that write both shell hooks and explicitly set executable permissions, including when replacing old files.
  - Kept the prepare script and the exact pre-commit/privacy/author and pre-push/lint/typecheck/test/rules/privacy command chains, with failure propagation through `&&`.
  - Skipped all hook writes for CI, Vercel, and missing or non-directory Git metadata, with one short message.
  - Extended isolated repository tests for fresh skips, existing-hook preservation, replacement permissions, missing hooks directories, filesystem failure, and unchanged author checks.
  - Verified actual offline clean installs under both CI and Vercel in a disposable repository, then local preparation; also installed and inspected the real local hooks.
- Files touched: `package.json`, `package-lock.json`, `scripts/install-hooks.mjs`, `tests/unit/git-hooks.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run prepare
  npm test -- tests/unit/git-hooks.test.ts
  npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules
  git diff --check
  ```
  For the clean-install lifecycle check, copy `package.json`, `package-lock.json`, and `scripts/install-hooks.mjs` (preserving its directory) to a temporary Git repository. Run `CI=1 npm ci --offline --no-audit --no-fund`, then `VERCEL=1 npm ci --offline --no-audit --no-fund`; assert neither `pre-commit` nor `pre-push` exists. Run `npm run prepare` with both variables unset and assert both hook files are executable.
- Verification: PASS on the first round: 868 offline tests / 58 files, including 17 hook tests; lint, typecheck, production build, repository/privacy rules (171 files), and whitespace checks. Both actual clean-install variants printed the skip message and created neither hook. Local preparation created both executable hooks with the required commands. The disposable repository was removed afterward.
- Open issues / decisions: R14 explicitly authorizes replacing the protected installer. No privacy or author checker was changed. A `.git` file is treated as a non-directory install per the task's explicit directory condition. No new dependency or remote resource action.
- Staged change list before adding this progress entry (`git diff --cached --stat`):
  ```text
   package-lock.json            | 12 ---------
   package.json                 |  6 -----
   scripts/install-hooks.mjs    | 31 +++++++++++++++-------
   tests/unit/git-hooks.test.ts | 63 +++++++++++++++++++++++++++++++++++---------
   4 files changed, 73 insertions(+), 39 deletions(-)
  ```
- For Devin: no new action required; R15 follows before the authorized push.

### R15: Use plausible invented merchant sample names — DONE
- Date/time (UTC+8): 2026-10-24 19:35
- What was done:
  - Replaced all ten Fake-prefixed names in the merchant and business-member sample CSVs with hand-written invented business names.
  - Preserved the real consumer brands in `brands-sample.csv` byte for byte, both list headers, and the five-name count in each business list.
  - Kept exactly one quoted comma-containing name, `Paper Finch Books, Beans & More`, and updated the sample importer assertions.
- Files touched: `public/samples/{signed-merchants,business-members}-sample.csv`, `tests/unit/sample-uploads.test.ts`, `docs/PROGRESS.md`.
- How to verify:
  ```bash
  npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules
  npm test -- tests/unit/sample-uploads.test.ts
  git diff --check
  ```
- Verification: PASS on the first round: 868 offline tests / 58 files, lint, typecheck, production build, repository/privacy checks (171 files), and whitespace checks. A separate sample audit confirmed no Fake prefixes, exactly one quoted comma name, and unchanged brand CSV bytes. Independent final review found no actionable issue across R13, R14, and R15.
- Open issues / decisions: names were invented for the downloadable examples and contain no addresses, phones, or emails. Synthetic unit-test fixtures elsewhere remain unchanged. No new dependency or owner action is needed.
- Staged change list before adding this progress entry (`git diff --cached --stat`):
  ```text
   public/samples/business-members-sample.csv | 10 +++++-----
   public/samples/signed-merchants-sample.csv | 10 +++++-----
   tests/unit/sample-uploads.test.ts          |  4 ++--
   3 files changed, 12 insertions(+), 12 deletions(-)
  ```
- Publishing: the user's requested pull fast-forwarded to `147f300`. R13 and R14 are committed as `1ba5838` and `63980ab`; this R15 commit completes the ordered work. All three items passed before the authorized push, which will run the installed pre-push checks without bypasses.

## R16 — Public research limits and per-request Qloo caps (2026-10-24)

Status: DONE

- Removed the code feature from server checks, browser storage/headers/UI, environment example, and current architecture/README guidance.
- Applied normal IP limits to all cache misses, including altered presets; cached plans/runs remain available before IP/global checks.
- Raised daily global limits to 300 plans and 150 runs; retained 30/10 per-IP limits and production fail-closed behavior.
- Enforced 30/120 Qloo attempts per plan/run in the isolated usage context, including retries; live plans now log scope=plan.
- Preserved gathered merchants with a budget note and template pitches on budget exhaustion, and prevented partial-result caching.

Files touched / staged list (before this log):
```text
 .env.example                             |  2 -
 README.md                                |  4 +-
 docs/ARCHITECTURE.md                     | 27 ++++-----
 src/app/api/plan/route.ts                | 17 +++---
 src/app/api/run/route.ts                 |  5 +-
 src/app/page.tsx                         |  4 +-
 src/components/AgentTrace.tsx            | 33 ++---------
 src/lib/agent/context.ts                 | 16 ++++--
 src/lib/agent/plan-agent.ts              |  2 +-
 src/lib/agent/run-agent.ts               |  7 ++-
 src/lib/agent/tools/find-merchants.ts    |  3 +-
 src/lib/config.ts                        |  9 ++-
 src/lib/env.ts                           |  1 -
 src/lib/fallback/fallback-run.ts         |  2 +
 src/lib/profile-storage.ts               | 13 +----
 src/lib/qloo/client.ts                   |  9 +--
 src/lib/run-client.ts                    | 10 +---
 src/lib/store/rate-limit.ts              | 62 ++++----------------
 src/lib/store/usage.ts                   | 17 ++++--
 tests/unit/config.test.ts                |  6 +-
 tests/unit/env.test.ts                   |  1 -
 tests/unit/plan-route.test.ts            | 38 ++++++++-----
 tests/unit/post-plan.test.ts             | 12 ----
 tests/unit/production-limits.test.ts     | 48 ++++++++++++----
 tests/unit/profile-storage.test.ts       | 17 +-----
 tests/unit/qloo-budget.test.ts           | 98 ++++++++++++++++++++++++++++++++
 tests/unit/rate-limit.test.ts            | 86 +++++-----------------------
 tests/unit/run-budget.test.ts            | 41 +++++++++++++
 tests/unit/run-client.test.ts            |  9 +--
 tests/unit/run-recovery.test.ts          |  2 +-
 tests/unit/run-route-integration.test.ts |  1 -
 tests/unit/run-route.test.ts             | 44 ++++++++------
 32 files changed, 343 insertions(+), 303 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`; `rg -n 'JUDGE' src .env.example` must find no matches.

Verification: lint/typecheck passed; 870 offline tests / 60 files passed; production build and full-tree rules/privacy passed. Focused tests cover simultaneous calls, capped retries, partial results, altered presets and exhausted cached replays. No live provider calls. The first build could not bind a sandbox worker port; a retry retained that cached failure. Moving only generated .next artifacts to a temporary folder and rebuilding with local worker permission passed.

Decisions I made: retain legacy secret-name detection in protected privacy scripts so old private values remain protected; this is not a runtime feature. The new request authorizes pull and local commits, with push awaiting Devin. Demo request defaults, preset inputs and cache keys are unchanged.

Open issues: none for R16.

## R17 — Deadlines, circuit breaker, and disconnect cancellation (2026-10-24)

Status: DONE

- Applied 240-second research and 120-second planning deadlines, combined with client disconnect and stream cancellation signals.
- Propagated cancellation through Qloo pacing/retries/fetch, model and pitch calls, and optional cache reads/writes.
- Stopped live Qloo work after three timeout/upstream/network failures; preserved gathered candidates or emitted the safe upstream error when none exist.
- Reserved time for finishing: no fallback top-ups below 90 seconds, brand checks below 60 seconds, or model pitches below 50 seconds.
- Marked partial work with agent notes and prevented result caching; disconnected clients receive no further events or new cache writes.
- Added fake-clock/provider/storage regressions for deadlines, breaker, partial plans/results, phase guards, cancellation, and unchanged healthy streaming/cache behavior.

Files touched / staged list (before this log):
```text
 src/app/api/plan/route.ts                |  15 ++-
 src/app/api/run/route.ts                 |  37 +++++--
 src/lib/agent/context.ts                 |  81 +++++++++++---
 src/lib/agent/pitch-writer.ts            |   5 +-
 src/lib/agent/plan-agent.ts              |  15 ++-
 src/lib/agent/run-agent.ts               |  28 +++--
 src/lib/agent/tools/find-merchants.ts    |  12 +-
 src/lib/agent/tools/resolve-brands.ts    |   7 +-
 src/lib/agent/tools/search-categories.ts |   5 +-
 src/lib/config.ts                        |   6 +
 src/lib/fallback/fallback-run.ts         |   8 +-
 src/lib/qloo/client.ts                   |  81 +++++++++-----
 src/lib/store/cache.ts                   |  43 ++++++--
 src/lib/stream.ts                        |  65 +++++++----
 tests/unit/cache-deadline.test.ts        |  81 ++++++++++++++
 tests/unit/find-merchants.test.ts        |   4 +-
 tests/unit/plan-deadline.test.ts         |  70 ++++++++++++
 tests/unit/plan-route.test.ts            |  14 ++-
 tests/unit/qloo-client.test.ts           |   2 +-
 tests/unit/qloo-lifecycle.test.ts        | 139 +++++++++++++++++++++++
 tests/unit/route-lifecycle.test.ts       | 145 ++++++++++++++++++++++++
 tests/unit/run-agent.test.ts             |   2 +-
 tests/unit/run-deadline.test.ts          | 184 +++++++++++++++++++++++++++++++
 tests/unit/run-route.test.ts             |   4 +-
 tests/unit/search-categories.test.ts     |   2 +-
 tests/unit/stream.test.ts                |  43 ++++++++
 26 files changed, 962 insertions(+), 136 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all commands passed; 907 offline tests / 65 files. Full-tree privacy and staged diff checks passed. No live provider calls.

Decisions I made: the overall deadline also covers Redis cache waits, because an optional storage outage must not prevent partial completion. Signal-aware Redis operations use the installed SDK signal callback and an abort race with listener cleanup. Healthy empty research remains a valid result; interrupted empty research returns upstream. Normal cache keys, defaults and TTLs remain unchanged.

Open issues: none for R17.

## R18 — Bounded chain-name qualifiers (2026-10-24)

Status: DONE

- Restored the eight unambiguous word-boundary chain forms, keeping the two chain lists disjoint.
- Normalized ambiguous chain cores using only the documented separators, leading article, fixed retail qualifiers, and known/request-city words.
- Passed request city labels into live merchant filtering and cached-result validation.
- Added regressions for every listed chain variant, independent examples, custom city qualifiers, and all 19 cached demo names.

Files touched / staged list (before this log):
```text
 src/app/api/run/route.ts             |  6 +--
 src/data/national-chains.json        | 15 +++++---
 src/lib/merchants/chains.ts          | 39 +++++++++++++++----
 src/lib/merchants/filter.ts          |  4 +-
 tests/unit/chains-qualifiers.test.ts | 75 ++++++++++++++++++++++++++++++++++++
 tests/unit/chains.test.ts            |  8 ++--
 6 files changed, 126 insertions(+), 21 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 973 offline tests / 66 files. All 19 demo names remain eligible in default, Denver and Austin contexts; no live calls.

Decisions I made: R18 explicitly requires Marmot Boulder to be excluded although Boulder is absent from cities.json, so Boulder is a fixed qualifier without editing preset city data. Existing R13 assertions that The Gap, Gap Company and restored multi-word chain forms remain independent directly contradict R18; updated only those superseded assertions and preserved all unrelated tests. No demo cache keys or request inputs changed.

Open issues: none for R18.

## R19 — Guided mobile flow and accessible focus (2026-10-24)

Status: DONE

- Added one post-render scroll/focus transition for preset selection, successful planning, confirmation, and result arrival.
- Respected reduced-motion preferences and made section headings programmatically focusable.
- Rendered progress immediately on Confirm, before streamed events arrive.
- Added a mobile View map link targeting a stable wrapper, including while the map chunk is loading.
- Tested transitions against the real page with deferred offline transports and mocked DOM scroll/focus, including stale navigation and rerenders.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                   |  25 +++---
 src/components/AgentTrace.tsx      |   2 +-
 src/components/CategoryConfirm.tsx |   2 +-
 src/components/MerchantCard.tsx    |   9 ++-
 src/components/MerchantMap.tsx     |   2 +-
 src/lib/page-navigation.ts         |  27 +++++++
 tests/unit/page-navigation.test.ts | 155 +++++++++++++++++++++++++++++++++++++
 7 files changed, 207 insertions(+), 15 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 977 offline tests / 67 files. React accessibility/effect review passed. No live provider calls.

Decisions I made: added the single-purpose src/lib/page-navigation.ts helper inside the existing lib directory to keep the page within readability limits; this is a documented addition to the architecture file list. Navigation is consumed after React commits, so headings exist before scrolling. The map link targets its stable wrapper to support lazy loading.

Open issues: none for R19.

## R20 — One merchant name per shortlist (2026-10-24)

Devin: re-warm Austin once after deploy if a full ten-card cached demo is wanted. Existing cached results lose their duplicate at render time; no remote cache was changed.

Status: DONE

- Deduplicated normalized merchant names across categories and locations before branch balancing, retaining the better compareCandidates entry.
- Backfilled from distinct remaining candidates to keep ten merchants when available.
- Added a pure render-time dedupe used by the page for both live and cached results.
- Verified cards, map and CSV receive the same deduplicated list, with order and inputs preserved.

Files touched / staged list (before this log):
```text
 eslint.config.mjs                   |  3 ++-
 src/app/page.tsx                    |  3 ++-
 src/lib/merchants/dedupe.ts         | 16 ++++++++++++++++
 src/lib/merchants/shortlist.ts      | 16 ++++++++++++++--
 tests/unit/dedupe-merchants.test.ts | 36 ++++++++++++++++++++++++++++++++++++
 tests/unit/page-races.test.ts       | 19 ++++++++++++++++++-
 tests/unit/shortlist.test.ts        | 32 ++++++++++++++++++++++++++++++++
 7 files changed, 120 insertions(+), 5 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 983 offline tests / 68 files. No live calls or cache mutations.

Decisions I made: the existing nearest-branch rule still resolves multiple sightings of the same entity before comparing distinct same-name locations. Added only an exact ESLint import exception for the requested pure dedupe module; all other server boundaries and privacy checks remain enforced. Cache keys and request shapes are unchanged.

Open issues: the existing Austin cache can render nine unique merchants until refreshed after deployment.

## R21 — Spreadsheet-safe CSV formatting (2026-10-24)

Status: DONE

- Added exactly one UTF-8 BOM and replaced member-brand separators with semicolons.
- Formatted exact US international phone strings in national form before formula guarding; other numbers retain text protection.
- Rounded both rating columns to one decimal and extended text guards to leading tab/CR.
- Expanded offline CSV tests for precision, quoting, encoding, and synthetic phone cases.

Files touched / staged list (before this log):
```text
 src/lib/csv.ts         | 17 +++++++++++------
 tests/unit/csv.test.ts | 43 +++++++++++++++++++++++++++++++++++++++----
 2 files changed, 50 insertions(+), 10 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 989 offline tests / 68 files. No live calls. Native Excel was not used; acceptance is verified by exact exported bytes and cell values.

Decisions I made: use the shared rating precision constant, including a trailing .0 for whole-number ratings. Synthetic full phone values are constructed at test runtime, retaining the strict privacy scanner.

Open issues: none for the requested automated checks.

## R22 — Preserve safe server errors in the trace (2026-10-24)

Status: DONE

- Added typed plain HTTP errors with status, validated message, and the requested 400/429/503 code mapping.
- Passed those errors into the page trace and rendered supplied messages before static fallbacks.
- Kept network, malformed-response, and unknown failures free of private exception details.
- Tested the real fetch-to-client-to-page-to-trace path, including fallback messages and existing page races.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                   |  5 ++-
 src/components/AgentTrace.tsx      |  2 +-
 src/lib/run-client.ts              | 22 +++++++--
 tests/unit/page-errors.test.ts     | 92 ++++++++++++++++++++++++++++++++++++++
 tests/unit/page-navigation.test.ts |  5 ++-
 tests/unit/page-races.test.ts      |  5 ++-
 tests/unit/run-client.test.ts      | 28 +++++++++++-
 7 files changed, 147 insertions(+), 12 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 1000 offline tests / 69 files. One first-pass privacy fixture test timed out while the build ran concurrently; the complete lint/typecheck/test sequence passed on retry without code or timeout changes. No live provider calls.

Decisions I made: trust only the existing structured server error envelope; malformed HTTP bodies and transport errors use static safe text. Independent review found no blocking issues.

Open issues: none.

## R23 — Add response security headers (2026-10-24)

Status: DONE

- Added the five requested response headers to every path through Next configuration.
- Limited Content-Security-Policy to frame-ancestors and added no CORS headers.
- Tested exact values and path coverage; checked the installed Next headers guide before implementation.

Files touched / staged list (before this log):
```text
 next.config.ts                      | 10 +++++++++-
 tests/unit/security-headers.test.ts | 21 +++++++++++++++++++++
 2 files changed, 30 insertions(+), 1 deletion(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 1001 offline tests / 70 files. No live calls or deployment.

Decisions I made: none beyond the specified headers. Cache requests and keys remain unchanged.

Open issues: none.

## R24 — Bound research request fields (2026-10-24)

Status: DONE

- Bounded city, resolved brand name, category label, and excluded entity IDs with the specified schemas.
- Kept the existing HTTP 400 issue shape and verified rejection happens before cache, limits, or providers.
- Tested exact minimum/maximum values and snapshotted both preset request hashes before changing validation.
- Rebuilt both preset requests using the existing builders and fictional resolved plans; hashes and values remained unchanged.

Files touched / staged list (before this log):
```text
 src/lib/types.ts                      |  8 +++---
 tests/unit/request-builders.test.ts   | 24 +++++++++++++++-
 tests/unit/run-request-bounds.test.ts | 53 +++++++++++++++++++++++++++++++++++
 3 files changed, 80 insertions(+), 5 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 1013 offline tests / 71 files. No live calls.

Decisions I made: preset hash fixtures use real hand-written preset profiles and fake resolved brands/categories, never stored Qloo responses. No request defaults, preset data, or hashing logic changed.

Open issues: none.

## R25 — Explain when edited demos use live research (2026-10-24)

Status: DONE

- Added a pure comparison against the untouched preset profile and its original plan output, without changing requests.
- Displayed the requested muted notice beside Plan and Confirm only when that action's request changed.
- Kept category/status changes separate from saved planning preferences, avoiding warnings on identical research requests.
- Preserved the original plan across edited replans; an untouched retry refreshes a partial baseline.
- Tested both presets, category/status/preference changes, actual page notices, nonmutation, and partial-plan retries.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                          |  20 +++---
 src/components/CategoryConfirm.tsx        |   5 +-
 src/components/ProgramIntro.tsx           |  11 +++
 src/lib/request-builders.ts               |  35 ++++++++-
 tests/unit/page-live-warning.test.ts      | 114 ++++++++++++++++++++++++++++++
 tests/unit/preset-request-changes.test.ts |  82 +++++++++++++++++++++
 6 files changed, 254 insertions(+), 13 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 1028 offline tests / 73 files. No live calls. Independent review caught the partial-baseline retry edge; the fix and regression passed all checks again.

Decisions I made: retain the untouched plan in page state because its resolved brands/categories are needed to compare later requests accurately. Compare normalized builder output in the browser without importing Node hashing. Extracted the unchanged intro into ProgramIntro.tsx to preserve the page/function line limits; this is a small file-tree extension within existing components.

Open issues: none. Request shapes, presets, and cache keys remain unchanged.

## R26 — Polish cached and live merchant details (2026-10-24)

Status: DONE

- Normalized all-day raw hours and existing saved hours text to Open 24 hours, preserving mixed and malformed schedule behavior.
- Showed the three largest brand shares on cards with remaining shares available in a title; CSV retains every share.
- Displayed the user's brand name for matching expansions/acronyms in cards, confirmation evidence, and exports without changing stored data.
- Passed plan brands through the page, cards, and download control; retained full dropdown choices for disambiguation.
- Added hours as the final CSV column and tested helper, component, export, and page wiring with fictional data.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                     |  2 +-
 src/components/CategoryConfirm.tsx   | 24 ++++++++-------
 src/components/ExportButton.tsx      |  8 ++---
 src/components/MerchantCard.tsx      | 35 +++++++++++++--------
 src/lib/config.ts                    |  1 +
 src/lib/csv.ts                       | 15 ++++-----
 src/lib/merchant-display.ts          | 30 ++++++++++++++++++
 src/lib/qloo/insights.ts             |  5 ++-
 tests/unit/category-evidence.test.ts | 34 ++++++++++++++++++++-
 tests/unit/csv.test.ts               | 37 +++++++++++++++++-----
 tests/unit/merchant-card.test.ts     | 59 ++++++++++++++++++++++++++++++++----
 tests/unit/merchant-display.test.ts  | 41 +++++++++++++++++++++++++
 tests/unit/page-races.test.ts        |  1 +
 tests/unit/qloo-insights.test.ts     | 29 ++++++++++++++++++
 14 files changed, 270 insertions(+), 51 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 1058 offline tests / 74 files, plus focused dropdown distinction regressions. No live calls or cache changes.

Decisions I made: CSV previously had no hours field, so append hours as column 17 while preserving the original 16 column positions. Added one pure display helper within src/lib to share client rendering and export behavior. Keep full candidate labels to prevent shortened aliases from hiding the distinction between choices. Cache requests and keys remain unchanged.

Open issues: none.

## R27 — Reject obvious category mismatches (2026-10-24)

Devin: re-warm Denver and Austin once after deploy. Open each demo after deployment; stale mismatched shortlists become cache misses and a healthy run replaces them at the same key. This also covers the R20 Austin refresh; no manual Redis deletion is needed.

Status: DONE

- Added small Coffee shop/Gym deny rules using stored names and genre words, including the owner-confirmed noisy names.
- Applied the same predicate to merchant filtering and cached results; clean cached runs replay unchanged.
- Preserved coffee/espresso bars and ordinary athletic clubs where no contradictory signal exists.
- Added the README explanation and offline deny-map, cache, filtering, ranking, density, and call-count checks.

Files touched / staged list (before this log):
```text
 README.md                               |  2 +
 src/app/api/run/route.ts                |  6 ++-
 src/lib/merchants/category-sanity.ts    | 33 ++++++++++++++
 src/lib/merchants/filter.ts             |  2 +
 tests/unit/category-sanity.test.ts      | 78 +++++++++++++++++++++++++++++++++
 tests/unit/filter.test.ts               | 17 +++++++
 tests/unit/find-merchants.test.ts       | 25 +++++++++++
 tests/unit/run-cache-categories.test.ts | 76 ++++++++++++++++++++++++++++++++
 8 files changed, 237 insertions(+), 2 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 1109 offline tests / 76 files. No live demo runs, extra provider calls, or remote cache edits.

Decisions I made: integrate through filterPlaces, which find-merchants already calls, so exclusion counts and scoring order stay consistent. The helper is one small file within the existing merchants directory. No existing find-merchants snapshot was present; added explicit deterministic survivor/rank/count assertions instead. Request shapes and cache keys remain unchanged; only cached shortlists containing a denied place are refreshed.

Open issues: the post-deployment demo refresh above requires Devin.

## R28 — Let the page scroll past the map (2026-10-24)

Status: DONE

- Disabled wheel zoom and mobile map dragging while retaining desktop dragging and zoom buttons.
- Enabled mobile touch zoom with the requested two-finger hint.
- Tested actual component props for desktop/mobile and preserved enabled/disabled branch-pick callbacks and page race guards.

Files touched / staged list (before this log):
```text
 src/components/MerchantMap.tsx  |  3 +++
 tests/unit/merchant-map.test.ts | 60 +++++++++++++++++++++++++++++++++++++++++
 2 files changed, 63 insertions(+)
```

How to verify: `npm run lint && npm run typecheck && npm test && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules`.

Verification: all checks passed; 1113 offline tests / 77 files. No live calls. Touch behavior is covered by the requested Leaflet prop and callback checks, not a physical device test.

Decisions I made: explicitly retain zoomControl and use Leaflet's mobile detection for both dragging and touchZoom. The map remains loaded through the existing client-only dynamic import. Cache requests and keys are unchanged.

Open issues: none for the requested automated checks.

## R29 — Add sharing metadata and finish public-page cleanup (2026-10-24)

Status: DONE

- Added the deployed metadata base, matching Open Graph/Twitter titles and descriptions, and a static 1200 by 630 PNG preview.
- Captured the real results view using fictional fixtures with provider/store keys empty, PD_AGENT_DISABLED=1, mocked Plan/Run responses, and external browser requests blocked.
- Added MIT License and Source on GitHub footer links and the requested deployed README status.
- Removed five unused boilerplate SVGs after confirming no runtime references; protected scanner references remain intact.
- Fixed both preset buttons to fill their width with left-aligned text and verified the rendered text starts 17 pixels from each button edge.

Files touched / staged list (before this log):
```text
 README.md                       |   2 +-
 public/file.svg                 |   1 -
 public/globe.svg                |   1 -
 public/next.svg                 |   1 -
 public/opengraph-image.png      | Bin 0 -> 78441 bytes
 public/vercel.svg               |   1 -
 public/window.svg               |   1 -
 src/app/layout.tsx              |  24 ++++++++++++++++--
 src/components/PresetPicker.tsx |   6 ++---
 tests/unit/metadata.test.ts     |  54 ++++++++++++++++++++++++++++++++++++++++
 10 files changed, 80 insertions(+), 11 deletions(-)
```

How to verify: `npm run lint && npm run typecheck && npm test -- --maxWorkers=2 && NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1118 offline tests / 78 files. The initial default-worker test run timed out in the existing privacy lockfile fixture at its 5-second limit; the complete suite passed with two workers without changing tests, timeouts, or protection rules. PNG signature/dimensions are tested. Browser inspection confirmed the real social image URL, summary_large_image card, and a successful image/png response. The screenshot contains fictional data only and was visually reviewed; blocked external map tiles leave a plain background. Temporary browser sessions and the local dev server were closed.

Decisions I made: use public/opengraph-image.png with explicit metadata URLs because the protected privacy scanner forbids PNG files under src/app. This preserves the requested social-card behavior without weakening or whitelisting privacy checks. Used the already cached Playwright CLI and installed Chrome without installing dependencies. The CSV hours-column decision is recorded under R26.

Open issues: no remaining R16–R29 implementation work. All 14 items are completed in order with one local commit per item. No live provider calls, push, deployment, remote resources, or remote cache edits occurred. Devin must approve the push and refresh both demos after deployment as recorded under R27.

## R30 — Raise the per-plan Qloo call cap (2026-10-24)

Status: DONE

- Raised the plan cap to 70 Qloo attempts and updated current README and architecture references.
- Retained the 120-call research cap and all daily per-IP/global limits.
- Made transport-budget tests use the configured caps; configuration tests lock the requested values.

Files touched / staged list (before this log):
```text
 README.md                      | 2 +-
 docs/ARCHITECTURE.md           | 4 ++--
 src/lib/config.ts              | 2 +-
 tests/unit/config.test.ts      | 6 ++++++
 tests/unit/qloo-budget.test.ts | 3 +--
 5 files changed, 11 insertions(+), 6 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1119 offline tests / 78 files. The first build failed because the sandbox blocked Turbopack's local CSS worker port. Moved only generated .next output aside and rebuilt successfully with local worker permission and provider keys cleared. No live provider calls.

Decisions I made: current documentation uses 70; historical FIXES instructions and completed PROGRESS entries retain their original numbers. Request shapes, defaults, presets, hashing and cache keys are unchanged.

Open issues: none. No push or remote action.

## R31 — Clean up public limits documentation (2026-10-24)

Status: DONE

- Updated the PRD to document unlimited cache hits before limits and identical live budgets for everyone.
- Added the requested historical note to TASKS without changing its build instructions.
- Removed obsolete variable references from the superseded active setup checklist and recorded the owner's deployment follow-up.
- Automated R16's manual source absence check and extended it to current public Markdown.

Files touched / staged list (before this log):
```text
 docs/PRD.md                    |  6 +++---
 docs/PROGRESS.md               |  6 ++++--
 docs/TASKS.md                  |  2 ++
 tests/unit/public-docs.test.ts | 25 +++++++++++++++++++++++++
 4 files changed, 34 insertions(+), 5 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1121 offline tests / 79 files. Production build passed with local worker permission and provider keys cleared. Independent review found no issues. No live provider calls.

Decisions I made: R16's grep check existed only as a manual command, so public-docs.test.ts now automates it. The retired full variable name is allowed only in historical TASKS/FIXES documents within public Markdown. Protected privacy scripts and their tests intentionally retain legacy secret detection and are unchanged. The two obsolete setup checklist lines were corrected; completed task history is preserved. The one-click preset statement remains true.

Open issues: Devin must remove the retired environment variable and verify public limits after deployment, as listed above. No push or remote action.

## R32 — Freeze category checks around genre families (2026-10-24)

Status: DONE

- Replaced category-specific keyword rules with the four requested genre families and category allowances.
- Match only the final primary-genre segment; keep unknown/missing genres and the existing confirmed-name exceptions.
- Added the freeze comment and preserved the R27 README line, filtering call sites, and cachedEvents integration.
- Updated fake filtering/ranking tests and cache miss/replay tests to use explicit genres instead of name keywords.

Files touched / staged list (before this log):
```text
 src/lib/merchants/category-sanity.ts    | 55 ++++++++++++--------
 tests/unit/category-sanity.test.ts      | 89 +++++++++++++++++++--------------
 tests/unit/filter.test.ts               |  4 +-
 tests/unit/find-merchants.test.ts       | 10 ++--
 tests/unit/run-cache-categories.test.ts |  9 +++-
 5 files changed, 99 insertions(+), 68 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1151 offline tests / 79 files. Independent review and 100 targeted offline tests passed. Production build used local worker permission and cleared provider keys. No live calls or remote cache changes.

Decisions I made: retain only the actual existing confirmed names, without promoting former keyword matches into new exceptions. Family membership is exact on the final genre segment, so unknown suffixes remain eligible. Restaurant allowances apply only to drinking genres. No request shapes, defaults, preset data, hashing, cache keys, or cache prefixes changed.

Open issues: the existing R27 instruction to re-warm Denver and Austin once after deploy covers this change. Later category mismatches belong in README limitations, not new individual rules.

## R33 — Exclude state codes from chain qualifiers (2026-10-24)

Status: DONE

- Excluded two-letter tokens from city-derived chain qualifiers so state codes cannot erase business-name suffixes.
- Preserved the explicit co-op/coop retail qualifiers and all other matching behavior.
- Added independent-name regressions and separated city-word recognition from state-code rejection.

Files touched / staged list (before this log):
```text
 src/lib/merchants/chains.ts          | 3 ++-
 tests/unit/chains-qualifiers.test.ts | 9 ++++++++-
 2 files changed, 10 insertions(+), 2 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1153 offline tests / 79 files, including every requested chain example and all 19 cached names. Independent review found no issues. Production build used local worker permission and cleared provider keys. No live provider calls.

Decisions I made: exclude exactly two-letter city tokens as requested; keep explicit retail qualifiers separate. No preset data or cache identity changes.

Open issues: none. No push or remote action.

## R34 — Correct the mobile map hint (2026-10-24)

Status: DONE

- Changed the mobile hint to: Pinch to zoom. Use the list below to browse merchants.
- Updated the existing mobile-only rendering assertion.
- Retained scrolling, dragging, touch zoom, zoom buttons, and branch-picking behavior.

Files touched / staged list (before this log):
```text
 src/components/MerchantMap.tsx  | 2 +-
 tests/unit/merchant-map.test.ts | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1153 offline tests / 79 files. Existing component tests cover desktop/mobile text, map controls, and branch-picking callbacks. Production build used local worker permission and cleared provider keys. No live provider calls.

Decisions I made: use the exact requested wording in the existing wrapping paragraph. Only text and its assertion changed; no layout or interaction changes. Physical-device layout was not retested.

Open issues: none for the requested change. No push or remote action.

## R35 — Require a full week for all-day opening hours (2026-10-24)

Status: DONE

- Require all seven named days in raw hours before showing Open 24 hours.
- Expand cached day ranges and count unique days, preserving ordinary text for partial, repeated, or overlapping incomplete schedules.
- Keep both midnight closing formats and existing malformed/mixed schedule handling.
- Added the final README Known limitations list covering category accuracy, live research time, and daily limits.

Files touched / staged list (before this log):
```text
 README.md                           |  6 ++++++
 docs/PROGRESS.md                    |  2 ++
 src/lib/merchant-display.ts         | 15 +++++++++++++--
 src/lib/qloo/insights.ts            |  4 +++-
 tests/unit/merchant-display.test.ts |  9 ++++++++-
 tests/unit/qloo-insights.test.ts    | 16 ++++++++++++++--
 6 files changed, 46 insertions(+), 6 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1165 offline tests / 79 files. Full-week, weekday-only, mixed-midnight, repeated-day, overlapping-range, normal, and malformed schedules are covered. Independent review found no issues. Production build used local worker permission and cleared provider keys. No live provider calls.

Decisions I made: cached day ranges follow the existing Monday-to-Sunday formatter order; reversed ranges remain unchanged as ordinary text. Day coverage is a set so duplicated days cannot stand in for missing days. Added only the three requested README limitations and retained the R27 category sentence.

Open issues: none for R30–R35. This final code round is complete in order with one local commit per item. Request shapes/defaults, presets, canonical hashing, cache keys/prefixes, daily limits, and protection scripts/hooks remain unchanged. No push, deployment, live provider call, or remote cache action occurred. Owner follow-ups for the combined R6/R7 push, demo re-warm, real social screenshot, and retired environment setting remain in Waiting for Devin.


## R36 — Keep branches within the selected city (2026-10-25)

Status: DONE

- Reset branches to one blank branch with a fresh ID and the default radius only when the City select changes; preserve every other profile field.
- Show the requested city-reset status, retain it while typing Other city or changing unrelated fields, and hide it after branch edits, map picks, or preset selection.
- Reject located branches more than 50 km from a resolved city with the requested warning; retain the existing missing-city and empty-plan behavior.
- Added offline form/page and planning regressions, including every branch in both unchanged presets.

Files touched / staged list (before this log):
```text
 src/components/ProfileForm.tsx    |  27 ++++--
 src/lib/agent/plan-agent.ts       |  11 ++-
 src/lib/config.ts                 |   1 +
 tests/unit/plan-locations.test.ts |  82 +++++++++++++++++
 tests/unit/profile-city.test.ts   | 180 ++++++++++++++++++++++++++++++++++++++
 5 files changed, 290 insertions(+), 11 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1185 offline tests / 81 files. Production build used local worker permission with provider/store credentials cleared. The component tests exercise real page preset and map-pick callbacks; the location tests mock all service calls. Independent review caught and fixed premature notice dismissal after an empty plan, with a regression test. No live API calls.

Decisions I made: keep the reset notice local to CityField and compare the original blank branch object and branch count. This avoids changing selectPreset and keeps the notice when planning only recreates the branches array without editing the blank branch. No dependency, preset data, cache identity, or protection changes.

Open issues: none for R36. No push or remote action.


## R37 — Keep every branch marker clickable (2026-10-25)

Status: DONE

- Split branch trade areas and branch markers into separate components.
- Render all trade-area circles first, all branch markers second, and merchant markers last.
- Make every trade-area circle non-interactive while retaining branch popups and map-pick callbacks.
- Added an offline rendering regression for multiple branches, an unlocated branch, popup content, and merchant selection.

Files touched / staged list (before this log):
```text
 src/components/MerchantMap.tsx  | 32 +++++++++++++++++-------------
 tests/unit/merchant-map.test.ts | 44 +++++++++++++++++++++++++++++++++++++----
 2 files changed, 58 insertions(+), 18 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1186 offline tests / 81 files. Mocked Leaflet rendering confirms the exact layer order and interactive=false on both trade areas. Existing desktop/mobile map-pick tests still pass. Production build used local worker permission with provider/store credentials cleared. Independent review found no issues. No live API calls.

Decisions I made: retain both components in MerchantMap.tsx and preserve all existing marker styles, popup content, controls, and selection callbacks. No preset data or cache changes.

Open issues: none for R37. No push or remote action.


## R38 — Clarify the address hint after a map pick (2026-10-25)

Status: DONE

- Show Location set on map. Address optional. only when locationSource is map and the address is empty.
- Preserve the existing Street address, city, state placeholder in every other case.
- Added six offline rendering cases for empty/nonempty map addresses and the other location sources.

Files touched / staged list (before this log):
```text
 docs/PROGRESS.md                 |  2 ++
 src/components/BranchEditor.tsx  |  4 +++-
 tests/unit/branch-editor.test.ts | 29 +++++++++++++++++++++++++++++
 3 files changed, 34 insertions(+), 1 deletion(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1192 offline tests / 82 files. Production build used local worker permission with provider/store credentials cleared. Independent review found no issues. No live API calls.

Decisions I made: empty means the empty string, exactly as requested; whitespace retains the default placeholder. No reverse geocoding, API, dependency, preset data, or cache changes.

Open issues: none for R36–R38. All three items are complete in order with one local commit per item. No push or remote action occurred. Devin's review before any push is listed in Waiting for Devin.

## R39 — Remember branches per city (2026-10-25)

Status: DONE

- Added browser-only branch memory with the requested schema default, preserving old saved profiles and both API request shapes.
- Save current branches before city changes and preset selection; restore known saved cities and always start Other city with one blank branch.
- Retain the ten most recently saved cities, including restoration when saving the current city evicts the destination's older memory entry.
- Show the requested restored/reset status and dismiss it after branch edits, map picks, or preset selection.
- Added offline storage, form/page, preset, request-payload, canonical-hash, and cache-key regressions.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                       |   7 ++-
 src/components/ProfileForm.tsx         |  21 ++++---
 src/lib/config.ts                      |   1 +
 src/lib/profile-storage.ts             |  14 ++++-
 src/lib/types.ts                       |   1 +
 tests/fixtures/fake-plan.ts            |   1 +
 tests/unit/page-errors.test.ts         |   5 +-
 tests/unit/page-live-warning.test.ts   |   5 +-
 tests/unit/page-navigation.test.ts     |   5 +-
 tests/unit/page-races.test.ts          |   5 +-
 tests/unit/profile-city-memory.test.ts | 112 +++++++++++++++++++++++++++++++++
 tests/unit/profile-city.test.ts        |  44 +++++++++++--
 tests/unit/profile-storage.test.ts     |  56 ++++++++++++++++-
 tests/unit/request-builders.test.ts    |  22 ++++++-
 14 files changed, 273 insertions(+), 26 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1205 offline tests / 83 files. Independent review found and fixed destination eviction before restoration and preset selection failing on an incomplete remembered draft. Corrected an initial missing-coordinate test assertion and kept Home within its 80-line limit. The sandbox blocked the first build's local CSS worker port; moved only generated .next output aside and rebuilt successfully with local worker permission and provider/store credentials cleared. No live API calls.

Decisions I made: re-saving a city makes it the newest entry. Keep the shared browser-memory helper in profile-storage.ts and the cap in config.ts. Read the destination before eviction. Parse the preset before attaching remembered drafts so an unfinished branch name cannot prevent preset selection; as before, incomplete profiles remain in session state and do not overwrite valid browser storage until their schema is valid. No dependency, preset data, canonical hashing, cache key, request shape, or protection changes.

Open issues: none for R39. No push or remote action. Devin's review before any push is listed above.

## R40 — Require a location for every branch before planning (2026-10-25)

Status: DONE

- Require every branch to have both coordinates or a non-empty trimmed address before enabling Plan merchant categories.
- Show the exact requested location hint next to the disabled button and associate it through aria-describedby.
- Preserve the existing profile/taste validation and enable both unchanged presets, address-only branches, and map-picked branches.
- Added offline page regressions for blank/whitespace addresses, partial/zero coordinates, multiple branches, map callbacks, and both presets; updated the earlier city-reset test for the new disabled state.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                       |  16 +++--
 tests/unit/page-plan-locations.test.ts | 114 +++++++++++++++++++++++++++++++++
 tests/unit/profile-city.test.ts        |  14 ++--
 3 files changed, 128 insertions(+), 16 deletions(-)
```

How to verify: `PD_AGENT_DISABLED=1 npm run lint && PD_AGENT_DISABLED=1 npm run typecheck && PD_AGENT_DISABLED=1 npm test -- --maxWorkers=2 && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all`.

Verification: all checks passed; 1218 offline tests / 84 files. The 13 new location-gating cases and existing city-reset interactions passed. Independent review found no issues. Production build used local worker permission with provider/store credentials cleared. No live API calls.

Decisions I made: use one plain location predicate for canPlan, hint visibility, and the button's accessible description. Zero coordinates are valid; either coordinate alone requires a non-empty address. Keep the changes in page.tsx and preserve the existing function/file length limits. No server, schema, dependency, preset data, request shape, canonical hash, cache key, or protection changes.

Open issues: none for R39–R40. Both items are complete with one local commit each. No push or remote action occurred; wait for Devin's review before any push.

## R41 — Find branches by institution name (2026-10-25)

Status: DONE

- Added the validated `/api/branches` endpoint with a separate 30-per-IP / 300-global daily limit, production shared-store protection, private usage counts, and a two-call Qloo budget covering city resolution and place search.
- Reused the existing place parser and cached transport with latitude-first search coordinates. Filtered closed, distant, and non-branch places; matched normalized institution names and suffixes; deduplicated and sorted results; grouped nearby alternative names.
- Added the exact search explanations, suggestion searches, nearest-five checklist, branch replacement, and confirmation. Lookup state stays out of profiles and browser storage; city changes and every preset selection abort pending requests and clear results.
- Marked selected branches as `qloo_place`, retained their exact coordinates/address, and showed the requested location labels without an approximate hint. Fit the map to all selected branches before merchant research, including Other city searches and subsequent city-center resolution.
- Added offline coverage for transport parameters, schemas, filtering/statuses, limits/budgets, private errors/logs, selection/races, map fitting, R40 planning, and unchanged preset requests/cache keys.

Files touched / staged list (before this log):
```text
 scripts/check-rules.mjs                 |   4 +-
 src/app/api/branches/route.ts           |  53 +++++++++++
 src/app/api/plan/route.ts               |  16 +---
 src/app/page.tsx                        |   8 +-
 src/components/BranchEditor.tsx         |   1 +
 src/components/BranchLookup.tsx         | 128 +++++++++++++++++++++++++++
 src/components/MerchantMap.tsx          |  14 +--
 src/components/ProfileForm.tsx          |   6 +-
 src/lib/branch-lookup-client.ts         |  25 ++++++
 src/lib/branch-lookup.ts                |  71 +++++++++++++++
 src/lib/config.ts                       |   9 ++
 src/lib/qloo-error-response.ts          |  17 ++++
 src/lib/qloo/search.ts                  |  23 ++++-
 src/lib/store/rate-limit.ts             |   5 +-
 src/lib/store/usage.ts                  |   8 +-
 src/lib/types.ts                        |  18 +++-
 tests/fixtures/component-harness.ts     |  82 +++++++++++++++++
 tests/unit/branch-editor.test.ts        |  10 +++
 tests/unit/branch-lookup-client.test.ts |  47 ++++++++++
 tests/unit/branch-lookup-ui.test.ts     | 151 ++++++++++++++++++++++++++++++++
 tests/unit/branch-lookup.test.ts        | 122 ++++++++++++++++++++++++++
 tests/unit/branches-route.test.ts       | 138 +++++++++++++++++++++++++++++
 tests/unit/merchant-map.test.ts         |  65 +++++++++++++-
 tests/unit/page-plan-locations.test.ts  |  22 +++++
 tests/unit/plan-locations.test.ts       |   8 ++
 tests/unit/qloo-budget.test.ts          |   7 +-
 tests/unit/qloo-place-search.test.ts    |  54 ++++++++++++
 tests/unit/rate-limit.test.ts           |  32 ++++++-
 tests/unit/request-builders.test.ts     |  11 +++
 tests/unit/types.test.ts                |  17 ++++
 30 files changed, 1128 insertions(+), 44 deletions(-)
```

How to verify: `npm test -- --maxWorkers=2 && npm run lint && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1308 offline tests / 89 files, lint, TypeScript, and production build passed. Repository rules and privacy scans passed. The build used local worker permission with provider/store credentials cleared and telemetry disabled. Independent review caught the initial map visibility gap; branch-only fitting and a center-change regression fixed it. Final review found no remaining issues. No live API calls were made.

Decisions I made:

- R41 explicitly requires the new branch endpoint, so added only `src/app/api/branches` to the rule checker's exact directory list. Every existing check and hook remains enabled; no privacy exception was added.
- Added small task-specific files in existing directories for branch filtering, client transport, the lookup component, and shared Qloo error mapping. This keeps each responsibility readable and within the file/function limits. The shared error mapping preserves the plan route's behavior. No new dependency.
- Reused the plan deadline and request-cancellation plumbing for lookups. The existing `slimPlace` already supplies missing `external`/`query` defaults, so no second parser was added.
- Keep a preset-selection version only in page state to clear results even for repeated same-city presets. A keyed city session cancels stale lookups while retaining a manually edited search name across city changes. Added a keyed offline component harness to verify the actual form tree and cleanup.

Open issues: live Qloo coverage is deliberately unverified under this task's no-live-calls rule; Devin can test in the browser. Demo presets, plan/run request builders, cache keys, and provider data files are unchanged. No push, deployment, or remote resource action occurred. Start the local dev server with `npm run dev` after the commit and leave it running for Devin.

## R42 — Preview checked branch candidates on the map (2026-10-25)

Status: DONE

- Report only checked, unapplied found locations from BranchLookup, with the requested map hint. New searches, non-found responses, errors, application, city/preset resets, and unmount clear the preview.
- Keep candidates only in page state, separate from the saved profile, and clear them whenever the profile city changes or a preset is selected.
- Draw dashed default-radius circles and hollow candidate markers with names, addresses, and the exact candidate popup text. Show the Candidate legend only during previews and retain the real-branch header count.
- Use a lower Leaflet pane so dynamically added candidates cannot cover real branch markers. Fit changed candidate sets with the existing padding/zoom limits; clearing previews and ordinary rerenders do not refit.
- Added offline regressions for selection, cleanup, storage isolation, marker styling/layers, counts, and stable bounds.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                           |  28 ++++----
 src/components/BranchLookup.tsx            |  13 +++-
 src/components/MerchantMap.tsx             |  61 +++++++++++++----
 src/components/ProfileForm.tsx             |   7 +-
 src/lib/config.ts                          |   2 +
 src/lib/profile-storage.ts                 |   9 ++-
 tests/unit/branch-lookup-ui.test.ts        |  37 ++++++++++-
 tests/unit/merchant-map-candidates.test.ts | 103 +++++++++++++++++++++++++++++
 tests/unit/merchant-map.test.ts            |   7 ++
 tests/unit/page-plan-locations.test.ts     |  21 ++++++
 10 files changed, 250 insertions(+), 38 deletions(-)
```

How to verify: `npm run lint && npm test -- --maxWorkers=2 && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1318 offline tests / 90 files, lint, TypeScript, production build, repository rules, and privacy scans passed. The first focused lint check caught the page's length limits; moved the unchanged blank-profile factory to profile-storage.ts and kept candidate state beside profile state before rerunning successfully. No live API calls occurred.

Decisions I made: the candidate layer uses a dedicated pane below Leaflet's normal overlays because JSX ordering alone cannot keep newly mounted candidates below existing branch markers. Candidate signatures include sorted identities and coordinates, so reordered arrays do not move the view. The factory move preserves existing profile behavior and the readability limits. No API shapes, presets, cache keys, rate limits, dependencies, or protected checks changed.

Open issues: none for R42. Start blank will clear this same temporary state in R43. The existing server on port 3000 was left running. No push or remote action occurred.

## R43 — Start blank from the demo picker (2026-10-25)

Status: DONE

- Added the full-width secondary Start blank button and exact browser-clear explanation, disabled with the demo buttons until ready and while busy.
- Ask the exact confirmation before any changes unless the profile equals the blank profile ignoring branch IDs, member brands are empty, and there is no plan or result. Cancellation preserves data, selection, component keys, and storage.
- Reset the profile, city branch memory, merchant status, brands, demo identity, planning/research state, trace/errors, stage, picking/selection, filter, and candidates. Remount profile/taste/lookup state and focus/scroll to the institution name after the reset commits.
- Save and reload the exact blank profile under the existing profile key while retaining invalid-edit protection and leaving unrelated browser storage untouched.
- Added offline storage, page, and real component-tree tests, including cancelled resets and late upload/lookup completions.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                       | 131 +++++++++---------------------
 src/components/PresetPicker.tsx        |   6 +-
 src/lib/page-research.ts               |  92 +++++++++++++++++++++
 src/lib/profile-storage.ts             |  20 ++++-
 tests/unit/metadata.test.ts            |   5 +-
 tests/unit/page-start-blank-ui.test.ts |  91 +++++++++++++++++++++
 tests/unit/page-start-blank.test.ts    | 141 +++++++++++++++++++++++++++++++++
 tests/unit/profile-blank.test.ts       |  46 +++++++++++
 tests/unit/profile-storage.test.ts     |  21 ++++-
 9 files changed, 454 insertions(+), 99 deletions(-)
```

How to verify: `npm run lint && npm test -- --maxWorkers=2 && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1350 offline tests / 93 files, lint, TypeScript, production build, repository rules, and privacy scans passed. Independent review found no blocking issues. A focused lint check rejected passing a ref into the action factory; the busy check now lives directly in the event handler. The first component integration test exposed an unstable fake setter; its local mock now preserves React's setter identity. All checks passed after those fixes. The existing server returned HTTP 200 from the local homepage on port 3000; no app API was called.

Decisions I made: the shared ProfileSchema rejects empty institution names, so a browser-only schema permits the exact blank profile while preserving every request schema and rejecting other incomplete profiles. Moved the unchanged planning/research hooks into src/lib/page-research.ts within the existing lib directory and grouped profile actions to keep the page/functions below the readability limits. This is the only source file-tree extension. Reused the lookup version for form remounts and the existing navigation helper for focus/scroll. No new storage key, dependency, folder, API shape, cache identity, preset data, rate limit, or protected check changed.

Open issues: none for R43. No live provider call, push, deployment, or remote action occurred; the existing dev server remains running.

## R43 follow-up — Give reset forms distinct sibling keys (2026-10-25)

Status: DONE

- Fixed the browser-reported duplicate React key: ProfileForm and TasteInput shared the numeric reset version under the same parent. Their keys now have distinct profile/taste prefixes while retaining the shared version for remounts.
- Added a regression that inspects explicit keys in each raw sibling array initially, after both preset selections, and after repeated blank resets. Existing reset/remount assertions remain intact.
- Confirmed the new regression fails on the previous code and passes after the repair. The earlier fake-hook harness did not run React reconciliation, so it had missed the duplicate-key warning.
- Preserved the concurrent local R44 revert in ff4851c. It removed the ProgramIntro test during the first full run; verification was repeated against the current tree.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                    |  4 ++--
 tests/unit/page-start-blank.test.ts | 20 +++++++++++++++++++-
 2 files changed, 21 insertions(+), 3 deletions(-)
```

How to verify: `npm run lint && npm test -- --maxWorkers=2 && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1351 offline tests / 93 files, lint, TypeScript, production build, repository rules, and privacy scans passed on the current tree. Read-only browser inspection found the error overlay closed but stale duplicated profile sections remaining from the earlier invalid reconciliation; reload once to discard that old DOM. The dev server remains listening on port 3000. No live API calls or push occurred.

Decisions I made: scope keys by component identity as well as reset version; do not remove the remount behavior required by R43. Preserve the unrelated R44 revert. No storage, request, preset, cache, rate-limit, dependency, or protected-check changes.

Open issues: the supplied screenshot shows only the first of three recorded errors, so the other two entries were not independently identified. This repair addresses the confirmed duplicate-key defect.

## R44 — Make the logo scroll back to the top (2026-10-25)

Status: DONE

- Made ProgramIntro a client component and changed the Perk Desk eyebrow to a non-submit button with the exact accessible label, pointer cursor, and visible keyboard focus ring.
- Preserve the eyebrow's typography, color, and spacing. Clicking only scrolls to top 0, smoothly by default and immediately when reduced motion is requested.
- Added actual-page offline tests proving profile, member brands, and storage remain unchanged, with no reload, navigation, or network request.

Files touched / staged list (before this log):
```text
 src/components/ProgramIntro.tsx  | 11 ++++--
 tests/unit/program-intro.test.ts | 72 ++++++++++++++++++++++++++++++++++++++++
 2 files changed, 81 insertions(+), 2 deletions(-)
```

How to verify: `npm run lint && npm test -- --maxWorkers=2 && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1354 offline tests / 94 files, lint, TypeScript, production build, repository rules, and privacy scans passed. Independent review found no issues. The four added tests also cover browsers without matchMedia. The existing dev server on port 3000 still returns HTTP 200 from the local homepage and was left running.

Decisions I made: use the same reduced-motion query and fallback as the existing page-navigation helper, while keeping the logo action limited to scrollTo. No state, storage, routing, request, dependency, preset, cache, rate-limit, or protected-check changes.

Open issues: none for R42–R44. All three items are implemented in order and committed locally, with no live API calls, push, deployment, or remote resource action. Review at http://localhost:3000.

## FIXES-R12 Step 0 — Restore R44 (2026-10-25)

Status: DONE

- Ran the requested `git revert --no-edit ff4851c` to restore the logo action and its four offline regressions.
- Resolved the appended-log conflict by preserving both the R43 follow-up and the restored R44 history.
- Confirmed all four R44 tests pass; the existing dev server remains listening on port 3000.

Files touched / staged list (before this entry):
```text
 docs/PROGRESS.md                 | 23 +++++++++++++
 src/components/ProgramIntro.tsx  | 11 ++++--
 tests/unit/program-intro.test.ts | 72 ++++++++++++++++++++++++++++++++++++++++
 3 files changed, 104 insertions(+), 2 deletions(-)
```

How to verify: `npm test -- tests/unit/program-intro.test.ts`.

Decisions I made: keep the later R43 key fix and its progress entry when resolving the revert conflict. The normal revert continues as a new local commit; no history rewrite.

Open issues: none. No live API calls or push.

## R45 — Keep the logo reachable in a sticky top bar (2026-10-25)

Status: DONE

- Moved the restored R44 logo into a slim, full-width sticky header; the title and intro still scroll normally.
- Share one 48px bar height and 24px gap through config constants; the map and document navigation both use the resulting 72px offset.
- Set the bar above Leaflet controls with an explained z-index of 1100 and removed conflicting per-target margins.
- Preserved logo accessibility, reduced-motion behavior, and state/storage isolation; added layout and shared-offset regressions.

Files touched / staged list (before this log):
```text
 src/app/layout.tsx                 |  3 ++-
 src/app/page.tsx                   | 12 +++++++-----
 src/components/AgentTrace.tsx      |  2 +-
 src/components/CategoryConfirm.tsx |  2 +-
 src/components/MerchantCard.tsx    |  4 ++--
 src/components/MerchantMap.tsx     |  2 +-
 src/components/ProgramHeader.tsx   | 20 ++++++++++++++++++++
 src/components/ProgramIntro.tsx    | 10 +---------
 src/lib/config.ts                  |  5 +++++
 tests/unit/program-intro.test.ts   | 29 +++++++++++++++++++++++++++--
 tests/unit/sticky-header.test.ts   | 28 ++++++++++++++++++++++++++++
 11 files changed, 95 insertions(+), 22 deletions(-)
```

How to verify: `npm run lint && npm test -- --maxWorkers=2 && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1365 offline tests / 95 files, lint, TypeScript, production build, rules, and full-tree privacy passed. The first build could not bind a sandbox worker port; the elevated retry reused the cached error. Moved only `.next/cache/turbopack` to a temporary backup, then the third build passed with local worker access. The separate `.next/dev` cache and server were preserved. Independent code review found no blocking issue.

Decisions I made: use document-level scroll padding so every current/future navigation target, including the R43 input and merchant cards, shares the same offset. Added one single-purpose ProgramHeader.tsx inside the existing components directory to keep the intro and sticky bar responsibilities separate. No dependency, folder, schema, preset, cache key, rate limit, or protected check changed.

Open issues: none. No live API calls or push. The existing server remains on port 3000.

## R46 — Show an empty state for the blank placeholder branch (2026-10-26)

Status: DONE

- Replace a single unlocated placeholder form with the exact empty message and Add manually action.
- Reveal the same branch using local UI state and focus its name after mounting, without changing or saving profile data.
- Show normal forms for any address, coordinate (including zero), location source, or multiple branches; a different placeholder starts closed.
- Preserve the disabled Plan button/location hint and automatic replacement by selected lookup branches. Adapted earlier city tests to explicitly open manual entry.

Files touched / staged list (before this log):
```text
 src/components/BranchEditor.tsx        |  23 +++++-
 tests/unit/branch-editor-empty.test.ts | 129 +++++++++++++++++++++++++++++++++
 tests/unit/profile-city-memory.test.ts |   5 +-
 tests/unit/profile-city.test.ts        |  26 ++++---
 4 files changed, 168 insertions(+), 15 deletions(-)
```

How to verify: `npm run lint && npm test -- --maxWorkers=2 && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1377 offline tests / 96 files, lint, TypeScript, production build, rules, and full-tree privacy passed. Focused tests also passed; the first focused lint caught an overlong city test file, resolved by reusing the existing text helper. Browser checks confirmed R45 desktop: bar 48px at top 0, z-index 1100, map at 72px, and reset name input at 72px with no horizontal overflow. All app API and external requests were blocked in the isolated browser.

Decisions I made: whitespace-only addresses count as blank, matching R40. Tie manual expansion to the branch ID so city changes cannot reveal the next placeholder accidentally. Show 0 in the display badge while the placeholder is hidden and offer only Add manually there; the underlying one-branch profile is unchanged.

Open issues: none. No live API calls, push, dependency, folder, schema, preset, cache key, rate-limit, or protected-check changes. Port 3000 remains running.

## R47 — Make credit union setup the primary entry (2026-10-26)

Status: DONE

- Applied the exact setup card title/description and made Start with my credit union the first full-width teal action.
- Updated only the confirmation wording in the existing R43 reset logic and removed the obsolete helper.
- Kept both demo labels, branch-count sub-lines, and callbacks; placed their smaller outline buttons after Or explore a demo, stacked on mobile.
- Updated reset/cancellation/focus regressions and added real component checks for ordering, styling, copy, and both local preset loads.

Files touched / staged list (before this log):
```text
 src/app/page.tsx                       |  2 +-
 src/components/PresetPicker.tsx        | 30 +++++++++---------
 tests/unit/page-start-blank-ui.test.ts | 56 ++++++++++++++++++++++++++++------
 tests/unit/page-start-blank.test.ts    |  4 +--
 4 files changed, 65 insertions(+), 27 deletions(-)
```

How to verify: `npm run lint && npm test -- --maxWorkers=2 && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1380 offline tests / 96 files, lint, TypeScript, production build, rules, and full-tree privacy passed. Independent review found no actionable issue. R45/R46 browser checks passed at 1440×1000 and 390×844: sticky bar and reset target remained visible, logo restored scroll without data changes, manual entry focused the stored placeholder, and city changes returned to the empty state. Plan readiness and the hint tracked address entry correctly. No app API requests occurred; external requests were blocked.

Decisions I made: use the existing Plan button teal classes for the main action and a separate responsive demo grid below it. Preserve all reset and preset callback logic and props.

Open issues: none. No live API calls, push, dependency, folder, schema, preset, cache key, rate-limit, or protected-check changes. The original port 3000 server is still running.

## R48 — Explain the source of member brand names (2026-10-26)

Status: DONE

- Applied the exact requested member-brands helper, including the card-spend example.
- Preserved the existing brand-count constant, validation/error text, and all surrounding copy.
- Confirmed the helper fits one line on desktop and wraps naturally on mobile without overflow. No existing test asserted the replaced text.

Files touched / staged list (before this log):
```text
 src/components/TasteInput.tsx | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

How to verify: `npm test && npm run lint && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: final `npm test` passed 1380 offline tests / 96 files. Lint, TypeScript, production build, rules, full-tree privacy, and whitespace checks passed. Independent final review found no actionable issue. Browser checks passed for all R45–R48 at 1440×1000 and 390×844: the main button matches Plan's teal, demos load the original profiles, cancel/accept/already-blank flows work, reset focuses below the bar, and no horizontal overflow occurs. R48 helper occupies one line in the 654px desktop content area and three lines in the 300px mobile content area. No app JavaScript errors were found; deliberately blocked map tiles account for browser network errors. All app API routes and external requests were blocked throughout browser checks.

Decisions I made: retain natural text wrapping instead of forcing a mobile overflow. No other copy or layout change was needed for R48.

Open issues: none for FIXES-R12. Step 0 and R45–R48 are complete in order. No live API calls, push, dependency, folder, schema, preset, cache key, rate-limit, or protected-check changes occurred. The isolated verification browser is closed; the original dev server (PID 36027) remains running on port 3000.

## R49 — Explain the Independents only filter (2026-10-26)

Status: DONE

- Added a reusable native information button with the exact requested label and explanation, a stable tooltip ID, and an accessible description.
- Kept the icon outside the switch label; hover, focus, click/touch, Escape, and outside-pointer dismissal work without changing the filter.
- Used a 240px popup with no animation and a shared stacking constant above Leaflet controls and below the sticky bar.
- Added 11 offline regression tests for accessibility, interaction sequencing, listener cleanup, exact copy, and switch independence.
- Checked the real UI at 375×812 and 1440×1000 with invented plan/run responses and all external requests blocked.

Files touched / staged list (before this log):
```text
 src/components/MerchantCard.tsx    |   7 +-
 src/components/ui/info-tooltip.tsx |  49 +++++++++++++
 src/lib/config.ts                  |   2 +
 tests/unit/info-tooltip.test.ts    | 138 +++++++++++++++++++++++++++++++++++++
 tests/unit/merchant-card.test.ts   |   9 +++
 5 files changed, 204 insertions(+), 1 deletion(-)
```

How to verify: `npm test && npm run lint && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1391 offline tests / 97 files, lint, TypeScript, production build, repository rules, full-tree/staged privacy, and whitespace checks passed. The first unit run exposed a missing Node stub in the new offline test harness; the stub was added and all tests passed. Browser checks confirmed keyboard focus/blur, hover/leave, Escape without icon focus, outside click, and first/second emulated touch taps. The switch remained unchanged. The popup was fully on screen at 375px with no clipping ancestor or horizontal overflow, and both viewport screenshots were visually reviewed. Browser network errors were only deliberately blocked map tiles. Independent component review found no blocking issue.

Decisions I made: capture visibility on pointerdown so touch focus cannot open and immediately close the popup on the same tap. Keep the hidden tooltip mounted so aria-describedby always resolves, and attach dismissal listeners only while it is open. Center the popup under the icon; no ancestor overflow change was needed. All files stay within the existing directories specified by R49.

Open issues: none for R49. No live provider calls, push, new dependencies, filtering changes, preset changes, cache changes, schema changes, rate-limit changes, or protected-check changes. The existing dev server (PID 83678) remains running on port 3000.

## R50 — Label the demo credit unions as fictional (2026-10-26)

Status: DONE

- Changed the PresetPicker paragraph to exactly: "Or explore a demo with a fictional credit union:".
- Updated the existing R47 test to compare the complete paragraph text exactly and kept its main-button-before-demo-buttons assertion.
- Preserved both demo buttons, their order, callbacks, and all preset JSON. Existing offline tests still verify both preset loads without requests.

Files touched: `src/components/PresetPicker.tsx`, `tests/unit/page-start-blank-ui.test.ts`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 src/components/PresetPicker.tsx        | 2 +-
 tests/unit/page-start-blank-ui.test.ts | 4 +++-
 2 files changed, 4 insertions(+), 2 deletions(-)
```

How to verify: `npm test && npm run lint && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1391 offline tests / 97 files, lint, TypeScript, production build, repository rules, full-tree privacy, and whitespace checks passed. Independent review found no issues. A local homepage GET verified the exact new text after the main setup button and before the demo buttons. The original dev server (PID 5496) stayed running on port 3000 throughout.

Decisions I made: keep the change limited to the requested paragraph and existing regression test. The first build could not bind its worker port inside the sandbox; the second reused that cached failure. Moving only the production Turbopack cache to a temporary backup and retrying with approved local execution permissions passed. The dev server cache was untouched. The local homepage check also required approved local execution permissions after sandbox connection failures.

Open issues: none for R50. No live API calls, push, preset changes, dependency changes, new folders in the project, request/response or profile schema changes, cache-key changes, rate-limit changes, Qloo call-cap changes, or protected-check changes.

## R51 — Show an example credit union in the name placeholder (2026-10-26)

Status: DONE

- Changed the institution name input placeholder to exactly "e.g. Bellco Credit Union".
- Updated the existing primary setup reset test to assert the exact placeholder alongside the empty institution name value after "Start with my credit union".
- Kept the input value, label, validation, autocomplete, and Find branches behavior unchanged.

Files touched: `src/components/ProfileForm.tsx`, `tests/unit/page-start-blank-ui.test.ts`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 src/components/ProfileForm.tsx         | 2 +-
 tests/unit/page-start-blank-ui.test.ts | 1 +
 2 files changed, 2 insertions(+), 1 deletion(-)
```

How to verify: `npm run lint && npm test && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1391 offline tests / 97 files, lint, TypeScript, production build, repository rules, full-tree privacy, and whitespace checks passed. The first test run timed out in an existing privacy-files test while the build was also running; the full suite passed on retry after the build finished, without changing tests or timeouts. Independent scope review confirmed the existing reset test covers the required behavior. The original dev server (PID 29622) remains running on port 3000.

Decisions I made: extend the existing reset test rather than add a duplicate; the total test count stays at 1391. Run the production build with provider credentials cleared and approved local execution permissions for its worker port.

Open issues: none for R51. No live API calls, push, preset changes, dependency changes, new folders in the project, request/response or saved profile schema changes, cache-key changes, rate-limit changes, Qloo call-cap changes, or protected-check changes.

## R52 — Match the institution example to the selected city (2026-10-26)

Status: DONE

- Added one named city-label mapping beside ProfileForm for the exact Denver and Austin examples.
- Used the exact generic example for Other city, empty city, and unknown labels without prefilling the name.
- Updated the R51 reset assertion and added an offline city-switch regression that checks the empty value at every step.

Files touched: `src/components/ProfileForm.tsx`, `tests/unit/page-start-blank-ui.test.ts`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 src/components/ProfileForm.tsx         |  7 ++++++-
 tests/unit/page-start-blank-ui.test.ts | 17 +++++++++++++++++
 2 files changed, 23 insertions(+), 1 deletion(-)
```

How to verify: `npm run lint && npm test && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1392 offline tests / 97 files, lint, TypeScript, production build, repository rules, full-tree privacy, and whitespace checks passed.

Decisions I made: use a small Map keyed by the city label so every unknown label receives the generic fallback. Run builds with provider credentials cleared and local worker-port permission. Keep the existing dev server on port 3000.

Open issues: none for R52. No live Qloo or DeepSeek calls, push, dependencies, folders, data, schema, cache-key, rate-limit, call-cap, or protected-check changes.

## R53 — Guide mobile branch picking to the map and back (2026-10-26)

Status: DONE

- Added mobile-only navigation on Pick, map selection, and both Cancel controls using the existing scroll/focus helper after React commits.
- Gave branch fieldsets stable IDs and programmatic focus; retained the global sticky-header scroll offset and reduced-motion behavior.
- Added the named picking banner and Cancel button inside the map aside, with responsive Tap/Click wording and Branch N fallback.
- Kept responsive instructions beside the in-form button and preserved desktop scroll/focus behavior.
- Added eight offline interaction regressions and retained map-coordinate/cursor tests.

Files touched: `src/app/page.tsx`, `src/components/BranchEditor.tsx`, `src/components/MerchantMap.tsx`, `tests/unit/merchant-map.test.ts`, `tests/unit/page-map-picking.test.ts`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 src/app/page.tsx                    |  27 +++++++--
 src/components/BranchEditor.tsx     |  19 ++++++-
 src/components/MerchantMap.tsx      |   3 -
 tests/unit/merchant-map.test.ts     |   6 +-
 tests/unit/page-map-picking.test.ts | 106 ++++++++++++++++++++++++++++++++++++
 5 files changed, 150 insertions(+), 11 deletions(-)
```

How to verify: `npm run lint && npm test && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1400 offline tests / 98 files, lint, TypeScript, production build, repository rules, full-tree privacy, and whitespace checks passed. Independent review found no remaining issue. The first test run caught two assertions for the replaced generic map status; these now verify active/inactive cursor behavior, with named-banner coverage in the new tests.

Decisions I made: the specific all-screen banner requirement replaces the old generic map instruction to avoid duplicate messages and conflicting mobile wording. Preserve desktop map behavior and all non-picking layout. Keep branch navigation state in a small page hook to meet function-length limits; responsive spans follow lg without hydration or resize state. No new folders or production files.

Open issues: none for R53. No live provider calls, push, dependencies, data, schema, cache-key, rate-limit, call-cap, or protected-check changes.

## R54 — Add a mobile map action to each merchant card (2026-10-26)

Status: DONE

- Added a View on map text button beside each merchant's existing links, hidden at lg and above.
- Used the exact merchant-specific accessible name and the existing selection callback to highlight the matching pin.
- Scrolled and focused the map card through scrollToElement, preserving reduced-motion handling and the shortlist header link.
- Added two offline regressions for responsive placement, accessible labeling, selection ID, and navigation.

Files touched: `src/components/MerchantCard.tsx`, `tests/unit/merchant-map-link.test.ts`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 src/components/MerchantCard.tsx      |  8 ++++--
 tests/unit/merchant-map-link.test.ts | 51 ++++++++++++++++++++++++++++++++++++
 2 files changed, 57 insertions(+), 2 deletions(-)
```

How to verify: `npm run lint && npm test && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1402 offline tests / 99 files, lint, TypeScript, production build, repository rules, full-tree privacy, and whitespace checks passed. Independent review found no issue.

Decisions I made: pass the card's existing selection callback into its facts/links section and stop click propagation to avoid a duplicate parent click selection. Keep the desktop card links and layout unchanged.

Open issues: none for R54. No live provider calls, push, dependencies, folders, data, schema, cache-key, rate-limit, call-cap, or protected-check changes.

## R55 — Show clear planning activity and elapsed time (2026-10-26)

Status: DONE

- Added the same small CSS spinner before Planning… and beside the teal planning status; both icons are hidden from screen readers and stop animating under reduced motion.
- Added whole elapsed seconds, updated once per second in an aria-hidden span, with interval cleanup and fresh zero state for every plan.
- Reserved the status line's complete wrapped height while idle so showing it does not shift mobile or desktop layout.
- Added seven fake-timer regressions for 0s/3s, success, failure, cancellation, restart, immediate replay, unmount, and accessibility.
- Kept AgentTrace and the research transport unchanged; completed offline browser checks for all four items.

Files touched: `src/app/page.tsx`, `src/components/PlanningStatus.tsx`, `src/lib/config.ts`, `tests/unit/planning-status.test.ts`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 src/app/page.tsx                   |  5 +-
 src/components/PlanningStatus.tsx  | 29 ++++++++++++
 src/lib/config.ts                  |  1 +
 tests/unit/planning-status.test.ts | 95 ++++++++++++++++++++++++++++++++++++++
 4 files changed, 128 insertions(+), 2 deletions(-)
```

How to verify: `npm test && npm run lint && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1409 offline tests / 100 files, lint, TypeScript, production build, repository rules, full-tree/staged privacy, and whitespace checks passed. Independent R55 and React hook/accessibility review found no issues. Browser checks at 390×844 and 1440×1000 confirmed 0s→3s, equal idle/active status heights, timer reset, hidden spinner semantics, and readable layout. R52 city placeholders kept the name empty. R53 mobile map picking and Cancel returned focus to the correct branch, the banner remained below the sticky header, and desktop Pick did not scroll. R54 selected the merchant pin and focused the map; the card link was visible at 1023px and hidden at 1024px, and the header link remained available. Screenshots were visually reviewed, with no mobile horizontal overflow. Browser plan/run responses were the existing hand-written fake fixtures; all other app API and external requests were blocked. Browser resource errors came only from deliberately blocked map tiles.

Decisions I made: split planning feedback into `PlanningStatus.tsx` within the existing components directory to keep each file focused and remain within the page's readability limits (AGENTS.md §5.1). Mount the timer only during planning, so success/failure/cancellation/unmount all share cleanup without a reset effect. Keep the full invisible status text while idle to reserve its actual mobile wrapping height. The one-second conversion lives in config.

Open issues: none for R52–R55. All four items are complete in order with one local commit each. No live Qloo/DeepSeek calls, push, dependency changes, new folders, preset/data changes, request/response or saved-profile schema changes, cache-key changes, rate-limit changes, Qloo call-cap changes, or protected-check changes. The isolated verification browser is closed; the original dev server (PID 64760) remains running on port 3000.

## R56 — Remove the idle planning-status gap (2026-10-26)

Status: DONE

- Render PlanningStatus only during the planning stage, leaving no element or reserved space while idle.
- Removed the invisible idle branch and placeholder; preserved both spinners, teal status text, status role, and silent elapsed-seconds span.
- Updated the seven offline timer regressions to check absence while idle and after success, failure, cancellation, and immediate replay; retained 0s/3s, restart, and unmount coverage.

Files touched: `src/app/page.tsx`, `src/components/PlanningStatus.tsx`, `tests/unit/planning-status.test.ts`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 src/app/page.tsx                   |  2 +-
 src/components/PlanningStatus.tsx  |  7 +++----
 tests/unit/planning-status.test.ts | 16 +++++++---------
 3 files changed, 11 insertions(+), 14 deletions(-)
```

How to verify: `npm test && npm run lint && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1409 offline tests / 100 files, lint, TypeScript, production build, repository rules, full-tree privacy, and whitespace checks passed. Timer cleanup remains tied to component unmount. The existing dev server (PID 522) remains listening on port 3000.

Decisions I made: remove the planning prop because the page now owns mounting; keep the timer and spinner implementation unchanged. Production build used cleared provider credentials and local worker-port permission. Git staging needed local write permission for the index.

Open issues: none for R56. No live Qloo/DeepSeek calls, push, dependency changes, new folders, preset/data changes, API or saved-profile schema changes, cache-key changes, rate-limit changes, call-cap changes, or protected-check changes.

## R57 — Center typed Other cities from bundled Census data (2026-10-26)

Status: DONE

- Added the city-center tuple schema and inferred type; statically parse the existing Census table once and index normalized labels in a Map.
- Added named whole-US center/zoom constants and moved center resolution into data.ts, preserving preset, bundled-table, plan, whole-US, and preset-safety-fallback precedence.
- Added exact empty/unknown-city guidance above the map only when no preset, table match, plan center, located branch, or candidate preview supplies a location; retained the pick hint first and kept map picking available.
- Added 33 offline lookup, schema, precedence, and real-page regressions, including whitespace normalization, zero coordinates, candidate removal, and the unchanged three-option city dropdown.
- Added the requested Census attribution in the Architecture tree and frontend section. The committed city-center data, preset JSON, README, server lookup, and MerchantMap bounds behavior remain unchanged.

Files touched: `docs/ARCHITECTURE.md`, `src/app/page.tsx`, `src/lib/config.ts`, `src/lib/data.ts`, `src/lib/types.ts`, `tests/unit/data.test.ts`, `tests/unit/page-city-map.test.ts`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 docs/ARCHITECTURE.md             |   2 +
 src/app/page.tsx                 |  19 ++++-
 src/lib/config.ts                |   4 ++
 src/lib/data.ts                  |  28 +++++++-
 src/lib/types.ts                 |   2 +
 tests/unit/data.test.ts          |  65 ++++++++++++++++-
 tests/unit/page-city-map.test.ts | 150 +++++++++++++++++++++++++++++++++++++++
 7 files changed, 261 insertions(+), 9 deletions(-)
```

How to verify: `npm test && npm run lint && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1442 offline tests / 101 files, lint, TypeScript, production build, repository rules, full-tree privacy, and whitespace checks passed. Existing MerchantMap bounds tests passed without source changes. Independent spec and production review found no actionable issue. The diff confirms both city JSON files are identical to the already-committed versions.

Decisions I made: keep the small presentation-only hint in page.tsx and the shared center lookup/resolution in data.ts, within file/function limits. Keep the first-preset safety fallback explicitly as specified, although current matching preset labels already return at the first step. Address text alone does not hide the hint; both coordinates are required. Update Architecture only in the two places explicitly authorized by R57. New tests stay in the existing allowed unit-test directory.

Open issues: none for R57. No live Qloo/DeepSeek calls, push, dependencies, new folders, data edits, API or saved-profile schema changes, cache-key changes, rate-limit changes, call-cap changes, or protected-check changes. The existing dev server stays running on port 3000.

## R58 — Fill the credit union name from a tappable example (2026-10-26)

Status: DONE

- Store bare example names in the existing city mapping and build the unchanged R52 placeholders from them.
- Show the exact selectable "Not sure? Try" line directly below the name input for Denver and Austin, with a teal underlined button and the specified accessible name.
- Fill the name through the same onChange path as typing, without fetching; keep the initial name empty and hide the line for Other city or a trimmed, case-insensitive match.
- Respect the form's disabled state and add 13 offline regressions for values, placement, accessibility, visibility, city changes, disabled buttons, and absence of requests.

Files touched: `src/components/ProfileForm.tsx`, `tests/unit/profile-example.test.ts`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 src/components/ProfileForm.tsx     |  14 +++--
 tests/unit/profile-example.test.ts | 114 +++++++++++++++++++++++++++++++++++++
 2 files changed, 124 insertions(+), 4 deletions(-)
```

How to verify: `npm test && npm run lint && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1455 offline tests / 102 files, lint, TypeScript, production build, repository rules, full-tree privacy, and whitespace checks passed. The first full test run timed out in the existing privacy-files lockfile-scan test while other checks were running (1454 tests passed); the isolated full-suite retry passed without changing tests or timeouts. Independent R58 and React/accessibility review found no actionable issue. A local homepage GET returned HTTP 200 and confirmed server-rendered example text with no idle planning-status text.

Decisions I made: keep the small example directly in ProfileForm and use a native type=button so it cannot submit a form. Use one city-to-name mapping for both displays. Preserve field contents on city changes and only fill when the user activates the example. No new production file is needed; the new tests use the existing allowed unit-test directory.

Open issues: none for R56–R58. All three items are complete in the requested order with one local commit each. No live Qloo/DeepSeek calls, push, dependencies, new folders, city/preset data edits, API or saved-profile schema changes, cache-key changes, rate-limit changes, call-cap changes, or protected-check changes. The existing dev server (PID 522) remains running on port 3000.

## R59 — Resolve branch lookup centers from the bundled city table first (2026-10-26)

Status: DONE

- Preserve exact preset-city precedence, then use the shared normalized findUsCityCenter lookup before the existing Qloo locality fallback.
- Return the bundled canonical label and coordinates for table cities, skipping the locality call; add the requested Census internal-point comment.
- Keep place search, the 50 km filter, genre/closed/non-branch filters, matching, suggestions, statuses, limits, and call caps unchanged.
- Add mocked-Qloo coverage for Portland with unusual spacing/case, both preset cities, and the existing unknown-city fallback; document the center order in Architecture.

Files touched: `src/lib/branch-lookup.ts`, `tests/unit/branch-lookup.test.ts`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`.

Staged list (before this log):
```text
 docs/ARCHITECTURE.md             |  2 ++
 src/lib/branch-lookup.ts         |  5 ++++-
 tests/unit/branch-lookup.test.ts | 20 ++++++++++++++++----
 3 files changed, 22 insertions(+), 5 deletions(-)
```

How to verify: `npm test -- --maxWorkers=1 && npm run lint && npx tsc --noEmit && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && npm run check:privacy`.

Verification: 1457 offline tests / 102 files passed, including 47 targeted branch-lookup and branches-route tests. Lint, TypeScript, production build, repository rules, full-tree privacy, and whitespace checks passed. The first two `npm test` runs each passed 1456 tests but exceeded the existing five-second timeout in `privacy-files.test.ts` (root lockfile scan). The complete suite passed on the third attempt with one worker; no tests, timeouts, or protections were weakened. Independent review found no actionable issues. The existing dev server remains on port 3000 and its homepage returned HTTP 200.

Decisions I made: limit test concurrency only for verification to avoid the existing privacy-test timeout under parallel load. QLOO_API.md describes generic planning/address locality resolution, not branch lookup's locality step, so its conditional documentation change is unnecessary. README remains unchanged. The requested Architecture line is the only documentation edit outside this log.

Open issues: none for R59. No live Qloo/DeepSeek calls, push, dependencies, folders, preset/city data edits, API or saved-profile schema changes, rate-limit changes, call-cap changes, or protected-check changes. Table-city place-search cache keys naturally use the bundled coordinates, as authorized; cache construction is unchanged.

## Branch add/remove repairs (2026-10-30)

Status: DONE

Repair plan:
1. Preserve each visible branch draft through add, edit, and remove transitions, while a new city's placeholder starts closed.
2. Separate historical browser drafts from current request validation so an empty historical name cannot prevent saving the valid current city.
3. Choose an unused default branch name after removals.
4. Replay the reported sequences through actual components and storage, then run the complete offline verification and independent review.

What was done:
- Track visible branch IDs for add/edit/remove operations so a remaining blank draft stays editable and the displayed count stays accurate.
- Guard add, edit, and remove handlers while disabled and preserve the existing one-to-five-branch limit.
- Skip occupied default names, including differences in case or surrounding spaces, without renaming existing branches.
- Allow empty names only in historical browser city drafts; retain all other validation and keep current fields and API requests strict.
- Add regressions for add/remove visibility, alternating edits, city changes, count limits, disabled controls, default names, actual save/load round trips, historical draft restoration, and preset persistence.

Files touched: `src/components/BranchEditor.tsx`, `src/lib/profile-storage.ts`, `tests/unit/branch-editor-actions.test.ts`, `tests/unit/branch-persistence.test.ts`, `tests/unit/profile-storage.test.ts`, `docs/PROGRESS.md`.

How to verify: `npm run lint && npm test -- --maxWorkers=1 && npm run typecheck && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && git diff --check`.

Decisions I made:
- Preserve R46's local-only expansion state; a fresh city placeholder and a remount still start with the existing empty-state behavior. Keep the last branch because the current product requires one to five branches.
- Preserve R43's last-valid-snapshot policy when the current city's required fields are incomplete. Relax only the browser history name rule to retain the empty-name drafts already supported by R39; do not change the storage key, object shape, API schemas, or request contents.
- Use existing dependencies and allowed unit-test files. Run the full suite with one worker to avoid the known privacy-scan timeout under parallel load.
- The prior statechart analysis could not run TLC because the local runtime dependencies were missing. Verification here uses real component callbacks and real storage functions with invented data and offline browser substitutes, not a formal proof or a live browser run.

Verification: all 1604 offline tests across 106 files passed, including 21 new regressions. Lint, typecheck, production build, repository rules, full-tree privacy, and whitespace checks passed. Independent review found no actionable issue in the editor changes, historical draft boundary, or request validation. The first build failed because the sandbox denied Turbopack's local port binding; an elevated retry reused the failed cache. Moving the generated Turbopack cache to a temporary backup and rerunning the same production build with local-process permission succeeded. No source configuration or protections were changed to make the build pass.

Staged list (before this log):
```text
 src/components/BranchEditor.tsx          |  29 ++++++--
 src/lib/profile-storage.ts               |  10 ++-
 tests/unit/branch-editor-actions.test.ts | 121 +++++++++++++++++++++++++++++++
 tests/unit/branch-persistence.test.ts    | 100 +++++++++++++++++++++++++
 tests/unit/profile-storage.test.ts       |  36 +++++++++
 5 files changed, 287 insertions(+), 9 deletions(-)
```

Open issues: no additional action required from Devin for these repairs. No live service calls, remote actions, new dependencies, or protected-check changes.

## Persist blank branch drafts through refresh (2026-10-30)

Status: DONE

- Replace location-based placeholder inference with an optional browser-only `isPlaceholder` marker. New/reset city placeholders are marked explicitly; old saved branches without the marker remain visible.
- Persist manual activation and edits, so a sole unlocated branch stays visible after reload, deletion of its sibling, and city round trips. Keep focus behavior and the one-to-five-branch limit.
- Save incomplete institution, city, and branch-name drafts in browser storage, with existing type, maximum-length, coordinate, radius, and count checks. API request builders retain their complete-data validation.
- Add reload regressions using real components and save/load functions, plus request/cache boundary tests. Update older expectations for explicit placeholder creation and persisted manual activation.

Files touched: `src/components/BranchEditor.tsx`, `src/components/ProfileForm.tsx`, `src/lib/profile-storage.ts`, `src/lib/types.ts`, `tests/unit/branch-editor-actions.test.ts`, `tests/unit/branch-editor-empty.test.ts`, `tests/unit/branch-refresh.test.ts`, `tests/unit/page-city-map.test.ts`, `tests/unit/profile-city.test.ts`, `tests/unit/profile-draft-requests.test.ts`, `tests/unit/profile-storage.test.ts`, `docs/PROGRESS.md`.

How to verify: `npm run lint && npm test -- --maxWorkers=1 && npm run typecheck && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && git diff --check`.

Decisions I made:
- This request supersedes the previous entry's decision to reset expansion on reload and retain only complete current profiles. Browser drafts now preserve the user's work even before other required fields are filled; planning still requires complete values and a branch location.
- Keep the existing storage key and add only an optional profile-branch field. Do not change the API BranchSchema or request shapes. Request parsing strips the marker before cache construction; tests compare complete requests and keys against unchanged baselines.
- A missing marker in old storage means a user-visible branch. Do not infer that legacy data is disposable from its name or missing location.
- Manual activation now changes the profile, clears the city-reset notice as other edits do, and makes Start blank request confirmation before clearing the draft.
- Follow the React skill review for schema compatibility, event-owned state changes, stable branch IDs, focus effects, and derived rendering. Use the installed Playwright locally with isolated browser storage and external/API request interception.

Verification: all 1619 offline tests across 108 files passed, including 8 new refresh tests and 7 request-boundary tests. Lint, typecheck, production build, repository rules, full-tree privacy, and whitespace checks passed. The first full suite found six stale assertions in city-map/city-reset tests; they were updated to require the explicit placeholder marker and the new persisted manual activation. Independent code review found no actionable production issue.

Real-browser verification: 8 scenarios passed in isolated headed Chrome against localhost only, using UI clicks/fills and actual page reloads. Covered manual activation before institution/address entry, add blank B/remove A/reload, empty current branch name, clearing an existing address, Denver/Austin round trips, empty/partial Other city, 390px mobile reload without overflow, and reset returning to a genuine empty placeholder. Compared surviving branch IDs and displayed counts, confirmed planning stayed disabled for incomplete drafts, and visually inspected desktop/mobile screenshots. Research API requests: 0; runtime page errors: 0; all 129 external resource requests were blocked. No user browser data was changed. Temporary test scripts, screenshots, and result receipts remain outside the repository.

Staged list (before this log):
```text
 src/components/BranchEditor.tsx           |  29 +++---
 src/components/ProfileForm.tsx            |   2 +-
 src/lib/profile-storage.ts                |  20 ++--
 src/lib/types.ts                          |   7 +-
 tests/unit/branch-editor-actions.test.ts  |  10 +-
 tests/unit/branch-editor-empty.test.ts    |  15 +--
 tests/unit/branch-refresh.test.ts         | 147 ++++++++++++++++++++++++++++++
 tests/unit/page-city-map.test.ts          |   2 +-
 tests/unit/profile-city.test.ts           |   9 +-
 tests/unit/profile-draft-requests.test.ts |  72 +++++++++++++++
 tests/unit/profile-storage.test.ts        |  17 ++--
 11 files changed, 279 insertions(+), 51 deletions(-)
```

Open issues: none for this repair. No remote actions, live service calls, dependency additions, or protected-check changes.

## Allow removing the last branch (2026-10-30)

Status: DONE

- Enable Remove for the last visible branch, returning to the existing empty state with a 0 / 5 count and Add manually.
- Replace the removed branch with a fresh, explicitly marked empty placeholder so browser storage and city memory retain the empty state without changing schemas.
- Give the placeholder a new ID to clear an active map pick and allow each later manual addition to focus its name. Clear the old name, address, coordinates, source, and custom radius.
- Preserve disabled editing, the five-branch maximum, and planning's location requirement. Add regressions for repeated removal/addition, reload, city round trips, map-pick cancellation, planning readiness, and empty-profile reset.

Files touched: `src/components/BranchEditor.tsx`, `tests/unit/branch-editor-actions.test.ts`, `tests/unit/branch-refresh.test.ts`, `docs/PROGRESS.md`.

How to verify: `npm run lint && npm test -- --maxWorkers=1 && npm run typecheck && QLOO_API_KEY= DEEPSEEK_API_KEY= UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= PD_AGENT_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm run build && npm run check:rules && npm run check:privacy -- --all && git diff --check`.

Decisions I made:
- This request supersedes the earlier decision to keep the last visible branch. Editing may return to zero visible branches; generating a plan still needs a valid branch location.
- Reuse the existing placeholder representation instead of saving an empty array, which the current storage and request schemas reject. Use Main branch and the default radius to match emptyProfile and isEmptyProfile.
- Keep all production changes in BranchEditor and use the existing unit-test files. No storage key, API shape, dependency, or directory changes are needed.

Verification: all 1624 offline tests across 108 files passed, including five added cases. Lint, typecheck, production build, repository rules, full-tree privacy, and whitespace checks passed. Independent review found no actionable issue. The first build was blocked by the sandbox's local-port restriction; after backing up the generated Turbopack cache, the same build passed with local-process permission. No live APIs or real browser session were used for this repair.

Staged list (before this log):
```text
 src/components/BranchEditor.tsx          | 15 ++++++++----
 tests/unit/branch-editor-actions.test.ts | 27 +++++++++++++++++-----
 tests/unit/branch-refresh.test.ts        | 39 ++++++++++++++++++++++++++++++++
 3 files changed, 70 insertions(+), 11 deletions(-)
```

Open issues: none for this repair. No remote actions, live service calls, dependency additions, or protected-check changes.
