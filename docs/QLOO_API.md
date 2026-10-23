# Qloo API: what Perk Desk uses

Verified by live calls on **2026-10-22/23** with the hackathon key. Status markers: **[verified]** = observed in real responses; **[unverified]** = from Qloo docs or assumption, not observed; code must handle it defensively.

Example values below are **fake** (made-up names, IDs `00000000-...`). Never commit real Qloo responses (hackathon rule; see AGENTS.md §4).

## 1. Basics
- Base URL: `https://hackathon.api.qloo.com` (env `QLOO_BASE_URL` may override; default in `config.ts`). **[verified]**
- Auth: header `X-Api-Key: <QLOO_API_KEY>`. Never put the key in a URL or log. **[verified]**
- Method: `GET` with query-string parameters. **[verified]**
- Rate limits on this key (response headers): `x-second-ratelimit-limit: 10`, `x-month-ratelimit-limit: 50000`, plus `-remaining` / `-reset` variants. **[verified]** Older hackathon docs said 5 rps / 10k per month; trust the headers. We pace calls (`QLOO_MIN_GAP_MS`) and cache everything 7 days.
- **Invalid or misspelled parameters are silently ignored** (no 400). **[verified]** So a typo changes results without an error: build URLs only through the typed helpers in `src/lib/qloo/*` and unit-test the built query strings.
- Errors: 401/403 bad key **[unverified status codes; assume either]**, 429 over limit **[unverified body]**. Treat any non-2xx as an error (ARCHITECTURE §11).
- Parse every response leniently with zod (`.passthrough()` not needed; just pick fields; every property optional except the IDs and names we rely on). Unknown fields are ignored.

## 2. Brand search: `GET /search`
`/search?query=<name>&types=urn:entity:brand&take=3` **[verified]**

Response:
```json
{ "results": [ {
  "name": "Fake Outdoor Co", "entity_id": "00000000-0000-4000-8000-000000000001",
  "types": ["urn:entity:brand"], "popularity": 0.97, "disambiguation": "Retailer",
  "properties": { "short_description": "...", "description": "...", "industry": ["..."], "official_site": "https://..." },
  "tags": [ { "tag_id": "urn:tag:keyword:qloo:hiking", "name": "Hiking", "type": "urn:tag:keyword:qloo" } ]
} ] }
```
- Brand tags use the key **`tag_id`** (place tags use `id`, §4). **[verified]** Normalize both to `TagRef { id, name, type }`.
- Brands carry ~80–155 tags. Types seen: `urn:tag:keyword:qloo`, `urn:tag:lifestyle:qloo`, `urn:tag:interest_adjacency:qloo`, `urn:tag:product_category:qloo`, `urn:tag:product_service:qloo`, `urn:tag:industry:qloo`, `urn:tag:consumption_context:qloo`, `urn:tag:genre:brand`, `urn:tag:wikipedia_category` (e.g. "Yoga merchandise"). **[verified]** Not every brand has every type.
- **Compliance:** brands also carry demographic/segment tag types (`target_age_group`, `target_gender`, `target_income_level`, `customer_segment`, …). **[verified]** Drop every type listed in `src/data/category-blacklist.json → brandTagTypeDenylist` by **exact** match of the tag `type` against the list (full type strings such as `urn:tag:target_age_group:qloo` **[verified]**). Also drop any tag whose type contains `age`, `gender`, `income` or `demographic` as a whole word segment (defensive, for types not yet seen). These tags must never reach the model, the UI or the cache value.
- **Ambiguity examples [verified]:**
  - `REI` → Recreational Equipment Inc (0.99), Real Madrid CF (1.0), Reiss: popularity alone picks the wrong one.
  - `Ulta Beauty` → name returned is `Ulta`. `Sierra Nevada` → Sierra Nevada Brewing Co. first. `New Belgium Brewing` → New Belgium Brewing Company.
  - `Blue Bottle Coffee` → correct result first, but a sports team in the list has higher popularity.
  - `Goldfish` → Pepperidge Farm; `Topo Chico` → popularity-0 result (treat as weak; let the agent decide).
  - Resolved cleanly: Sweetgreen, Shake Shack, Chipotle, Starbucks, Krispy Kreme, Aperol, Chewy, BarkBox, Petco, Lululemon, Peloton, Nike, Sephora, Aveda, Patagonia, Whole Foods Market, Allbirds, YETI, Tecovas.
  - Some local shops also exist as brands (e.g. a well-known Denver bookstore at popularity 0.72) → used by the chain brand check (ARCHITECTURE §6.3).
