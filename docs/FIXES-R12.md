# FIXES-R12 — R45–R48 (small UX round)

Base: `2681635`. Approved by Devin on 2026-10-25.

**Step 0 (do this first):** R44 was reverted by mistake in `ff4851c`. Devin wants R44 back. Run `git revert --no-edit ff4851c` (a normal new commit, no history rewrite), confirm the R44 tests pass, then continue with R45.

## Rules (same as every round)
- Follow AGENTS.md and the readability rules. Small functions, plain names, a short WHY comment where a choice is not obvious.
- No live Qloo or DeepSeek calls, ever (tests use invented fixtures only). No Qloo response data in the repo.
- Do NOT push. Never use `--force` or `--no-verify`.
- Do not change presets, cache keys, request/response shapes, rate limits, Qloo call caps, or the saved profile schema.
- No new dependencies. No new folders.

---

## R45 — Sticky top bar with the Perk Desk logo (keeps R44 scroll-to-top)

**Why:** R44 makes the logo scroll to the top, but the logo scrolls away with the page, so it is never reachable. A slim sticky bar fixes that.

**Do:**
1. Move the `Perk Desk` logo button (from R44, same behavior, same aria-label) into a slim full-width bar at the top of the page: `position: sticky; top: 0`, white or near-white background with a light bottom border, height about 48px (put the height in `config.ts` as one constant and reuse it everywhere below). The H1 and intro text stay in `ProgramIntro` and scroll normally.
2. Z-index: the bar must sit above Leaflet (Leaflet panes go up to 700 and controls to 1000). Use a z-index above 1000 and put it in `config.ts` with a WHY comment.
3. Sticky map: the map `aside` is `lg:sticky lg:top-6`. Change its top offset to bar height + the same gap, so the map never slides under the bar.
4. Anchored scrolling: every element the page navigation scrolls to (and the R43 focus target) must not end up under the bar. Use one shared `scroll-margin-top` = bar height + gap (for example a CSS rule on `:target` / a shared class, or `scroll-padding-top` on `html`); remove now-wrong per-element `scroll-mt-6` only where it conflicts.
5. Mobile: same bar, same height, no extra content. It must not cover the first form field after a navigate.

**Tests:** logo button lives inside the sticky bar and still calls `scrollTo` (R44 tests stay green); bar z-index constant > 1000; map aside uses the new top offset; navigation targets get the scroll margin.

---

## R46 — Empty placeholder branch shows a short empty state

**Problem:** after a city change or Start blank, the profile holds one blank placeholder branch ("Main branch"/"Branch 1", no address, no lat/lon). Its full form under the branch search results looks like a real branch and confuses users.

**Do (display only; the profile data and schema stay exactly the same):**
1. In `BranchEditor`, when the list is exactly one branch that is blank (no address, no lat/lon, no `locationSource`), show instead of the form:
   - `No branches yet. Use Find branches above, or add one manually.`
   - a button `Add manually`. Clicking it shows the normal form for that same placeholder branch (local UI state only) and focuses its name input.
2. As soon as the branch gets any address or location, the normal form shows as today.
3. "Use selected branches" still replaces the whole list (R41), so the empty state disappears on its own.
4. The R40 hint `#branch-location-hint` and the disabled Plan button still work while the empty state is shown.

**Tests:** blank single branch → empty state, no form; `Add manually` → form shown and name input focused; branch with address or lat/lon → form shown; two branches → forms shown; Plan stays disabled with the hint.

---

## R47 — "Start with my credit union" becomes the main entry; demos become secondary

**Why:** the product is for a real credit union, so the first and most visible action should be "use my own institution". Demos stay visible (judges often try them first) but are secondary.

**Do (in `PresetPicker`, keep the same props and the R43 reset logic):**
1. Card title: `Set up your credit union`. Card description: `Find local merchants your members already love. Your profile stays in this browser.`
2. Main button: rename `Start blank` to `Start with my credit union`. Full width, solid primary style (same teal as the Plan button), placed first in the card.
   - Behavior is the R43 reset unchanged: already blank = no confirm; otherwise `window.confirm(...)`. After reset, focus and scroll to the credit union name input.
   - Update the confirm text to: `Start with your own credit union? This clears the current profile, branches, member brands and results in this browser.`
   - Remove the old helper text `Clear this browser's profile and results.` entirely (the confirm explains it).
3. Below it, a small line `Or explore a demo:` followed by the two demo buttons in a smaller outline style (keep the `Try Denver demo` / `Try Austin demo` labels and the "N branches · Ready to explore" sub-line). Demo behavior unchanged.
4. Mobile: main button full width, demo buttons stack below it.

**Tests:** card title and main button text; main button comes before the demo buttons in DOM order; confirm text updated; old helper text gone; demos still load their presets.

---

## R48 — Member brands helper text says where the data comes from

**Do:** in `TasteInput`, change the helper line `Aggregated brand names only. Enter 1–10 brands, one per line.` to:
`Aggregated brand names only, e.g. your members' top brands from card spend data. Enter 1–10 brands, one per line.`
Keep it one line on desktop if possible. No other copy changes.

**Tests:** update any test that asserts the old text.

---

## Finish
1. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:privacy` all green.
2. Update `docs/PROGRESS.md` with R45–R48.
3. Commit locally (one commit per item is fine). Do NOT push.
4. If a dev server is already running on port 3000, leave it running (it hot-reloads). Otherwise start `npm run dev` and leave it running. Never print `.env.local`.
5. Report: commit hashes and test count.
