# Perk Desk: Product Requirements

> Source: approved spec v6 (2026-10-23). Hackathon: Qloo LLM Hackathon (Devpost). Goal: a competition-grade, end-to-end usable product, not a toy.

## 1. Positioning

- **One-liner:** "Cardlytics tells you where members spend; Perk Desk tells you which unsigned local merchants to sign first."
- **User:** the part-time marketing specialist who runs the member-perks / local-offers program at a community credit union with 3–10 branches. Usually one person.
- **Pain:** members want offers at local shops, but card-linked cashback platforms mostly offer national brands. The specialist can contact only ~10 merchants per quarter and has no data on whom to approach first.
- **Output:** every quarter, a call list of ~10 local merchants near the branches, each with evidence and a 3-sentence recruiting pitch, exportable to CSV.
- **Framing (honest):** member taste decides **which kinds of merchants** to look at; Qloo ranks merchants **within** a category and explains why. Affinity differences are small (0.01–0.19), so cards lead with explanations, scores are secondary.
- **Why taste, not novelty:** PYMNTS (Jan 2025): offers in regular spending categories are rated positive by 72.8% of cardholders vs. 43.4% for offers that introduce a new merchant. Perk Desk recruits local merchants that match what members already love. (README material; no code impact.)

## 2. User flow