- `types` is plural here (`types=`), unlike insights (`filter.type=`). **[verified]**

## 3. Place-category search: `GET /v2/tags`
`/v2/tags?filter.query=yoga&filter.tag.types=urn:tag:category:place&take=15` **[verified]**

Response:
```json
{ "success": true, "duration": 12,
  "results": { "tags": [ { "id": "urn:tag:category:place:yoga_studio", "name": "Yoga studio", "type": "urn:tag:category:place", "popularity": 0.5, "parents": [] } ] } }
```
- Without `filter.query` the list is empty. **[verified]** Always send a non-empty query (1–3 words work best).
- Category IDs match `^urn:tag:category:place:[a-z0-9_]+$` **[verified for all observed]**.
- Many returned categories are useless for merchant perks (schools, hospitals, wholesalers, manufacturers, dealers). `category-blacklist.json → categorySlugKeywords` blocks 108 of 473 observed tags and none of the 67 usable ones.
- `src/data/category-defaults.json` lists 67 categories verified to return ≥ 6 places in Denver/Austin **city** queries, with depth: thick ≥ 15, medium 9–14, thin 6–8 places. Depth was measured with city queries, so radius queries return fewer.

## 4. Places: `GET /v2/insights`

### 4.1 Parameters **[verified unless marked]**
| Param | Value | Notes |
|---|---|---|
| `filter.type` | `urn:entity:place` | required |
| `filter.location` | `POINT(<lon> <lat>)` | WKT: **longitude first**, space-separated |
| `filter.location.radius` | meters (int) | used with `filter.location` |
| `filter.location.query` | `"Denver, CO"` or a street address | alternative to POINT; resolves to a locality (§5) |
| `filter.tags` | one category tag id | e.g. `urn:tag:category:place:coffee_shop` |
| `signal.interests.entities` | comma-separated brand entity IDs | the taste signal ("seeded" query) |
| `feature.explainability` | `true` | per-result brand contributions |
| `take` | 30 | max results |
| `filter.geocode.country_code` etc. | — | **not used** |

### 4.2 Response fields we read
```
results.entities[]:
  name, entity_id, popularity
  location { lat, lon }                                     [verified]
  disambiguation                                            [verified]
  properties.address (string), phone, website               [verified]
  properties.hours { monday: [{ opens: "T09:00:00", closes: "T17:00:00", closed: false }], ... }  [verified]
  properties.is_closed (boolean)                            [verified]
  properties.business_rating (number, e.g. 4.6)             [verified]
  properties.price_level (int or null)                      [verified]
  properties.short_description, description, unique_selling_points (strings)  [verified]
  properties.primary_genre { id: "urn:tag:genre:place:<slug>", name }          [verified]
  properties.neighborhood (string or null), keywords (array)                   [verified]
  external.google_place[0].place_id                         [verified]
  external.tripadvisor[0] { rating, rating_count }          [verified; often absent]
  query.distance (meters from the filter point)             [verified]
  query.affinity (0..1)                                     [verified; seeded queries only]
  query.explainability["signal.interests.entities"]: [{ entity_id, score }]   [verified; scores sum ~1]
query.explainability (top level): effect_on_top3_recs / top5 / top10 / all   [verified; not used]
query.localities.filter[0] { name, location { lat, lon } }  [verified when filter.location.query is used]
```
Ignore everything else (images, akas, references, customer demographic descriptions, etc.). Do **not** keep `customer_demographics_description` (compliance).

