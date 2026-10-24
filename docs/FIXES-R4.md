# Perk Desk — Fix R11c + R12: sample CSVs and pre-commit privacy/security guard (2026-10-24)

> Codex: read this file after AGENTS.md. Do it after R11 (docs/FIXES-R3.md). One commit per item, run `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules` after each, log in docs/PROGRESS.md. No deploy, no remote resource actions. Push only when Devin says so.

## R11c. Downloadable sample CSVs (the upload format is our own, judges won't know it)
- Add three hand-written, fictional files under `public/samples/`: `brands-sample.csv` (header `brand`, ~8 well-known consumer brands), `signed-merchants-sample.csv` (header `merchant`, ~5 fictional local shop names), `business-members-sample.csv` (header `name`, ~5 fictional business names). Include one quoted name containing a comma to show quoting. No real Qloo data, no real people.
- Next to each upload input (ProfileForm, TasteInput) add a small "Download sample" link (`<a href="/samples/..." download>`).
- Make the importer also accept a header named `business name` or `merchant name` (case-insensitive), and ignore extra columns as today.
- Unit test: each sample file parses to the expected names via the existing import function.
- Update docs/ARCHITECTURE.md §2 tree for `public/samples/` so check:rules stays green.

## R12. Privacy and security checks that run automatically before every commit and push

R12a. New script `scripts/check-privacy.mjs` + npm script `check:privacy`. It scans **staged files only** (`git diff --cached --name-only --diff-filter=ACMR`) and fails (exit 1, print file:line and the rule name, never the matched secret value) on:
1. Any value of QLOO_API_KEY, DEEPSEEK_API_KEY, UPSTASH_REDIS_REST_TOKEN, JUDGE_BYPASS_CODE read from `.env.local` (if present) or process env — exact-string compare, never printed.
2. Common secret formats: `sk-[A-Za-z0-9]{20,}`, `ghp_`, `github_pat_`, `AKIA[0-9A-Z]{16}`, `-----BEGIN .*PRIVATE KEY-----`, `xox[bpas]-`, Upstash-looking tokens (long base64 next to `UPSTASH`/`token`), `Bearer [A-Za-z0-9._-]{20,}`.
3. Absolute local paths: macOS/Linux home-directory paths (matching `/(Users|home)/<user>/`), `C:\\Users\\`.
4. Personal data: email addresses except `99384331+iamdevindeng@users.noreply.github.com` and obvious placeholders (`example.com`, `testing@devpost.com`); phone-number patterns; IPv4 addresses except 127.0.0.1 / 0.0.0.0 / documentation ranges (192.0.2.x, 198.51.100.x, 203.0.113.x).
5. Forbidden files staged: any `.env*` except `.env.example`; `*.log`, `*.har`, `*.pem`, `*.key`, `*.p12`, `*.zip`, `*.tar*`, screenshots/recordings (`*.png|jpg|jpeg|gif|mov|mp4|webm`) outside `public/`; anything under `.next/`, `node_modules/`, `coverage/`, `docs/translate/`.
6. Likely Qloo response data: any staged `.json` larger than 50 KB, or any file containing Qloo response markers (`"entity_id"` together with `"results"`/`"popularity"`), except the hand-written allowlist already permitted by check-rules (src/data/*, tests/eval/cases.json, tests/fixtures with fake UUIDs).
- `.env.example` must contain only empty values (`KEY=` lines and comments).
- Unit tests for each rule with synthetic strings (build test secrets at runtime, e.g. `"sk-" + "a".repeat(30)`, so the test file itself doesn't trip the scanner).

R12b. Git hooks via devDependency `simple-git-hooks` (installed through `"prepare": "simple-git-hooks"`):
- The `prepare` step must never break installs where there is no `.git` or hooks don't apply (Vercel builds, CI): skip hook installation when `process.env.VERCEL` or `process.env.CI` is set or `.git` is missing (e.g. a tiny `scripts/install-hooks.mjs` that checks this, then runs simple-git-hooks). Verify `VERCEL=1 npm ci && npm run build` succeeds.
- pre-commit: `npm run check:privacy` + author check: fail unless `git config user.name` is `Devin Deng` and `git config user.email` is `99384331+iamdevindeng@users.noreply.github.com`.
- pre-push: `npm run lint && npm run typecheck && npm test && npm run check:rules` and a full-tree privacy scan (`node scripts/check-privacy.mjs --all`, scanning all tracked files).
- `npm run check:rules` also calls the privacy scan in `--all` mode so it is part of every task verification.

R12c. AGENTS.md hard rules (add to the safety section):
- Never use `--no-verify`, never disable, edit or weaken the hooks, check-privacy.mjs or check-rules.mjs unless a task explicitly says so.
- Never `git add -A` / `git add .`. Stage files by explicit path. Before each commit run `git diff --cached --stat` and paste that list into the PROGRESS entry.
- If check:privacy fails, remove the offending content (never whitelist it yourself); record what was blocked in PROGRESS without the value.
- Update the existing commit-loop step in AGENTS.md §2 (currently `git add -A && git commit ...`) to match.

Done when: all checks green, hooks installed after `npm install`, a deliberately staged fake secret is blocked (demonstrate in a unit test, not with a real commit), PROGRESS has "R11c" and "R12" entries.
