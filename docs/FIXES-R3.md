# Perk Desk — Fix R11: chains in Austin demo + local path cleanup (2026-10-24)

> Codex: read this file after AGENTS.md. Same rules as FIXES-R1/R2: one commit per sub-item, run `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules` after each, log in docs/PROGRESS.md. No deploy, no remote resource actions. Push only when Devin says so.

R11a. Austin preset shows national chains (seen in fallback-mode smoke run): "Urban Outfitters" (twice), "Madewell", "Rainbow Shops", and "Fleet Feet" (national franchise). Judges will see this.
- Add these to src/data/national-chains.json.
- While there, add other common US national apparel/footwear/outdoor/pet/fitness chains that could appear in our categories and are missing (e.g. Anthropologie, Free People, J.Crew, Gap, Old Navy, Banana Republic, H&M, Zara, Uniqlo, Lululemon, Athleta, Foot Locker, Fleet Feet, Running Warehouse, Patagonia, The North Face, Columbia, Marmot, Petco, PetSmart, Pet Supplies Plus, Orangetheory, F45, Planet Fitness, CorePower Yoga, Pure Barre, Club Pilates). Only add names whose normalized form cannot collide with a typical independent shop name; keep whole-word matching.
- Do NOT turn on the "independents only" filter by default and do NOT drop local multi-location merchants (spec: local multi-store shops keep the "Multi-location" badge).
- Extend scripts/smoke.ts (both presets) to fail if any returned merchant matches isNationalChain or isTeamStore, so this can't regress. Add unit tests for the new names (including a non-collision test, e.g. "Gap" must not match "Mind the Gap Cafe"? — if whole-word matching would make that match, leave "Gap" out and note it in PROGRESS).
- Re-run smoke for Denver and Austin in fallback mode and record the returned merchant names in PROGRESS.

R11b. Remove local machine paths from the repo before it goes public: docs/PROGRESS.md line ~459 contains an absolute macOS home-directory path (a local screenshot path). Replace any absolute user home-directory path in tracked files with a neutral description (e.g. "local screenshot, not committed"). Add a check to scripts/check-rules.mjs that fails if any tracked text file contains absolute macOS or Linux home-directory paths (the root-level Users or home directory) (allowlist none). Do not rewrite git history.

Done when: all checks green, both presets return zero chain/team-store merchants, `rg "/(Users|home)/" -g '!node_modules'` finds nothing, PROGRESS has an "R11" entry.