Hours → `hoursText`: compact one-line string, e.g. `"Mon–Fri 10:00–17:00 · Sat 10:00–16:00 · Sun closed"`; if parsing fails, omit.

### 4.3 Seeded vs. baseline: the key quirk **[verified]**
In thin categories a seeded query (with `signal.interests.entities`) returns **fewer** places than the same query without a signal. Observed (Denver, sporting goods): 5 km radius → 2 seeded vs 5 baseline; 10 km → 10 vs 24. Coffee shops at 5 km: 30 vs 30. Baseline results have no `affinity` and no explainability.

Therefore `findMerchants` always makes **both** calls per branch × category and takes the union:
- `rankLift = (baselineRank ?? baselineLength + 1) − seededRank` (positive = taste moves it up).
- Places only in the baseline: `tasteSignal = false`, shown as "category match (no taste signal)", ranked after taste-signaled ones.

### 4.4 Noise **[verified]**
`filter.tags` matches places whose tags include the category, not only the main category. E.g. a sporting-goods query also returns stadium team stores, supermarkets (`grocery_store` was the most frequent noise genre, 188 times), department stores, home-improvement stores, auto-repair shops. Drop places whose `primary_genre` slug is in `noisePrimaryGenres`. National chains appear often; see `national-chains.json`.

### 4.5 Effective radius **[verified approximately]**
`query.distance` stayed within the radius in our probes, but we still re-check distance locally (haversine) and allow 10% slack (ARCHITECTURE §6.2).

## 5. Location resolution (geocoding substitute)
`/v2/insights?filter.type=urn:entity:place&filter.location.query=<address or "City, ST">&take=1` **[verified]** returns `query.localities.filter[0].location { lat, lon }`. For a city this is the city locality. For a street address it is the **neighborhood/district locality containing it (approximate, often 0.5–3 km off)**. So:
- Preset branches have hand-entered coordinates (`locationSource: "preset"`).
- Typed addresses get the approximate locality point (`"qloo_locality"`) and a UI note; the user can pick the exact point on the map (`"map"`).
- If `localities` is missing or empty → unresolved (warning). **[unverified: behaviour for nonsense input]**

## 6. Explainability → brand shares
`query.explainability["signal.interests.entities"]` lists `{ entity_id, score }` for the seed brands that contributed. Map `entity_id` → brand name from the RunRequest; convert scores to integer percentages that sum to 100 (largest remainder). Brands not listed contributed ~0; omit them.

## 7. Not used (and why)
- `/v2/insights?filter.type=urn:tag` with brand signals: returned nothing useful for brand seeds. **[verified]**
- `signal.demographics.*`, audiences, heatmaps: compliance (PRD §6).
- `api.qloo.com` / staging hosts: not covered by the hackathon key.
- `/v2/insights` `filter.type=urn:entity:brand` (similar brands): not needed.

## 8. Slim shapes we keep (and cache)
Map raw JSON to these right after parsing (in `src/lib/qloo/*`); only slim shapes are cached or passed on:
- `BrandCandidate { entityId, name, popularity, shortDescription, tags: TagRef[] (allowed only) }` (`search.ts`)
- `CategoryTag { tagId, label }` (`tags.ts`)
- `Place` (ARCHITECTURE §3) (`insights.ts`), plus `{ places: Place[], localityPoint?: { lat, lon } }` for location queries.

## 9. Verification log
Codex: when you call the live API in T12/T11 and observe something different from this file, append a dated bullet here (what you expected, what you saw) and in PROGRESS. Do not paste response bodies.

- 2026-10-23 (docs author): all [verified] items above observed with the hackathon key.
