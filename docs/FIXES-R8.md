# FIXES-R8 — small P1 round (from live testing, 2026-10-25)

Scope: only R36–R38 below. These came from Devin's live test of the deployed app and affect what judges see.

## Rules for this round

- Follow AGENTS.md (readability rules, privacy and security hooks).
- Zero live Qloo or DeepSeek calls in tests.
- Do NOT push. Commit locally only; Devin decides when to push.
- One commit per item (R36, R37, R38). Run the full test suite, lint and typecheck before each commit.
- Touch nothing outside these items. Demo cache keys and preset data must stay unchanged.
- Never use `--force` or `--no-verify`.

## R36 — Branches belong to the selected city

Problem: changing City keeps the previous city's branches, so research silently runs around branches in another city.

1. Client (`src/components/ProfileForm.tsx`, `CityField`)
   - When the user changes the City `<select>` (Denver, Austin, or Other city), reset `profile.branches` to ONE blank branch:
     `{ id: crypto.randomUUID(), name: "Branch 1", address: "", radiusMeters: DEFAULT_RADIUS_M }`.
   - Only the `<select>` change resets. Typing in the "Other city (City, ST)" input must NOT reset branches.
   - Keep every other profile field (institution name, signed and business-member lists, merchantStatus).
   - After a reset, show a status line under the City field (`role="status"`):
     "City changed, so branches were reset. Add your branches in <city label>." For Other city use "the new city".
     Hide it once the user edits any branch or picks a preset.
   - Preset buttons (`selectPreset` in `src/app/page.tsx`) keep working exactly as now.

2. Server (`src/lib/agent/plan-agent.ts`, `resolveLocations`)
   - Add `BRANCH_MAX_CITY_DISTANCE_M = 50000` to `src/lib/config.ts`.
   - After the city point is resolved and each branch is located, drop any branch farther than that from the city point, using `haversineMeters` from `src/lib/merchants/distance.ts`.
   - Push a warning: "Branch <name> is more than 50 km from <city>; pick its location on the map."
   - If the city point could not be resolved, skip this check.
   - Existing behavior when no branches remain stays the same.

Tests:
- The select change resets branches.
- Typing a city in the Other-city input does not reset branches.
- The status line shows after a reset and hides after a branch edit or a preset pick.
- Planning drops a far branch with the warning and keeps near branches.
- The check is skipped when the city point is missing.
- Every Denver and Austin preset branch passes the check.

## R37 — Every branch marker is clickable

Problem (`src/components/MerchantMap.tsx`): each branch renders its trade-area `Circle` and then its `CircleMarker`. A later branch's Circle covers an earlier branch's marker and swallows clicks, so the LoDo popup never opens in the Denver demo.

Fix:
- Render ALL branch Circles first, then ALL branch CircleMarkers, then the merchant markers. Split `BranchLocation` into a trade-area part and a marker part.
- Make the trade-area Circles non-interactive (`interactive={false}`).
- Map-pick clicks on the map must still work.

Test: the rendering order, and that the circles are non-interactive.

## R38 — Address placeholder after a map pick

In `src/components/BranchEditor.tsx`, when `branch.locationSource === "map"` and `branch.address` is empty, the Street address input placeholder becomes "Location set on map. Address optional." Otherwise keep "Street address, city, state". No reverse geocoding, no new API.

Test: the placeholder switches correctly.

## Report back

Commit hashes, test count, and anything you could not do. Wait for review before any push.
