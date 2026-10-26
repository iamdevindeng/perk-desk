# FIXES-R15 — R51 (example credit union in the name placeholder)

Base: `5c6e6c6`. Approved by Devin on 2026-10-26.

## Rules (same as every round)
- Follow AGENTS.md and the readability rules.
- No live Qloo or DeepSeek calls, ever. No Qloo response data in the repo.
- Do NOT push. Never use `--force` or `--no-verify`.
- Do not change presets, cache keys, request/response shapes, rate limits, Qloo call caps, or the saved profile schema.
- No new dependencies. No new folders.

---

## R51 — Show a real example in the institution name field

**Why:** a judge who clicks "Start with my credit union" may not know what to type, and a made-up name finds no branches. The default city is Denver, CO, and "Bellco Credit Union" is a real Denver credit union that Find branches returns in live testing.

**Do:**
1. In `ProfileForm`, change the institution name input placeholder from `Your credit union` to exactly:
   `e.g. Bellco Credit Union`
2. Placeholder only: do NOT prefill the value, do not change the label, validation, autocomplete, or Find branches behavior.

**Tests:** add or update one unit test asserting the institution name input has the new placeholder and an empty value after Start with my credit union.

---

## Finish
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:privacy` all green.
- Update `docs/PROGRESS.md` (R51).
- Commit locally (`R51: ...`). Do NOT push.
- Keep the dev server running on port 3000.
- Report the commit hash and the test count.
