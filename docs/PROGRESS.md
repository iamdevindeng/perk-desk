# Perk Desk: Progress log

Codex appends one section per task (AGENTS.md §3). Never delete earlier entries. All times UTC+8.

## Summary (filled in at T12)

| Task | Status | Commit | Notes |
|---|---|---|---|
| T1 Scaffold | – | – | |
| T2 Types + data | – | – | |
| T3 Qloo layer + cache | – | – | |
| T4 Filter / scoring | – | – | |
| T5 Tools + guards 1–2 | – | – | |
| T6 /api/plan | – | – | |
| T7 /api/run | – | – | |
| T8 UI profile | – | – | |
| T9 Confirm + trace | – | – | |
| T10 Cards, map, CSV, status | – | – | |
| T11 Eval | – | – | |
| T12 Smoke + summary | – | – | |

## Waiting for Devin

Things Codex must not do (remote actions, accounts, secrets) or could not finish. Add items as they come up.

- [ ] Push the repo to GitHub (no remote is configured on purpose).
- [ ] Create the Vercel project, set env vars (QLOO_API_KEY, DEEPSEEK_API_KEY, optional UPSTASH_*, JUDGE_BYPASS_CODE), deploy, check `maxDuration`.
- [ ] Optional: create an Upstash Redis database and add its REST URL/token.

## Decisions I made

(Interpretations of unclear spec points, with the reason. One bullet each.)

## Review guide (filled in at T12)

(Suggested reading order of files for Devin, one line each on what to look for.)

---

## Task entries

<!-- Copy this block for each task:

### T<n>: <title> — <DONE | PARTIAL | FAILED>
- Date/time (UTC+8):
- What was done:
  -
- Files touched:
  -
- How to verify:
  ```bash
  npm run lint && npm test && npm run build && npm run check:rules
  ```
- Live checks (if any; counts/names only, never response bodies or keys):
- Open issues / decisions:
- New dependencies (name, why):
- For Devin:

-->
