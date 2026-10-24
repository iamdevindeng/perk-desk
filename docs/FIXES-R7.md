# FIXES-R7: plan call cap, doc cleanup, category and chain precision, small UI fixes

Base: local main at 28b75c9 (R16–R29, not pushed yet). Do items in order.

Rules (same as R6):
- One commit per item, message "R<n>: <summary>". Full checks after each (lint, typecheck, test, check:rules, check:privacy --all). Log each item in docs/PROGRESS.md with the staged-file list.
- No `--no-verify`, no `git add -A`, never weaken the privacy or rules checks.
- **Zero live provider calls**: no smoke, eval, or dev server with real Qloo/DeepSeek keys. Use fakes and `PD_AGENT_DISABLED=1`.
- No deploy, no remote actions, **do not push**. Devin pushes R6 + R7 together.
- **Final code round.** Implement exactly what each item says, nothing extra. If something is unclear, do the narrowest version and note it in PROGRESS instead of expanding scope. After R35, add a short "Known limitations" list to README (category tags come from Qloo and may still be imperfect; live research takes a few minutes; daily live limits) instead of new fixes.
- **Demo cache rule** (unchanged from R6): do not change the request shape or defaults, preset data, `canonicalJson`/`cacheKey`, or the `pd:v1` prefix.

## R30 (P1). Raise the per-plan Qloo call cap

Devin's decision. In `src/lib/config.ts` change only `PLAN_QLOO_CALL_CAP` from 30 to 70 (the Denver demo plan alone used 23, so 30 could cut off plans with more brands or branches). All daily limits stay as they are (runs 10 per IP / 150 global, plans 30 per IP / 300 global), and `RUN_QLOO_CALL_CAP` stays 120.

Update every place that states this number (README, docs/ARCHITECTURE.md, tests). Tests read the constant instead of repeating the literal where practical.

## R31 (P1). Remove stale judge-code and old-limit text from docs

These docs will be public.
- docs/PRD.md: line 31 (presets skipping the per-IP limit) and section 7 "Reliability and judge access" (line 78–81: `JUDGE_BYPASS_CODE`, 60/200 limits). Rewrite to the current behavior: cached demos are unlimited and served before any limit; live research uses the same daily limits for everyone (runs 10 per IP / 150 global, plans 30 per IP / 300 global); no access code exists. Rename the section "Reliability and public limits". Remove "Judges never need to upload or type anything" only if it is no longer true; otherwise keep it.
- docs/TASKS.md is the historical build plan. Do not rewrite its tasks. Add one note at the top: "Historical build plan. The judge access code and preset per-IP skip described below were removed in FIXES-R6 R16; current limits are in docs/ARCHITECTURE.md."
- Grep test from R16 stays green; extend it so `JUDGE_BYPASS_CODE` may appear only in docs/TASKS.md and docs/FIXES-*.md.

## R32 (P2). Category sanity: genre families only, then freeze

Why: R27's per-category deny lists plus name keywords are whack-a-mole. They miss cases (Austin "The Yard": Gym category, brewery genre) and over-match names ("Tea Bar", "Café & Bar", "University Hills Fitness"). Qloo already returns a structured `primaryGenreId` (e.g. `urn:tag:genre:place:restaurant:cocktail_bar`, `...:brewery`, `...:country_club`, `...:athletic_club`, `...:candy_store`), and every R27 rejection is visible there. Decide from that field only.

Rewrite `src/lib/merchants/category-sanity.ts`:
- Take the last segment of `primaryGenreId` (e.g. `cocktail_bar`). **No name keyword matching any more.** If the place has no `primaryGenreId`, keep it (only the existing `knownNames` list can still reject it; keep that list as is, it covers "Gregory Gym").
- One table of genre families, each with the categories where it is allowed:
  - **Drinking places** (`bar`, `cocktail_bar`, `pub`, `tavern`, `brewery`, `brewpub`, `wine_bar`, `winery`, `nightclub`, `lounge`): allowed only in drink categories (`bar`, `bar_grill`, `beer_garden`, `brewery`, `cocktail_bar`, `wine_bar`, `winery`, `wine_store`) and restaurant categories (`restaurant`, any `*_restaurant`, `food_court`). Rejected everywhere else (coffee, cafe, tea, bakery, dessert, gym, spa, salons, retail, pets, ...).
  - **Private and social clubs** (`country_club`, `athletic_club`, `golf_club`, `social_club`, `private_club`): rejected in every category.
  - **Education** (`university`, `college`, `campus`, `school`): rejected in every category.
  - **Candy** (`candy_store`, `confectionery`, `chocolate_shop`): allowed only in `dessert_shop`, `dessert_restaurant`, `ice_cream_shop`, `donut_shop`, `bakery`, `gift_shop`, `gift_basket_store`. Rejected elsewhere.
- Everything not in a family is kept. Keep the function signature and its use in `cachedEvents` unchanged.
- **Freeze**: add a comment saying the table is intentionally small; later stray mismatches are documented in the README, not patched one by one. The README line from R27 stays.

Tests (fakes only):
- Rejected: cocktail_bar in coffee_shop; candy_store in coffee_shop; country_club in gym; athletic_club in gym; brewery in gym ("The Yard"); university in gym.
- Kept: cocktail_bar in cocktail_bar; brewery in brewery and in american_restaurant ("Denver ChopHouse & Brewery"); candy_store in dessert_shop; "Tea Bar" and "Café & Bar" with genre `cafe` in coffee_shop; "University Hills Fitness" with genre `gym` in gym; any place with no genre (except knownNames).
- Existing cached-run miss/replay tests still pass.

Cache impact: Denver and Austin already miss after R27, so no extra cost. The R27 PROGRESS line "Devin: re-warm Denver and Austin once after deploy" still covers it.

## R33 (P2). State codes must not count as city words in chain matching

File: `src/lib/merchants/chains.ts`, `chainQualifiers`. City labels like "Denver, CO" currently add "co" and "tx" as removable qualifiers, so "Rei Co" and "Columbia Co" become chains. Only real city-name words may be qualifiers: drop two-letter tokens (US state codes) from `cityWords`. "co op" / "coop" in `RETAIL_QUALIFIERS` stay.

Tests: "Rei Co" and "Columbia Co" are independent; "REI Co-op", "REI Austin", "Patagonia Denver", "Marmot Boulder" are still chains; the 19 cached names stay non-chain.

## R34 (P2). Mobile map hint wording

`src/components/MerchantMap.tsx:115`: dragging is off on mobile, so "Use two fingers to move the map" is wrong. Change to "Pinch to zoom. Use the list below to browse merchants." (or shorter if it wraps badly at 375px). Update any test or snapshot that asserts the text.

## R35 (P2). "Open 24 hours" only when every day is 24 hours

`src/lib/merchant-display.ts:12` and `src/lib/qloo/insights.ts:136` show "Open 24 hours" when only some days are listed. Show it only when all 7 days are present and each is 00:00–00:00 or 00:00–24:00; otherwise show the normal hours text. Tests for both: 7 full days → "Open 24 hours"; "Mon–Fri 00:00–00:00" only → normal text.

## Not in R7

- OG image: Devin replaces `public/` OG image with a real demo screenshot after the re-warm (manual, later).
- Deleting `JUDGE_BYPASS_CODE` from Vercel env: Devin, after deploy.
