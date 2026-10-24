# Perk Desk — Review fixes R1 (from Devin's review, 2026-10-24)

> Codex: read this file after AGENTS.md and run R1–R9 in order.

Follow AGENTS.md as before: do tasks in order, one commit per task (author "Devin Deng" <99384331+iamdevindeng@users.noreply.github.com>), after each task run `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`, log each task in docs/PROGRESS.md. 3 failed attempts on a task → record it in PROGRESS and move on. No remote actions (no push, no deploy). Do not weaken scripts/check-rules.mjs or tests. Keep the readability rules.

## P0
R1. Fallback brand resolution must not pick unrelated entities (Denver demo: "REI" currently resolves to "Real Madrid CF").
- File: src/lib/fallback/fallback-plan.ts, chooseFallbackBrands (line ~19 sorts candidates by popularity only).
- Fix: rank candidates by name match first, popularity second: exact normalized-name match > candidate name starts with the input (or input starts with candidate name + space) > input is an acronym of the candidate's words (e.g. "REI" → "Recreational Equipment Inc.") > others. Only among equal match level use popularity. If no candidate has any name match, keep the brand but mark it unresolved/ambiguous so the confirm UI asks the user (do not silently pick a random entity).
- Also: in src/data/presets/denver-demo.json and austin-demo.json, check every brand in the list resolves to the intended company in fallback mode (run the smoke script with PD_AGENT_DISABLED=1). If any still resolves wrong, add a brandOverrides entry to that preset only if the preset schema supports it; otherwise rely on the ranking fix.
- Tests: unit tests for the ranking with synthetic candidates (REI vs "Real Madrid CF" vs "REI Co-op"; exact match beats popularity; no-match → unresolved). Fixtures stay hand-written, no real Qloo data.

## P1
R2. Make check:rules green again by keeping Devin's local Chinese translations out of git (do NOT delete the files from disk):
- Add `docs/translate/` to .gitignore, then `git rm -r --cached docs/translate` so the files stay locally but are no longer tracked.
- check-rules.mjs already scans `git ls-files --cached --others --exclude-standard`, so ignored files are skipped automatically; do not modify the checker. Do NOT add docs/translate to the architecture tree.

R3. Restore `.env.example` exactly as in commit cfe3521 (`git show cfe3521:.env.example > .env.example`). It is the committed template (names only, no values). Do NOT touch Devin's local `.env.local`. Keep the README step `cp .env.example .env.local` and the `!.env.example` line in .gitignore as they are.

R4. Category evidence: dedupe and cap.
- Files: src/lib/fallback/category-map.ts (~line 65 builds evidence), src/components/CategoryConfirm.tsx (~line 46 renders all evidence).
- Fix: dedupe evidence by (brandEntityId, brandTagId) per category; sort by strength (agent/rule evidence before default; more specific tag first); store at most 5 per category; render the top 3 with a "+N more" toggle that expands the rest.
- Tests: dedupe + cap unit tests.

## P2 (small; do after P0/P1)
R5. /api/run must re-check categories server-side: in src/app/api/run/route.ts validateRequest, reject (400 with a clear message) any category that is blacklisted or not a valid place-category tag, reusing the existing guard helpers in src/lib/agent/guards.ts / src/lib/qloo/tags.ts. Add a route-level unit test.

R6. Evidence that comes from a saved preference or a quick-segment default must not borrow an unrelated brand tag (fallback-plan.ts ~line 195 and category-map.ts ~line 92 use brand.tags[0]). Make the evidence type explicit (e.g. kind: "preference" | "default" | "rule" | "agent"); the UI shows "Saved preference" / "Default suggestion" without the "brand → tag →" arrow for those kinds. Layer-2 guard still applies to agent evidence.

R7. Add "Rack Attack" and "Denver Broncos Stadium Store" (team/stadium stores in general: add a rule that excludes names containing "Stadium Store" / "Team Store") to src/data/national-chains.json or the existing exclusion logic. Add a test.

R8. src/lib/store/rate-limit.ts: compare the judge code with crypto.timingSafeEqual (handle different lengths safely). Keep using the first x-forwarded-for value (fine on Vercel) but add a comment why.

R9. docs/PROGRESS.md: fix the summary table so commit hashes match `git log` (history was rewritten before push).

## Done when
All checks green, PROGRESS updated with an "R1 review fixes" section (status per R1–R9), Denver and Austin presets both run end to end with PD_AGENT_DISABLED=1 and show correct brand names.
