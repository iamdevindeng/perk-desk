# FIXES-R6: quota safety, run deadline, chain regression, mobile UX, CSV, polish

> Codex: read this file after AGENTS.md. Same rules as FIXES-R1 to R5: one commit per item, in the order below. After each item run `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules` and log it in docs/PROGRESS.md with the staged-file list (`git diff --cached --stat`). Never use `--no-verify` or `git add -A`, never weaken the privacy checks. No deploy, no remote resource actions (no Vercel/Upstash changes). Push only when Devin says so.
>
> **New for R6: zero live provider calls.** Do not run `npm run smoke`, `npm run eval`, or the dev server with real `QLOO_API_KEY` / `DEEPSEEK_API_KEY`. Verify everything with unit tests, fakes, and `PD_AGENT_DISABLED=1` with keys unset. The Qloo quota is shared with the live judging site.
>
> **Demo cache rule.** The live Denver and Austin demos replay from Redis (`pd:v1:plan:*`, `pd:v1:run:*`, 30-day TTL). The key is `cacheKey(kind, request)` (src/lib/hash.ts:23-25) over the request built by src/lib/request-builders.ts. Do not change, for the two unmodified presets: the request shape or defaults, preset data in src/data/presets/, `canonicalJson`/`cacheKey`, or the `pd:v1` prefix. `cachedEvents` (src/app/api/run/route.ts:41-52) also drops a cached run if any merchant now matches `isNationalChain`/`isTeamStore`, so a chain-list change must not match any of the 19 cached names listed in R18. If an item cannot avoid invalidating a demo, its text says so, and the PROGRESS entry must start with **"Devin: re-warm <city> once after deploy"**.

## R16 (P1). Normal public-site limits, no judge code

Decision (Devin, 10/24): judges must be able to test with **no code and no barrier**, like any public website. Remove the judge-code feature entirely and rely on generous, ordinary abuse limits.

Problem:
- The plan route skips the per-IP limit for any request with a `presetId` (src/app/api/plan/route.ts:53). The client still controls `preferences`/`brandOverrides`, so each variant misses the cache and runs live without a per-IP limit.
- The run route skips the per-IP limit when `isPresetRun` passes (src/app/api/run/route.ts:81; src/lib/store/rate-limit.ts:127-141). That check covers only branches and brands, so varying `categories` or `excludeEntityIds` gives unlimited live runs from one IP.
- No per-run Qloo ceiling exists. find-merchants makes 2 calls per branch per category (src/lib/agent/tools/find-merchants.ts:63-64, :116-117), plus replacement categories, plus up to `BRAND_CHECK_MAX`=10 brand checks, plus unlimited `searchCategories` within 6 agent steps. Worst case is 100+ calls per run.
- The global run limit of 60/day is tight enough that a few heavy visitors could use it up during judging week.
- Plans are not counted in usage logs. `withRunUsage` wraps only the run route (src/lib/store/usage.ts:15).

Fix:
- **Remove the judge code completely**: the `x-judge-code` header handling and `timingSafeEqual` check (run and plan routes, rate-limit.ts), `JUDGE_BYPASS_CODE` in src/lib/env.ts, config and `.env.example`, the judge-code input / localStorage key `perkdesk:v1:judge` (profile-storage.ts, run-client.ts, AgentTrace.tsx and any UI), and the related docs in README.md and docs/ARCHITECTURE.md. Remove or rewrite the tests that cover it. No message anywhere should mention a judge or access code.
- Remove the preset `skipIp` from both routes. A cached demo is served before the limit check (run/route.ts:77-79, plan/route.ts:66-68), so normal demo clicks still cost nothing and are never limited. Delete `isPresetRun` and `branchesMatch` if they become unused.
- New limits in src/lib/config.ts:
  - `RUN_LIMIT_PER_IP` = 10/day (unchanged), `RUN_LIMIT_GLOBAL` = **150**/day (was 60).
  - `PLAN_LIMIT_PER_IP` = 30/day (unchanged), `PLAN_LIMIT_GLOBAL` = **300**/day (was 200).
- Per-request Qloo hard cap: `RUN_QLOO_CALL_CAP = 120` and `PLAN_QLOO_CALL_CAP = 30`. A normal run uses about 35-40 calls, so this never affects normal use or the cached demos. Count in the same async context that `recordUsageCall` uses (usage.ts:10-13) and wrap the plan route in that context with `scope=plan`. Once the cap is reached, the Qloo client (src/lib/qloo/client.ts:64-67) throws a new non-retryable error, code `budget`, before fetching.
  - The run treats `budget` like the circuit breaker in R17: no more live calls; build the shortlist and pitches from candidates already gathered.
  - The partial result shows an agent note ("Stopped early to stay within the research budget") and is not cached (`onCacheable(false)`).
