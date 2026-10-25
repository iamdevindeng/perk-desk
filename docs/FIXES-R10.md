# FIXES-R10 — R41: Find branches by institution name

Base: `07d2d8c` (R40). One commit for R41 (split into R41a server / R41b UI if cleaner).
Rules: follow AGENTS.md. **No live Qloo/DeepSeek calls** (tests use invented fixtures only; no real Qloo response data in the repo).
**Do not push.** Never `--force` / `--no-verify`. Demo presets, demo cache keys and existing request shapes for `/api/plan` and `/api/run` stay unchanged.

## Goal
A credit union types its name, clicks **Find branches**, and gets its real branch locations from Qloo (exact coordinates + street address), picks up to 5, and they fill the Branch list and appear on the map.
The user must always be able to tell *what* was searched and *why* nothing matched (wrong name vs. not listed in Qloo).

## Verified Qloo behaviour (probed 2026-10-25, raw output kept off-repo)
- `GET /search?query=<name>&types=urn:entity:place&take=50&filter.location=<lat>,<lon>` returns places. `filter.location` must be `lat,lon` (comma, lat first). `POINT(...)` is rejected with 400.
- Each result has `entity_id`, `name`, `location {lat, lon}`, `properties.address`, `properties.primary_genre.id`, `properties.is_closed` — same shape `slimPlace` already parses (verify `slimPlace` tolerates missing `external`/`query`; if not, add `.catch` defaults rather than a second parser).
- Branches have `primary_genre.id` = `urn:tag:genre:place:credit_union`, `...:federal_credit_union` or `...:bank`. Noise has other genres: `atm`, `stadium`, `gym`, `mortgage_lender`, `financial_institution` (offices), restaurants, venues.
- Search is fuzzy and does NOT map full names to acronyms: "University Federal Credit Union" near Austin returns other credit unions but no "UFCU"; "UFCU" returns UFCU branches. Some branch names carry suffixes ("Westerra Credit Union Green Mountain Branch", "... - Drive Thru Only").

## R41 server — `POST /api/branches`
Request (zod): `{ name: string 1..100 trimmed, city: string 2..80 }`.
Response schema `BranchLookupResponseSchema` (in `types.ts`):
```
{ status: "found" | "other_names" | "none" | "city_not_found" | "limited",
  query: string, cityLabel: string, message?: string,
  places: { entityId, name, address, lat, lon, distanceMeters }[]   // max 20, sorted by distance asc
  suggestions: { name, locations }[] }                             // max 8, sorted by locations desc then name
```
Steps:
1. Rate limit: new scope `"branches"` in `rate-limit.ts` with `BRANCH_LOOKUP_LIMIT_PER_IP = 30`, `BRANCH_LOOKUP_LIMIT_GLOBAL = 300` (config.ts). Same fail-closed production behaviour as plan/run. Over limit -> `status: "limited"`, `message: LIVE_LIMIT_MESSAGE`, HTTP 200.
2. City center: if `city` equals a `cities.json` label use its lat/lon; otherwise `resolveLocality(city)`; null -> `status: "city_not_found"`.
3. Wrap Qloo work in `withRunUsage(ip, ..., "branches")` with `BRANCH_LOOKUP_QLOO_CALL_CAP = 2` (extend the scope union). Usage log line must not contain the searched name.
4. New `searchPlacesByName(query, lat, lon, options)` in `src/lib/qloo/search.ts` using `cachedQlooCall("/search", { query, types: "urn:entity:place", take: 50, "filter.location": "<lat>,<lon>" }, ...)`.
5. Keep only *branch-like* places: `primaryGenreId` in `BRANCH_LOOKUP_GENRES = [credit_union, federal_credit_union, bank]` (full urns in config), not `isClosed`, name not matching `/\b(atm|corporate|administrative|offices?|headquarters|no branch|mortgage)\b/i`, and `haversineMeters(center, place) <= BRANCH_MAX_CITY_DISTANCE_M` (50 km, same as R36).
6. Match: `normalizeName(place.name)` equals `normalizeName(query)` or starts with it followed by a space or ` - `. Dedupe by `entityId`.
7. `found` if any match (return up to 20 nearest). Else `other_names` if any branch-like non-matches: group by base name (text before ` - `, then strip trailing "branch"), count locations, top 8. Else `none`.
8. Errors: reuse the plan route's Qloo error mapping (extract a small shared helper instead of copying if it stays simple). No body logging.

## R41 UI — `ProfileForm` (below "Credit union name", above branches)
- `Input#branch-search-name`, label "Search Qloo by name". Defaults to the institution name and follows it until the user edits this field.
- Button "Find branches": disabled when search name or city is blank, while loading, or when the form is disabled. While loading: "Searching…".
- Result panel (`aria-live="polite"`), always starts with: `Searched Qloo for "<query>" within 50 km of <cityLabel>.`
  - **found**: "Found N locations. Select up to 5." Checklist rows: name, address, distance in km (1 decimal). Nearest `min(5, N)` pre-checked; once 5 are checked the others are disabled. Button "Use selected branches" replaces `profile.branches` with `{ id: crypto.randomUUID(), name: "Branch <i>", address, lat, lon, radiusMeters: DEFAULT_RADIUS_M, locationSource: "qloo_place" }` in distance order, then shows "Added N branches from Qloo. You can edit or remove them." and closes the list.
  - **other_names**: "No exact match. Qloo lists these credit unions and banks near <cityLabel>. Is yours under another name?" Each suggestion is a button "<name> (N locations)" that sets the search name and searches again. Then the tip: "Tip: Qloo often lists the short name members use, such as an acronym."
  - **none**: "Qloo has no matching credit unions or banks near <cityLabel>. Your institution may not be listed yet, so add branches manually."
  - **city_not_found**: "We couldn't locate that city. Check the City, ST spelling."
  - **limited** / errors: show the message.
- Changing the city (R36/R39) or applying a preset clears the panel. The panel state is not saved to the profile or localStorage.
- `BranchSchema.locationSource` gains `"qloo_place"`. BranchEditor label "Qloo listed location"; MerchantMap popup "Branch location". Not approximate, so no amber hint.
- `buildPlanRequest` / `buildRunRequest` keep sending branches exactly as today (lat/lon present, so the server uses them directly).

## Tests (invented names and coordinates only)
- search: params use `lat,lon` and `types=urn:entity:place`; empty query makes no call.
- route: validation 400s; limit scope `branches`; known city uses `cities.json` center without a locality call; other city uses `resolveLocality`; null -> `city_not_found`.
- filtering: ATM/stadium/office/mortgage/closed/>50 km dropped; suffix names ("X Credit Union - Drive Thru Only", "X Credit Union Green Mountain Branch") match; "X Credit Union ATM" doesn't; dedupe by entityId; max 20 sorted by distance.
- statuses: found / other_names (grouping, counts, top 8) / none.
- UI: search name follows institution name until edited; header line shows the query and city; pre-check 5 nearest and disable a 6th; "Use selected branches" writes `qloo_place` branches with lat/lon; suggestion button reruns with that name; panel clears on city change; R40 lets planning proceed with these branches.
- request builders: plan/run request shapes unchanged for presets (existing cache-key tests still pass).

## Finish
1. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:privacy` all green. Update `docs/PROGRESS.md`.
2. Commit locally, **do not push**.
3. Start the local dev server with `npm run dev` (uses the existing `.env.local`; do not print it). Leave it running and report the local URL, commit hashes and test count. Do not make any live requests yourself; Devin tests in the browser.
