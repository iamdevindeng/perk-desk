# FIXES-R17 — R56 (remove the idle gap under the Plan button)

Base: `8c8d615`. Approved by Devin on 2026-10-26.

## Rules (same as every round)
- Follow AGENTS.md and the readability rules.
- No live Qloo or DeepSeek calls, ever. No Qloo response data in the repo.
- Do NOT push. Never use `--force` or `--no-verify`.
- Do not change presets, cache keys, request/response shapes, rate limits, Qloo call caps, or the saved profile schema.
- No new dependencies. No new folders.

---

## R56 — Render the planning status only while planning

**Why:** R55 keeps an invisible `PlanningStatus` line under "Plan merchant categories" at all times, so when idle there is a blank gap that is wider than the spacing elsewhere (seen on Devin's phone and desktop).

**Do:**
1. In `src/app/page.tsx`, render `PlanningStatus` only when `stage === "planning"` (same pattern as the old status line). When idle, nothing is rendered and no space is reserved.
2. Simplify `PlanningStatus` accordingly: remove the `invisible` / `aria-hidden={!planning}` idle branch and the idle `0s` placeholder. Keep the spinner, the teal text, `role="status"`, and the `aria-hidden` seconds span exactly as in R55.
3. A small layout shift when the line appears is acceptable.
4. Do not change the button spinner or anything else from R52–R55.

**Tests:** update `tests/unit/planning-status.test.ts` (and any page test) so that: when not planning, no planning status element is in the DOM; while planning it shows `0s` then `3s` with fake timers; the timer clears when planning ends.

---

## Finish
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:privacy` all green.
- Update `docs/PROGRESS.md` (R56).
- Commit locally (`R56: ...`). Do NOT push.
- Keep the dev server running on port 3000.
- Report the commit hash and the test count.