- Limited message (friendly, no codes): "Today's live-research limit has been reached. The Denver and Austin demos still work instantly." Same wording for per-IP and global, with the demo buttons still clickable.
- Log live plans as `[usage] scope=plan`.
- No daily Qloo budget counter and no reserve pool (dropped by Devin as unnecessary).

Cache impact: none. Keys and results are unchanged.

Tests (must pass):
- A preset request with altered `preferences` (plan) or altered `categories`/`excludeEntityIds` (run) consumes the per-IP limit and is limited once it is exhausted.
- A cached preset plan or run is still served when the per-IP and global limits are exhausted.
- An `x-judge-code` header has no effect; no `JUDGE` string remains in src/ or .env.example (grep test).
- The 121st Qloo attempt in one run throws `budget` without calling `fetch`. The run ends with a `result` built from the gathered candidates and does not write the cache. The plan cap of 30 is enforced the same way.
- `[usage] scope=plan` is logged for live plans.
- Production with no Upstash still fails closed with 503 (existing behaviour kept).

## R17 (P1). Overall run deadline, circuit breaker, and client-disconnect abort

Problem:
- Nothing bounds the whole run below Vercel's 300s (`maxDuration` src/app/api/run/route.ts:17). The phases run one after another: the agent (120s, run-agent.ts:52), fallback (:140), brand checks (:107) and pitches (45s, :111). Each Qloo call can take 12s plus a 429 retry (client.ts:67, :92).
- When Qloo is slow, Vercel kills the function, the user sees "Research ended before a complete result arrived", and the quota spent is wasted.
- `cancel()` in src/lib/stream.ts:46 only stops enqueueing, so a closed tab keeps spending Qloo/DeepSeek calls.

Fix:
- In the run route create `const signal = AbortSignal.any([request.signal, AbortSignal.timeout(RUN_DEADLINE_MS)])` with `RUN_DEADLINE_MS = 240000`. Also abort it from the stream's `cancel()`. Pass it through `runResearch` options into the context.
- Combine it with the existing timeouts: the Qloo fetch uses `AbortSignal.any([AbortSignal.timeout(QLOO_TIMEOUT_MS), signal])`, and the agent and pitch writer use `AbortSignal.any([..., signal])`.
- Phase guards based on time left before the deadline:
  - skip fallback top-ups if less than 90s is left;
  - skip brand checks if less than 60s is left;
  - use template pitches (`pitchSource: "template"`) if less than 50s is left.
- Circuit breaker: count Qloo errors with code `timeout`/`upstream`/`network` per run. After 3, set `context.qlooDown = true`; further live Qloo calls fail fast with that code and no fetch, and the run finishes from gathered candidates. If no candidates were gathered, emit the existing `upstream` error event ("Qloo is having trouble; try again in a minute.").
- Partial results (deadline, breaker, abort) show an agent note and are never cached. After a client abort, emit nothing and write no cache. Apply the same signal and deadline to the plan route, using `PLAN_DEADLINE_MS = 120000`.

Cache impact: none.

Tests (must pass), with fake timers and fake Qloo/model:
- Slow fakes push the run past 240s. The stream ends with a `result` (partial) or a clean error before the deadline, with no cache write.
- Three consecutive fake timeouts stop further `fetch` calls (assert the call count).
- Aborting `request.signal` mid-run stops further Qloo/model calls and writes no cache.
- The phase guards pick template pitches when less than 50s is left.
- Normal fake runs are unchanged: snapshot of the event sequence, and the cache is still written.

## R18 (P1). R13 regression: ambiguous chains with a location or qualifier suffix pass as independents

Problem: R13 moved `rei`, `patagonia`, `dsw`, `sprouts` and `columbia sportswear` from the word-boundary list into `exactNames` only (src/data/national-chains.json; src/lib/merchants/chains.ts:7-14, :21-23). Before R13 these real store names were blocked; now they are kept as independents:
- "REI Co-op", "REI Denver Flagship", "REI Austin";
- "Patagonia Denver";
- "Columbia Sportswear Company", "Columbia Sportswear Employee Store";
- "Marmot Boulder";
- "DSW Designer Shoe Warehouse";
- "Sprouts Farmers Market - Highlands";
- "Gap Kids", "GapKids", "Chico's Off The Rack", "The Gap".

