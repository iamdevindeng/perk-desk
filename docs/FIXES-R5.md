# FIXES-R5: exact-name chains, hook install, sample names

> Codex: read this file after AGENTS.md. Same rules as FIXES-R1 to R4: one commit per item, run `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules` after each, log in docs/PROGRESS.md with the staged-file list. Never use `--no-verify` or `git add -A`, never weaken the privacy checks. No deploy, no remote resource actions. Push only when Devin says so.

## R13 (P1). Exact-name matching for ambiguous national chains

Problem: the Austin smoke output (docs/PROGRESS.md around line 688) still ends with "Chico's", a national chain. "Gap" was removed from the chain list to avoid matching "Mind the Gap Cafe", so real Gap stores now pass too. Chico's, Columbia and Marmot were left out for the same reason.

- Add a second, explicit list of chains that must match by **full normalized name only** (the whole place name equals the entry, after lowercasing, trimming, removing punctuation and a trailing "store"/"outlet"/"factory store"). Keep the existing substring/prefix list for unambiguous names.
- Put in the exact-name list at least: `gap`, `gap factory`, `chico's`, `columbia`, `columbia sportswear`, `marmot`, `rei`, `dsw`, `patagonia`, `sprouts`, `sprouts farmers market`. Move any of these out of the substring list if they are there.
- Tests (must pass):
  - Blocked as chains: "Gap", "Gap Factory", "Chico's", "Columbia Sportswear", "Marmot", "REI", "DSW", "Patagonia", "Sprouts Farmers Market".
  - Kept as independents: "Mind the Gap Cafe", "Chico's Cafe", "Columbia Street Bakery", "Rei Sushi", "Patagonia Grill", "Sprouts Juice Bar".
- Re-run the Austin and Denver smoke checks and confirm zero chains in both. Update the recorded smoke output in PROGRESS.md.

## R14 (P2). Hooks must not install on Vercel or CI

Problem: `install-hooks.mjs` skips when `CI` or `VERCEL` is set or there is no `.git`, but `simple-git-hooks` runs its own install step during `npm ci` and installs the hooks anyway.

- Remove the `simple-git-hooks` dependency and its config. Have `scripts/install-hooks.mjs` write `.git/hooks/pre-commit` and `.git/hooks/pre-push` itself (executable, each calling the existing node scripts), still run from the `prepare` script.
- Keep the skip conditions: `CI`, `VERCEL`, or no `.git` directory. Print one short line when skipping.
- Test: in a temp git repo, run the installer with `CI=1` and with `VERCEL=1` and assert no hook files are created; run it with neither and assert both hooks exist and are executable.
- Pre-commit and pre-push must still run exactly the same checks as now.

## R15 (P2). Plausible sample names

- In `public/samples/*.csv`, replace every name that starts with "Fake" with a plausible, clearly invented name (e.g. "Juniper Lane Coffee", "Copperline Cycles"). Brands in `brands-sample.csv` stay real well-known consumer brands.
- Keep one quoted name with a comma. No real local business names, no addresses, phones or emails.
- Update the sample tests.
