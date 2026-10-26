# FIXES-R16 — R52–R55 (mobile phone test fixes)

Base: `03c21a3`. Approved by Devin on 2026-10-26.

## Rules (same as every round)
- Follow AGENTS.md and the readability rules.
- No live Qloo or DeepSeek calls, ever. No Qloo response data in the repo.
- Do NOT push. Never use `--force` or `--no-verify`.
- Do not change presets, `cities.json`, cache keys, request/response shapes, rate limits, Qloo call caps, or the saved profile schema.
- No new dependencies. No new folders.
- UI only. Desktop layout (`lg` and up) must look and behave exactly as today, except R55, which applies to both.
- Mobile means below the Tailwind `lg` breakpoint (1024px), the same breakpoint the page already uses.
- One commit per item (`R52: ...`, `R53: ...`, ...).

---

## R52 — Institution name example follows the selected city

**Why:** the grey example in the Credit union name field is always `e.g. Bellco Credit Union`, a Denver credit union, even after the user switches the city to Austin.

**Do:**
1. In `ProfileForm`, choose the institution name placeholder from the current city:
   - `Denver, CO` → `e.g. Bellco Credit Union`
   - `Austin, TX` → `e.g. University Federal Credit Union`
   - any other value (Other city, empty, unknown) → `e.g. Your credit union's full name`
2. Keep the mapping as one small named constant keyed by the city label, next to the component. Do not add fields to `cities.json`.
3. Placeholder only. Do not prefill the value; do not change the label, validation, autocomplete, or Find branches behavior.

**Tests:** update the R51 test and add cases: Denver shows Bellco, switching to Austin shows University Federal Credit Union, Other city shows the generic text, and the value stays empty in every case.

---

## R53 — Pick on map on mobile scrolls to the map and back

**Why:** on a phone the map is at the bottom of the page. Tapping "Pick on map" gives no movement, so the user has to scroll down, tap, then scroll back up to find the branch.

**Do:**
1. When "Pick on map" turns picking ON and the viewport is below `lg` (use `window.matchMedia("(min-width: 1024px)")`), scroll to `merchant-map-card` with the existing `scrollToElement` helper. On desktop do not scroll.
2. While picking, show a short banner directly above the map (inside the map `aside`, all screen sizes), with `role="status"`:
   `Tap the map to set the location for {branch name or "Branch N"}.` plus a `Cancel` button that turns picking off. On desktop use the word `Click` instead of `Tap`.
3. Give each branch fieldset a stable id (for example `branch-{id}`). After a location is picked on mobile, scroll back to that branch fieldset. After Cancel on mobile, also scroll back to it. On desktop do not scroll.
4. Keep the existing in-form status text next to the button, but change it to `Tap the map to set this branch's location.` on mobile and keep `Click the branch location on the map.` on desktop.
5. Respect `prefers-reduced-motion` (the helper already does).

**Tests:** unit tests with `matchMedia` mocked: mobile Pick scrolls to the map; desktop Pick does not scroll; picking a point on mobile scrolls back to the branch fieldset; the banner shows the branch name and its Cancel button turns picking off.

---

## R54 — "View on map" on each merchant card (mobile only)

**Why:** in the phone test the only map link was the small "View map" in the shortlist header, which Devin did not notice.

**Do:**
1. In `MerchantCard`, add a `View on map` text button, visible only below `lg` (`lg:hidden`), placed with the card's other links.
2. Tapping it selects that merchant (same as tapping its map pin, so the pin is highlighted) and scrolls to `merchant-map-card` with `scrollToElement`.
3. Keep the existing header "View map" link.
4. Accessible name: `View {merchant name} on map`.

**Tests:** the button renders with the accessible name; clicking it calls the select handler with the merchant id and scrolls to the map card.

---

## R55 — Clear waiting indicator while planning (mobile and desktop)

**Why:** after "Plan merchant categories" the only feedback is the button text "Planning…" and a small grey line that is easy to miss. A first plan for a new credit union can take several seconds and looks frozen.

**Do:**
1. While `stage === "planning"`, show a small spinning icon inside the button before `Planning…` (CSS `animate-spin` on an inline SVG or bordered span; no new dependency). Hide the icon from screen readers.
2. Change the status line under the button to:
   `Resolving brands and finding supported categories… {N}s`
   where N is whole seconds since planning started, updated once per second. Put the seconds in an `aria-hidden` span so screen readers do not announce every tick.
3. Make the status line easy to see: `text-sm text-teal-800` with the same spinner style or a subtle pulse; no layout jump when it appears.
4. Stop and reset the timer when planning ends, fails, or is cancelled. No timer on replays that finish instantly beyond showing `0s` briefly.
5. Do not change the research run trace (AgentTrace); it already shows progress.

**Tests:** with fake timers, the status shows `0s` then `3s` after three seconds; the timer clears when the stage leaves planning; the spinner is `aria-hidden`.

---

## Finish
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:privacy` all green.
- Update `docs/PROGRESS.md` (R52–R55).
- Commit locally, one commit per item. Do NOT push.
- Keep the dev server running on port 3000.
- Report the commit hashes and the test count.