REI and Patagonia are brands in the Denver demo, so a chain store in results would look bad.

Fix:
- Put the unambiguous multi-word forms back in `names` (word boundary): `columbia sportswear`, `sprouts farmers market`, `dsw designer shoe warehouse`, `rei co-op`, `gap kids`, `gapkids`, `gap factory`, `chico's off the rack`.
- For `exactNames`, compare the core name: cut it at the first " - ", " | ", " (" or ",", strip a leading "the", and strip trailing qualifier tokens repeatedly. The qualifiers are: store, outlet, factory, factory store, flagship, co-op, coop, kids, company, employee store, and any city or neighbourhood word that appears in the request's city label or the known city list (src/data/presets/cities.json).
  - Keep a fixed allow-list of qualifier words. Do not strip arbitrary words, so "Rei Sushi", "Patagonia Grill", "Chico's Cafe", "Mind the Gap Cafe", "Columbia Street Bakery" and "Sprouts Juice Bar" stay independent.
  - If the function needs the city, pass it as an optional argument and default to the known-city words.

Cache impact: must be none. Add a test that none of the 19 cached demo names below is matched by `isNationalChain` or `isTeamStore`:
Bull & Bush Brewery; Death & Co Denver; Denver ChopHouse & Brewery; Denver Country Club; Enstrom Candies Arvada; Flat Track Coffee; Gregory Gym; High Ride Cycle - Sloan's Lake; JuiceLand; Knotty Tie Co.; Monkies Vintage & Thrift; Odell Brewing Sloan's Lake Brewhouse & Pizzeria; Salita; The Denver Athletic Club; The Well - 2nd St; The Yard; Tom's Dive & Swim; Tomlinson's Feed; University Co-op.
(Note: "University Co-op" must not match `rei co-op`, and "Denver ..." names must not lose their meaning through city stripping. City stripping applies only to `exactNames` cores.)

Tests (must pass):
- Every name listed under Problem is blocked.
- All R13 independent examples are still kept.
- The 19 cached names above are kept.
- Existing chains tests are unchanged.

## R19 (P1). Mobile demo flow: move the user to each next step

Problem: at 390px wide, tapping "Try Denver demo" changes nothing visible, and "Plan merchant categories" is about 4 screens down. After Plan and after Confirm, nothing scrolls either. The only `scrollIntoView` is the map-marker click (src/app/page.tsx:162). The page is about 19,000px tall and the map is at the very bottom.

Fix:
- After `selectPreset` (page.tsx:148-151), smooth-scroll to the "Plan merchant categories" button and focus it.
- After the plan succeeds (page.tsx:82), scroll to the "Choose your merchant categories" heading.
- After Confirm (`startRun`, page.tsx:101-104), scroll to "Research progress". When the `result` arrives, scroll to "Your merchant shortlist".
- Use `block: "start"`. Respect `prefers-reduced-motion` with `behavior: "auto"`, and move focus to the heading (`tabIndex={-1}`) for screen readers.
- On screens below `lg`, add a "View map" link in the shortlist header that jumps to the map card.

Cache impact: none (UI only).

Tests (must pass): component tests with mocked `scrollIntoView`. Each of the three transitions calls it once on the right element, and focus moves to the heading. Reduced-motion uses `behavior: "auto"`.

## R20 (P1). The same merchant appears twice in the shortlist

Problem: the live Austin demo lists "Tomlinson's Feed" twice (Pet supply store and Pet store, two locations). `buildShortlist` dedupes by `entityId` only (src/lib/merchants/shortlist.ts:41-58).

Fix:
- In `buildShortlist`, dedupe across all categories and branches by `normalizeName(place.name)` (src/lib/merchants/name-match.ts). Keep the higher `compareCandidates` entry, then backfill from `remaining` so the total stays at 10 when possible.
- Also apply the same pure dedupe when a `result` event is rendered on the client, so replayed cached results do not show duplicates. Add `dedupeMerchants(result)` in src/lib/merchants/, call it in page.tsx where `setResult` runs (:113), and use its output for cards, map and CSV.

Cache impact: keys unchanged. The cached Austin run will show 9 merchants instead of 10 through the client dedupe. **Devin: re-warm Austin once after deploy** if a full 10 is wanted. This needs deleting `pd:v1:run:<austin key>` and one live run, so it is Devin's call, not Codex's.

