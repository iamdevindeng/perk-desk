# FIXES-R19 — R59 (branch lookup uses the bundled city table before Qloo)

Base: `1a35e79`. Approved by Devin on 2026-10-26.

## Rules (same as every round)
- Follow AGENTS.md and the readability rules.
- No live Qloo or DeepSeek calls, ever. No Qloo response data in the repo.
- Do NOT push. Never use `--force` or `--no-verify`.
- Do not change presets, `cities.json`, `us-city-centers.json`, request/response shapes, rate limits, Qloo call caps, or the saved profile schema.
- No new dependencies. No new folders.

---

## R59 — Resolve the branch-lookup center from the bundled table first

**Why:** For a typed Other city, `lookupBranches` currently makes two Qloo calls: `resolveLocality(city)` to get a center, then `searchPlacesByName` around it. R57 already bundles 826 US city centers (`findUsCityCenter` in `src/lib/data.ts`), and the map already uses them. Using the same table on the server saves one Qloo call for most cities, removes one failure point, and makes the branch search center match the map center.

**Do:** in `src/lib/branch-lookup.ts`, change `resolveCenter(city)` to this order:
1. Preset city (`getCities()` exact label match): unchanged.
2. `findUsCityCenter(city)` from `src/lib/data.ts` (same normalization the map uses). If found, return `{ label, lat, lon }` using the table's label (e.g. `"Portland, OR"`) and do **not** call Qloo.
3. Otherwise `resolveLocality(city)` exactly as today (small towns, unusual spellings).

Keep everything after `resolveCenter` unchanged: `searchPlacesByName`, `BRANCH_MAX_CITY_DISTANCE_M` (50 km), genre/closed/non-branch filters, matching, suggestions, statuses. The `cityLabel` in the response comes from the chosen center as today. The place-search cache key changes for table cities only because the center coordinates differ; that is expected and allowed in this round.

Add a one-line comment noting the table point is a Census internal point, which can be a few km from downtown (Denver's is ~10 km), well inside the 50 km filter.

**Tests** (offline, mocked Qloo) in `tests/unit/branch-lookup.test.ts`:
- Table city (e.g. `"portland, or"` with odd spacing/case): `resolveLocality` is not called; `searchPlacesByName` receives the table lat/lon; `cityLabel` is `"Portland, OR"`.
- Preset city: still uses preset coordinates, no locality call.
- City not in the table (e.g. a made-up small town): falls back to `resolveLocality`; `null` still returns `city_not_found`.
- Existing branch-lookup and branches-route tests stay green.

Docs: one line in `docs/ARCHITECTURE.md` (branch lookup center order) and `docs/QLOO_API.md` if it describes the locality step for branch lookup. README unchanged.

---

## Finish
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:rules`, `npm run check:privacy` all green.
- Update `docs/PROGRESS.md` (R59).
- Commit locally (`R59: ...`). Do NOT push.
- Keep the dev server running on port 3000.
- Report the commit hash and the test count.
