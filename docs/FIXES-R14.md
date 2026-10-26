# FIXES-R14 — R50 (label the demos as fictional)

Base: `411c2e5`. Approved by Devin on 2026-10-26.

## Rules (same as every round)
- Follow AGENTS.md and the readability rules.
- No live Qloo or DeepSeek calls, ever. No Qloo response data in the repo.
- Do NOT push. Never use `--force` or `--no-verify`.
- Do not change presets (names, branches, brands, ids), cache keys, request/response shapes, rate limits, Qloo call caps, or the saved profile schema.
- No new dependencies. No new folders.

---

## R50 — Say on screen that the demo credit unions are fictional

**Why:** judges click the demos without reading docs. The Denver demo name ("Columbine Peaks Community Credit Union") is close to a real Denver credit union (Columbine FCU). The UI must make clear the demo institutions are fictional (the merchants are real Qloo places).

**Do:**
1. In `PresetPicker`, change the line `Or explore a demo:` to exactly:
   `Or explore a demo with a fictional credit union:`
2. Nothing else changes: same buttons, same order, same behavior, preset JSON untouched.

**Tests:** update the existing PresetPicker / R47 test to expect the new text exactly; keep the "main button comes first in the DOM" assertion.

---

## Finish
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:privacy` all green.
- Update `docs/PROGRESS.md` (R50).
- Commit locally (`R50: ...`). Do NOT push.
- Keep the dev server running on port 3000.
- Report the commit hash and the test count.