Tests (must pass):
- Two candidates with the same normalized name in different categories and branches produce one shortlist entry, the higher-scored one, with the total backfilled to 10.
- `dedupeMerchants` removes the duplicate from a fake result and keeps order.

## R21 (P1). CSV opens cleanly in Excel

Problem, from a real export of the live demo:
- No UTF-8 BOM, and member brands are joined with " · " (src/lib/csv.ts:25), so Excel shows "Â·".
- Every phone starts with `+`, so the formula guard (csv.ts:16) adds a visible apostrophe.
- `business_rating` prints float noise such as `4.300000190734863` (csv.ts:26).
- The guard does not cover a leading tab or CR.

Fix:
- Prepend `\uFEFF` to the file (csv.ts:34 or ExportButton.tsx:20, in one place only).
- Join brands with "; ".
- Format US numbers (`+1` followed by 10 digits) as national format `(NXX) NXX-XXXX` before the guard. Leave other numbers alone; the guard still prefixes them.
- Round `business_rating` and `tripadvisor_rating` to 1 decimal.
- Widen the guard to `/^[=+\-@\t\r]/`.

Cache impact: none (client-side export).

Tests (must pass):
- The output starts with a BOM.
- No "·" appears.
- A `+1` 10-digit phone becomes national format without an apostrophe.
- `4.300000190734863` becomes `4.3`.
- Cells starting with tab or CR are prefixed.
- Existing CSV tests pass after updating the expected values.

## R22 (P1). Error panel shows the real server message

Problem: the client catch in src/app/page.tsx:115-119 always adds an error event with code `"internal"`, so the trace shows "Something went wrong." (src/components/AgentTrace.tsx:28). This happens even for 503 store errors or 400 validation errors, whose real message only shows in the page alert.

Fix: carry the HTTP status and server `message` from `streamRun` (src/lib/run-client.ts:100) in a typed error. Map 503 to code `config`, 400 to `bad_request`, 429 to `quota`. Render `event.message` when present, otherwise the `ERROR_MESSAGES` fallback. Keep messages free of internal details.

Cache impact: none.

Tests (must pass): mocked `fetch` returning 503 `{error:"config", message:"..."}` and 400 shows that message in the trace panel. A network failure still shows the generic text.

## R23 (P2). Security headers

Problem: next.config.ts has no `headers()`. Live responses lack X-Content-Type-Options, Referrer-Policy, frame protection and Permissions-Policy. HSTS is already present, and HTML is served with `access-control-allow-origin: *`.

