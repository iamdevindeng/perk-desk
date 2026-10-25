# FIXES-R11 — R42–R44 (small UX round after R41)

Base: `c425f60` (R41). Approved by Devin on 2026-10-25.

## Rules (same as every round)
- Follow AGENTS.md and the readability rules. Small functions, plain names, a short WHY comment where a choice is not obvious.
- No live Qloo or DeepSeek calls, ever (tests use invented fixtures only). No Qloo response data in the repo.
- Do NOT push. Never use `--force` or `--no-verify`.
- Do not change presets, cache keys, the plan/run/branches request or response shapes, rate limits, or Qloo call caps.
- No new dependencies. No new folders.

---

## R42 — Checked branch candidates appear on the map right away

**Problem:** after "Find branches", the found locations only show in the checklist. The map changes only after "Use selected branches", so the user can't see where the candidates are while choosing.

**Do:**
1. `BranchLookup` reports its current preview to the page through a new optional prop `onPreviewChange(places: BranchLookupResponse["places"])`.
   - Preview = the places that are **checked** while the panel shows a `found` result and nothing has been applied yet.
   - Send `[]` when: a new search starts, the result is not `found`, "Use selected branches" is clicked, the panel errors, or the component unmounts (city change, preset, Start blank all remount it).
   - Checking/unchecking updates the preview immediately.
2. `page.tsx` keeps `branchCandidates` in state (never saved to the profile or localStorage) and passes it to `MerchantMap` as a new optional prop `candidates`. Clear it in `selectPreset`, in Start blank (R43), and whenever the profile city changes.
3. `MerchantMap` draws each candidate so it is clearly different from a real branch:
   - a dashed trade-area circle with radius `DEFAULT_RADIUS_M` (outline only, no fill or very light fill),
   - a hollow marker (white fill, teal or amber outline),
   - popup: place name, address, and the text `Candidate, not added yet`.
   - Draw candidates below real branch markers so real branches stay clickable on top.
   - Legend: add `Candidate` only while there are candidates.
   - Header count stays based on real branches only.
4. Fit bounds: when the candidate set changes and is non-empty, fit the map to the candidates (same padding / max zoom as results). Reuse the existing signature check so hovering or re-rendering does not refit. When candidates go back to empty, do not jump the map.
5. Under the checklist, add one short line: `Checked locations are previewed on the map.` (On mobile the map is below the form, so this tells the user where to look.)

**Tests:** preview contains only checked places; uncheck removes it; "Use selected branches" sends `[]`; a new search / non-found status / unmount sends `[]`; map renders candidate markers with the candidate popup text and the legend entry; real branch count is unchanged by candidates; candidates are never written to the saved profile.

---

## R43 — "Start blank" button

**Problem:** once a demo or any data is loaded, there is no way back to an empty page except clearing browser storage by hand. Judges who don't want the demo need a clear way to start fresh.

**Do:**
1. In `PresetPicker`, below the two demo buttons, add a full-width secondary button `Start blank` with a small line under the card description or beside it: `Clear this browser's profile and results.` Disabled when the page is busy or not ready (same as demo buttons).
2. On click:
   - If the page is already blank (profile equals `emptyProfile()` ignoring branch ids, and the member brands text is empty, and there are no plan/results), do the reset without asking.
   - Otherwise ask with `window.confirm("Start blank? This clears your profile, branches, member brands and results in this browser.")`. Cancel = change nothing.
3. Reset does all of this:
   - `updateProfile(emptyProfile())` (this also clears `branchesByCity` and `merchantStatus`, and saves the blank profile).
   - `setBrandsText("")`, `setPresetId(undefined)`, `planning.clear()`, `research.clear()`, `setStage("edit")`, `setPickingBranchId(undefined)`, `setSelectedMerchantId(undefined)`, `setIndependentsOnly(false)`, clear `branchCandidates`.
   - Remount `ProfileForm`, `BranchLookup` and `TasteInput` (bump a version used as their `key`) so their internal notices, upload state and lookup panel are cleared.
   - Move focus to the credit union name input and scroll it into view (use the existing page navigation helper if it fits).
4. Do not add other storage keys. Do not use `localStorage.clear()`; only overwrite the profile key through `saveProfile`.

**Tests:** confirm cancelled = nothing changes; confirm accepted = blank profile saved, brands text empty, results/plan cleared, lookup panel gone, map candidates gone; already-blank page resets without calling `confirm`; button disabled while busy.

---

## R44 — Logo scrolls back to the top

**Do:**
1. In `ProgramIntro`, make the `Perk Desk` eyebrow text a `<button type="button">` that looks the same as now (plus a visible focus ring and pointer cursor), with `aria-label="Perk Desk, back to top"`.
2. Click = `window.scrollTo({ top: 0, behavior })`, where `behavior` is `"auto"` if the user prefers reduced motion, otherwise `"smooth"`.
3. It must not navigate, reload, or change any data (a reload would lose the member brands text and results).
4. Add `"use client"` to the file.

**Tests:** clicking calls `scrollTo` with top 0; reduced motion uses `"auto"`; profile and brands text are unchanged after the click.

---

## Finish
1. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:privacy` all green.
2. Update `docs/PROGRESS.md` with R42–R44.
3. Commit locally (one commit per item is fine). Do NOT push.
4. If a dev server is already running on port 3000, leave it running (it hot-reloads). Otherwise start `npm run dev` and leave it running. Never print `.env.local`.
5. Report: local URL, commit hashes, test count.
