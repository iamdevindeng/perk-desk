# FIXES-R18 — R57–R58 (Other city map centering; tap-to-fill example credit union)

Base: after R56. Approved by Devin on 2026-10-26.

## Rules (same as every round)
- Follow AGENTS.md and the readability rules.
- No live Qloo or DeepSeek calls, ever. No Qloo response data in the repo.
- Do NOT push. Never use `--force` or `--no-verify`.
- Do not change presets, cache keys, request/response shapes, rate limits, Qloo call caps, or the saved profile schema.
- No new dependencies. No new folders.

---

## R57 — Bundled US city centers for Other city; whole-US view instead of Denver

**Why:** `src/data/presets/cities.json` has only Denver, CO and Austin, TX. When Devin picked Other city and typed `Portland, OR`, the map stayed on Denver until Find branches or a plan returned, so Pick on map started 1,000+ miles away. A small table of US city centers from public-domain Census data lets the map jump to the typed city at once, with no Qloo call. When the city is empty or not in the table, the map must show the whole US, not Denver.

**Data file (already committed in the FIXES-R18 doc commit, do NOT edit its data):** `src/data/us-city-centers.json`
- Shape: `{"_comment": "...", "cities": [["Portland, OR", 45.537, -122.65], ...]}`, about 826 rows `[label, lat, lon]`, sorted by label, about 32 KB.
- Source: U.S. Census Bureau 2024 Gazetteer place file (internal-point coordinates) joined with Vintage 2024 population estimates (`sub-est2024.csv`); incorporated places with population >= 50,000, plus common short names (Nashville, Louisville, Honolulu, Boise, Athens, Augusta, Macon, Lexington, Ventura).
- It already passes `check:privacy` and matches the `src/data/[a-z-]+.json` pattern in `check-rules`.

**Do:**
1. **Schema.** In `src/lib/types.ts`, next to `CityListSchema`, add `UsCityCentersSchema = z.object({ cities: z.array(z.tuple([z.string(), z.number(), z.number()])) })` and its inferred type. Parsing strips `_comment`, same as the other data files.
2. **Constants.** In `src/lib/config.ts`, next to `MAP_DEFAULT_ZOOM`, add named constants with a one-line WHY comment:
   - `MAP_US_CENTER = { lat: 39.5, lon: -98.35 }` (center of the contiguous US)
   - `MAP_US_ZOOM = 4`
3. **Lookup helper.** In `src/lib/data.ts`, import the JSON statically, parse it once at module load (like `CITY_LIST`), and build a `Map` keyed by the normalized label. Export `findUsCityCenter(city: string): { label: string; lat: number; lon: number; zoom: number } | undefined` that returns `zoom: MAP_DEFAULT_ZOOM`. Normalization (one small named function, used for both table labels and input):
   - trim, collapse runs of whitespace to one space, turn `\s*,\s*` into `", "`, lowercase.
   - So `Portland, OR`, `portland, or`, `  Portland ,  OR `, and `Portland,OR` all match. Empty or whitespace-only input returns `undefined`.
4. **Center resolution.** Move the center logic out of `page.tsx` into one small named function (e.g. `resolveMapCenter` in `src/lib/data.ts` or another existing `src/lib` file; `page.tsx` is close to the 200-line limit). Order:
   1. preset city (`getCities()` label equals `profile.city`), unchanged;
   2. bundled table match via `findUsCityCenter(profile.city)`;
   3. `plan?.city`;
   4. if the city is Other city (not a preset label, including empty): the whole-US view `{ ...MAP_US_CENTER, zoom: MAP_US_ZOOM }`;
   5. otherwise the first preset (unchanged safety fallback).
   Once branches have locations, the map's existing fit-to-branches / candidates behavior still wins. Check how `MerchantMap` does that today and keep it as is; do not add a new fit behavior.
5. **Hint above the map.** Show one short line above the map, using the same style as the existing pick-on-map hint from R53. Show it only when ALL of these hold: City is Other city, no table match, no `plan?.city`, no branch has `lat/lon`, and no Find branches candidates are on the map.
   - Empty typed city: `Enter your city to move the map.`
   - Typed but not found: `Map can’t find {city} yet. Use Find branches or enter an address to move it.` (`{city}` = the trimmed typed value; use the typographic apostrophe exactly as written.)
   - Use `role="status"`. Keep Pick on map enabled. If the R53 pick-on-map hint is showing, show both lines (pick hint first) or merge them into one container; do not hide the pick hint.