1. **Program profile** (one-time; stored in the browser's `localStorage`; no sign-up)
   - Credit union name.
   - City: pick a preset city (Denver, CO / Austin, TX) or type any US city as `City, ST`.
   - Branches (1–5): name + street address, **or** pick a point on the map. Each branch has a trade-area radius (default 6 km, 1–20 km). Addresses without coordinates are resolved by `/api/plan` (approximate; shown on the map; the user can re-pick on the map).
   - Already-signed merchants: **paste box**, one shop name per line, free format.
   - Business members (optional extra X2, built only if time allows): paste box, same format; matching merchants get an "Already a business member" badge.
2. **Member taste:** paste the 3–10 brands members spend on most (aggregated, e.g. from card-spend reports), one per line, **or** click a quick segment (Dining, Coffee & desserts, Bars & craft beer, Pets, Fitness, Beauty & hair). A quick segment fills the paste box with its 3 seed brands (visible, editable).
3. **Plan + confirm categories** (`/api/plan`): the agent resolves brands and picks place categories, then **stops**. The page shows:
   - recognized brands (with a dropdown to switch to another Qloo candidate when ambiguous, e.g. "REI" → Recreational Equipment Inc vs Real Madrid CF vs Reiss);
   - category chips, each with its evidence, e.g. `REI → "Outdoor" → Sporting goods store`; chips can be removed; categories can be added from a picker;
   - a **Confirm** button. Nothing is searched until the user confirms.
   - Edits (removed / added categories) are saved into the profile as **institution preferences** and sent with the next plan request.
4. **Run** (`/api/run`): the page shows each agent step live (trace), then results: ~10 merchants grouped by branch, as evidence cards + map.
5. **Follow-up:** each merchant can be marked `To contact` / `Contacted` / `Signed` / `Not a fit`. On the next run, `Signed` and `Not a fit` merchants are excluded automatically. Export the list as CSV; copy each pitch with one click.

**Presets:** two fictional institutions (Denver CU with 3 branches; Austin CU with 2 branches) fill every field with one click. Judges never need to upload or type anything. Cached preset requests are unlimited. Presets without cached results skip the per-IP limit but still use the global budget and require a shared rate-limit store in production (see ARCHITECTURE §7).

## 3. Agent steps (what the user sees in the trace)

| Step | Who | What |
|---|---|---|
| ① resolveBrands | code + DeepSeek | Qloo brand search, top 3 candidates per name; exact/prefix match wins; DeepSeek resolves ambiguity |
| ② pickCategories | DeepSeek | searches Qloo's place-category tags and picks 2–6 categories, each justified by a real brand tag |
| ②b confirm | user | edit chips, confirm |
| ③ findMerchants | code | per branch × category: Qloo places in the branch radius, once with member brands as taste signal, once without (baseline) |
| ④ filter & score | code | drop malls/supermarkets/closed/signed/not-a-fit/national chains; flag multi-location brands; rank lift, distance, rating |
| ⑤ data check | DeepSeek | if a category has < 6 independents, try one adjacent category once; otherwise say "few local shops in this category" |
| ⑥ rankAndPitch | code + DeepSeek | top merchants per branch (~10 total); DeepSeek writes a 3-sentence pitch using only card fields |

## 4. Evidence card (one per merchant)

- Name, main category (label), address, phone, website, opening hours, Google Maps link (from `google_place.place_id`).
- Nearest branch and distance (km, one decimal).
- Which member brands drive the match, with Qloo's explainability share (e.g. "REI 53% · Lululemon 47%").
- Rank lift vs. the city baseline (e.g. "+4 places vs. baseline"), or "category match (no taste signal)" when the merchant only appears in the baseline.
- Ratings: Qloo `business_rating` and Tripadvisor rating (+ review count).
- Short description / unique selling point (from Qloo properties).
- Badges: `Multi-location brand`; `Already a business member` (optional extra X2).
- Pitch (3 sentences) with a Copy button.
- Follow-up status selector.

A toggle "Independents only" hides multi-location brands.

**Map:** Leaflet + OpenStreetMap tiles. Selecting a city pans the map; each branch is drawn with its radius circle; merchants are circle markers. Hovering/clicking a card highlights its marker, and clicking a marker highlights and scrolls to its card (two-way).

**CSV export columns:** `branch, distance_km, name, category, address, phone, website, google_maps_url, member_brands, rank_lift, business_rating, tripadvisor_rating, multi_location, business_member, status, pitch`.

## 5. Category guard (four layers)

1. **Only real candidates:** a picked category must come from this run's `searchCategories` results, match the tag-ID pattern, and pass the blacklist (schools, hospitals, wholesale, manufacturers, dealers, …).
2. **Evidence required:** every category carries `{ brand, brandTag, category, reason }`, and `brandTag` must actually be one of that brand's Qloo tags from step ①. Checked in code; categories without valid evidence are dropped.
3. **User confirmation** (step ②b). Judges see the reasoning.
4. **Institution preference memory:** removed/added categories are saved in the profile (`localStorage`) and passed to DeepSeek as preferences next time. Per institution only; no cross-user learning.

Plus: temperature 0; an eval set of ~15 brand lists with expected categories measures hit rate during development (T11).

## 6. Trust and compliance

- Uses **aggregated brand/interest data only**. No age, gender, income, ZIP, or any member-level data; no member targeting. Qloo brand tags about target age/gender/income are filtered out and never shown or sent to the model.
- Footer on every page and in README: **"Merchant-selection tool. Not used for any credit decision or consumer ad targeting."**
- Thin data is stated plainly ("Few independent shops in this category near your branches"). Pitches may quote only fields shown on the card; numbers not on the card are not allowed (checked in code).

## 7. Reliability and judge access

- If DeepSeek fails or times out: deterministic fallback (rule-based brand-tag → category mapping, quick-segment defaults, template pitches). Results still appear, labeled "Fallback mode".
- Daily live budgets: 30 plans per IP and 200 plans globally; 10 research runs per IP and 60 runs globally. A judge access code (env `JUDGE_BYPASS_CODE`) skips only the per-IP limit; the global budget still applies. Cached requests are unlimited. Over the limit, cached results are shown when available; otherwise show a friendly limit message.
- Vercel production (`VERCEL_ENV=production`) requires both Upstash environment values for live requests. Missing shared-store configuration or a rate-limit service failure/timeout returns HTTP 503 before any live research. Cached results, including demo presets, remain available when readable. Local development and preview deployments keep the in-memory fallback and its warning.
- Each live research run writes one structured server usage line with a short SHA-256 IP hash and Qloo/LLM call counts. Logs contain no raw IP or API keys.
- Target: plan ≤ 20 s, run 30–60 s.

## 8. Out of scope

Email sending or drafts (Qloo has no merchant e-mail addresses), MCP, accounts/login, server-side storage of profiles, demographics, Qloo heatmaps/audiences, multi-city per profile.

## 9. Cut order (if behind)

1. CSV upload of lists (paste boxes stay) — optional extra already.
2. Institution preference memory (guard layer 4).
3. Business-member matching.
4. Follow-up status.
5. Branch-radius queries (fallback: one city query per category + local distance computation).

**Never cut:** agent loop, guard layers 1–3 incl. the confirm step, evidence cards, map, CSV export, fallback, presets.