Fix: add `async headers()` for `/:path*`:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: frame-ancestors 'none'` (frame-ancestors only; no full CSP)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Do not add CORS headers; leave the platform default alone.

Cache impact: none.

Tests (must pass): a unit test that imports next.config.ts and asserts the headers. `npm run build` passes.

## R24 (P2). Bound the remaining unbounded run-request fields

Problem: `RunRequestSchema` (src/lib/types.ts:64-72) has these unbounded fields:
- `city: z.string()`
- `brands[].name: z.string()` (this reaches the LLM prompt)
- `CategoryTagSchema.label` (types.ts:28, rendered in the UI)
- items of `excludeEntityIds: z.array(z.string())`

Fix: `city` `.min(2).max(80)` (same as the plan schema); brand `name` `.min(1).max(120)`; category `label` `.min(1).max(80)`; `excludeEntityIds` items use `EntityIdSchema`. Return the existing 400 shape.

Cache impact: none. Both demo requests already satisfy these bounds. Add a test that builds both preset run requests via request-builders and asserts they still parse and produce the same `cacheKey` as before (snapshot the two hashes).

Tests (must pass): oversize values return 400 with path, and the preset snapshot test passes.

## R25 (P2). Tell users when an edit will run live research

Problem: after any change, the next click silently runs live and uses quota: preset category toggles, Signed/Not a fit statuses (`excludeEntityIds`), or a second Plan after a run. In that last case `mergePreferences` at src/app/page.tsx:107 changes the plan request. After R16 this also uses the user's per-IP allowance.

Fix: in CategoryConfirm (and next to the Plan button), when `presetId` is set but the request no longer equals the untouched preset request, show one muted line: "Changes run live research and count toward today's limit." Compute this with a pure helper in request-builders comparing against the canonical preset request. Do not change request contents.

Cache impact: none.

Tests (must pass): the helper returns false for both untouched presets and true after a category toggle, a status change, or a merged preference.

## R26 (P2). Result card polish that also applies to cached demos

Problems:
- Hours show "Mon–Sun 00:00–00:00" (src/lib/qloo/insights.ts:118+).
- Brand shares list 7–8 brands at a nearly equal 10–18% on every card (src/components/MerchantCard.tsx:60).
- REI is shown as "Recreational Equipment Inc", not the name the user typed.

Fix (render-time, so the cached demos benefit without re-warming):
- In `formatHours`, return "Open 24 hours" when every listed day is 00:00–00:00 or 00:00–24:00.
- Add a display helper that maps an existing `hoursText` of the form "Mon–Sun 00:00–00:00" to "Open 24 hours". Use it in MerchantCard and the CSV.
- Show only the top 3 brand shares on cards, with "+N more" in a `title`. The CSV keeps all of them.
- Display brand names as the user's `inputName` from the plan's `brands` (types.ts:44) when it differs only by expansion (for example REI). Do this at render time in MerchantCard, CategoryConfirm and the CSV.

Cache impact: none.

Tests (must pass): the hours helper cases, top-3 truncation, and inputName display mapping.

## R27 (P2, confirmed by Devin). Category sanity for noisy Qloo tags

Problem: in the live demos, Qloo tags put a cocktail bar ("Death & Co Denver") and a candy shop under Coffee shop, private clubs ("Denver Country Club", "The Denver Athletic Club") under Gym, and a UT campus facility ("Gregory Gym") under Gym.

Fix: in find-merchants, drop a candidate when its `primaryGenreId` or name clearly contradicts the category, using a small deny map per category: Coffee shop vs cocktail_bar/bar/candy; Gym vs country_club/university/campus. Use only signals already returned by Qloo; no new calls. Also add one README line saying categories come from Qloo place tags and obvious mismatches are filtered.

Cache impact: Devin confirmed: implement it. Also apply the same category check inside `cachedEvents` (next to the existing chain check), so a cached run whose shortlist contains a denied place is treated as a cache miss. Then the first demo click after deploy runs live research once and stores a clean cache; nobody has to delete Redis keys by hand. Use only fields already stored on the cached place. Add a test with a fake cached run containing a denied place (expect a miss) and one without (expect a replay). The PROGRESS entry must start "Devin: re-warm Denver and Austin once after deploy" (this also covers the R20 Austin re-warm). Do not clear or edit the cache yourself, and do not run the demos live.

Tests (must pass): deny-map unit tests with fake places, and an existing find-merchants snapshot updated only for the denied fakes.

## R28 (P2). Map should not trap scrolling on touch or trackpads

Problem: `MapContainer` (src/components/MerchantMap.tsx:114) uses Leaflet defaults. The map is up to 70vh, so wheel and one-finger drag pan or zoom the map instead of scrolling the page.

Fix: set `scrollWheelZoom={false}` and `dragging={!L.Browser.mobile}`. Keep the zoom buttons, and show "Use two fingers to move the map" via `touchZoom` on mobile (or a tap-to-activate overlay). Map pick (click to set a branch) must still work.

Cache impact: none.

Tests (must pass): a component test asserting the props are passed; the existing map pick tests pass.

## R29 (P2). Metadata, footer, leftovers

Problems:
- src/app/layout.tsx:7-10 has no Open Graph/Twitter metadata, so shared links show no card.
- The footer (layout.tsx:17-20) lacks the MIT license and source link.
- `public/` still has unused Next.js boilerplate SVGs (file, globe, next, vercel, window).
- The README status line (README.md:11) still says "local prototype … deployment remain".
- The preset buttons show a large empty left gap (src/components/PresetPicker.tsx:19-25).

Fix:
- Add `metadataBase: new URL("https://perk-desk.vercel.app")`, `openGraph` and `twitter` (summary_large_image) with title, description, and a static `src/app/opengraph-image.png` (1200x630, made from a screenshot of the results view with no personal data).
- Footer: add "MIT License · Source on GitHub" linking to the public repo URL.
- Delete the five unused SVGs after `rg` confirms no references.
- Update the README status to "Deployed at https://perk-desk.vercel.app; demo presets replay cached research".
- Fix the button alignment (`justify-between w-full`, left-aligned text).

Cache impact: none.

Tests (must pass): a metadata unit test (openGraph and twitter present); `npm run build`; `check:rules` and `check:privacy` pass.