6. **Do NOT:** add these cities to the City dropdown; change `cities.json` (including its `_comment`); change the saved profile schema, API request/response shapes, the `/api/plan` Qloo city lookup, Qloo calls, cache keys, or rate limits.
7. **Attribution.** In `docs/ARCHITECTURE.md`: add `us-city-centers.json` to the `src/data/` tree with the note `(generated from U.S. Census Bureau public-domain data; map centering for typed Other city only)`, and add one line wherever the map center is described: "Typed Other city: centered from `src/data/us-city-centers.json` (Census 2024 Gazetteer + Vintage 2024 population estimates, places >= 50,000); empty or unknown city shows the whole US." The generator script is NOT added to the repo.
8. **README:** it does not describe the Other city map behavior, so leave it unchanged.

**Tests** (unit, no network; extend `tests/unit/data.test.ts` and an existing page test with the page harness, or add one small new test file under `tests/unit/`):
- `findUsCityCenter`: `Portland, OR` returns about lat 45.537, lon -122.65, zoom `MAP_DEFAULT_ZOOM`; `portland, or`, `  Portland ,  OR `, and `Portland,OR` give the same result; `Nashville, TN`, `Washington, DC`, `Honolulu, HI` are found; `Xyzville, ZZ` and `""` return `undefined`. The table parses with `UsCityCentersSchema`, has more than 700 rows, and has unique labels.
- Center resolution: Denver, CO and Austin, TX presets give exactly the `cities.json` centers (unchanged). Other city `Portland, OR` with no branches gives the Portland center. Other city empty gives the whole-US view. Other city `Xyzville, ZZ` gives the whole-US view. A `plan.city` is used when the typed city is not in the table.
- Page: Other city empty shows `Enter your city to move the map.`; `Xyzville, ZZ` shows the not-found hint with the city name; `Portland, OR` shows no hint; a preset city shows no hint; once a branch has a location, the hint is gone; Pick on map is still enabled while the hint shows.
- The City dropdown still lists only `Denver, CO`, `Austin, TX`, and `Other city`.

## R58 — Tap-to-fill example credit union under the name field

**Why:** the grey placeholder (`e.g. Bellco Credit Union`) cannot be selected, copied, or tapped, so a judge who wants to try it has to retype the name by hand, which is slow on a phone.

**Do:**
1. In `ProfileForm`, directly under the Credit union name input, show one small line when the city is a preset that has an example:
   `Not sure? Try ` followed by a text button with the example name (`Bellco Credit Union` for `Denver, CO`, `University Federal Credit Union` for `Austin, TX`).
   Reuse the R52 city-to-example mapping so names live in one place (store the bare names and build the `e.g. ...` placeholder from them).
2. Clicking or tapping the name fills the institution name input with exactly that name (same path as typing, via `onChange`). It does NOT trigger Find branches or any request.
3. Do not show the line for Other city (empty, typed, or unknown). Hide it when the input already equals the example name (case-insensitive, trimmed).
4. The field still starts empty: no prefill, and keep the R52 placeholders unchanged.
5. Style: `text-xs text-slate-500`, with the name as a teal underlined button (`type="button"`, accessible name `Use Bellco Credit Union as the credit union name`, and the same for UFCU). The line is normal text, so it can be selected and copied too. Respect the form's `disabled` state.

**Tests:** Denver shows the Bellco line and clicking it sets the value to `Bellco Credit Union`; Austin shows UFCU; Other city shows no line; the line hides once the value equals the example; the button is disabled when the form is disabled; no fetch is called.

---

## Finish
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:privacy` all green (also `npm run check:rules`).
- Update `docs/PROGRESS.md` (R57, R58).
- Stage explicit paths only, including `src/data/us-city-centers.json` if Devin has not committed it yet. Commit locally, one commit per item (`R57: ...`, `R58: ...`). Do NOT push.
- Keep the dev server running on port 3000.
- Report the commit hashes and the test count.
