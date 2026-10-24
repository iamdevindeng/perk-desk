# AGENTS.md: rules for Codex working on Perk Desk

You are running **unattended overnight**. Nobody will answer questions until the morning. Follow these rules exactly; when something is unclear, make the smallest reasonable choice that is consistent with the docs, write it down in `docs/PROGRESS.md` under "Decisions I made", and keep going.

The owner is Devin, an experienced Java backend developer who is new to TypeScript and React. He will review every file in the morning. **Readable code is a hard requirement, not a nice-to-have** (see §5).

## 1. Read order (before T1, once)

1. `AGENTS.md` (this file), in full.
2. `docs/PRD.md`: what we build and why.
3. `docs/ARCHITECTURE.md`: directory tree, data shapes, endpoints, agent design. **Source of truth for names, shapes and file locations.**
4. `docs/QLOO_API.md`: the Qloo endpoints, parameters and response fields we use (verified 2026-10-23).
5. `docs/TASKS.md`: T1..T12, then optional extras.

Re-read the task section and the doc sections it links to before starting each task.

## 2. Execution loop (strict)

Do **T1, T2, ... T12 in order**. For each task:

1. Read the task in `docs/TASKS.md` and every section it links to.
2. Implement only that task (plus fixes to earlier tasks' code that this task needs; note them).
3. Run the verification:
   ```bash
   npm run lint && npm test && npm run build && npm run check:rules
   ```
   plus the task-specific checks listed in the task. (`check:rules` exists from T1 on; before it exists, skip it.)
4. If verification passes: stage task files by explicit path, run `git diff --cached --stat`, and paste that list into the PROGRESS entry (§3). Stage `docs/PROGRESS.md` explicitly, review the final staged diff/stat, then commit **once**:
   ```bash
   git add -- <explicit task file paths> docs/PROGRESS.md
   git diff --cached --stat
   git commit -m "T<n>: <short title>"
   ```
5. If verification fails: fix and re-run. **After the 3rd failed attempt on the same task**: stop working on it, record the failure in PROGRESS (status `FAILED`, the exact failing command and the last ~20 lines of its output, what you tried), commit what you have with message `T<n>: WIP (verification failing, see PROGRESS)`, and move on to the next task. Never stall. Never loop on the same error.
6. Later tasks may depend on a failed one. Do what you can; stub the missing piece with a clearly marked `// TODO(T<n> failed): ...` and say so in PROGRESS.

After T12: if time remains, do the optional extras in `docs/TASKS.md` §"Optional extras" in the listed order, same loop, commit prefix `X<n>:`.

## 3. PROGRESS.md entries

Append (never rewrite history) one section per task, using the template in `docs/PROGRESS.md`:
- status: `DONE` | `PARTIAL` | `FAILED`
- what was done (3–6 bullets)
- files touched (paths)
- how to verify (exact commands Devin can run)
- open issues / decisions made
- anything that needs Devin → also add it to the "Waiting for Devin" list at the top.

## 4. Hard limits (non-negotiable)

**No remote actions.** Do not:
- `git push`, create remotes, open PRs, or change git config;
- deploy (`vercel`, `vercel deploy`, `npx vercel`), link projects, or create Vercel/Upstash/GitHub/DeepSeek accounts or resources;
- provision Upstash or any database.
List anything that needs one of these under "Waiting for Devin" in PROGRESS.

**Allowed network use:** `npm install`/`npx` for the pinned packages, and **local** calls to Qloo and DeepSeek using keys from `.env.local` (only in T12 smoke, T11 eval, and manual checks the tasks name). If keys are missing or calls fail, record it and continue. Unit tests (`npm test`) must never use the network.

**Secrets:**
- Keys come only from environment variables (`.env.local` locally). Read them only in `src/lib/env.ts`.
- Never print, log, echo, or `cat` key values or `.env.local`. Never write keys into any file, test, fixture, trace event, or commit. Never put a key in a URL; Qloo gets it only in the `X-Api-Key` header.
- Never use a `NEXT_PUBLIC_` prefix for a secret.
- `.env.example` contains names only.

**Automatic commit and push checks (FIXES-R4 R12):**
- Never use `--no-verify`. Never disable, edit, or weaken the hooks, `scripts/check-privacy.mjs`, `scripts/privacy-rules.mjs`, or `scripts/check-rules.mjs` unless a task explicitly says so.
- Never use `git add -A` or `git add .`. Stage files by explicit path. Before every commit, run `git diff --cached --stat` and paste the staged list into its PROGRESS entry.
- If `check:privacy` fails, remove the offending content; never whitelist it yourself. Record what was blocked in PROGRESS without the matched value.
- Pre-commit checks staged privacy and the required author; pre-push runs lint, typecheck, offline tests, rules, and full-tree privacy. Keep both hooks installed with `npm install`.
- `scripts/check-privacy.mjs` and `scripts/check-rules.mjs` may read only the four named secret values from `.env.local` and the environment for private exact comparison. `scripts/install-hooks.mjs` may read `CI` and `VERCEL` to skip hook installation. Application environment reads remain confined to `src/lib/env.ts`.

**Data:**
- **Never commit Qloo response data** (Qloo's hackathon rules forbid storing it in a public repo). No recorded API responses, no snapshots, no dumps. Smoke/eval scripts print counts and names only and write nothing to disk.
- Test fixtures in `tests/fixtures/` are **small, hand-written fake data**: fake names ("Fake Coffee Co"), fake UUIDs of the form `00000000-0000-4000-8000-0000000000NN`. `check:rules` enforces the UUID form.
- The files in `src/data/` were written by hand in the docs commit. Do not change tag IDs in them; you may add fields only if a task says so.

**Product limits:** no email sending or email drafts, no MCP server, no auth/login, no analytics, no demographics (age, gender, ZIP, income) anywhere in requests, prompts or UI.

## 5. Readability rules (mandatory; `npm run lint` and `npm run check:rules` enforce most of them)

1. **One responsibility per file.** If a file does two things, split it (only into files allowed by the tree in `docs/ARCHITECTURE.md` §2; otherwise note it in PROGRESS).
2. **File length ≤ 200 lines** (ESLint `max-lines`, blank lines and comments excluded).
3. **Function length ≤ 40 lines** (ESLint `max-lines-per-function`). Exception: React component functions in `src/components/*.tsx` and `src/app/page.tsx` may be up to 80 lines; split sub-components (in the same file, ≤ 200 lines total) beyond that.
4. **No `any`** (ESLint `@typescript-eslint/no-explicit-any: error`). Use `unknown` + zod parsing at boundaries.
5. **No complex types:** no conditional types, no mapped/template-literal type tricks, no generic type parameters beyond a single simple `<T>` where unavoidable. Prefer `z.infer<typeof Schema>` types from `src/lib/types.ts`.
6. **Explicit return types on every exported function** (ESLint `@typescript-eslint/explicit-module-boundary-types`).
7. **Plain functions + `async`/`await`.** No classes at all (errors are plain `Error` objects with extra fields, built by a factory function; see ARCHITECTURE §11), no inheritance, no decorators, no dependency-injection frameworks. No `.then()` chains.
8. **Frontend state only with `useState`** (plus `useEffect`/`useRef`/`useMemo` as needed). No Redux, Zustand, Jotai, React Query, context-based stores.
9. **Every file starts with exactly two `//` comment lines**: line 1 = what this file does, line 2 = who calls it. Example:
   ```ts
   // Scores and ranks candidate merchants for one category (pure functions, no I/O).
   // Called by: src/lib/agent/tools/find-merchants.ts and tests/unit/scoring.test.ts
   ```
   (For files that must start with a directive such as `"use client";`, put the directive first, then the two comment lines.) Generated files in `src/components/ui/` and config files created by tools are exempt.
10. **Comments explain WHY** on non-obvious logic (Qloo quirks, guards, scoring weights). Link the doc section, e.g. `// See QLOO_API.md §4.3`.
11. **Only the dependencies listed in `docs/ARCHITECTURE.md` §9.** Any new dependency must be justified in PROGRESS (name, why, why no listed one works).
12. **No new directories** beyond the tree in `docs/ARCHITECTURE.md` §2. New files inside existing directories are allowed only when the tree says "(more files allowed)" or the task names them.
13. **Full-word names**: `merchant`, `category`, `branch`, `distanceMeters`, not `m`, `cat`, `br`, `d`. Loop indices `i`/`j` are fine. Files `kebab-case.ts`, components `PascalCase.tsx`, constants `UPPER_SNAKE_CASE`.
14. Tunable numbers live in `src/lib/config.ts`, not inline.
15. Prefer early returns over nested `if`s; max nesting depth 3.

## 6. Pinned stack and known gotchas (verified 2026-10-22/23)

See `docs/ARCHITECTURE.md` §9 for versions. Gotchas:

- Scaffold with `create-next-app@16.4.2`, which enables `cacheComponents: true`. With it, route segment configs `export const runtime`, `export const dynamic`, `export const revalidate` **fail the build**: do not use them. Route handlers run on the Node runtime by default (that is what we want). `export const maxDuration = 300;` is allowed and required in both API routes. If the build rejects `maxDuration`, remove it, record it in PROGRESS and add "set function max duration in Vercel" to Waiting for Devin.
- No `request.ip` in Next 16: read `x-forwarded-for` (first entry), then `x-real-ip`, else `"unknown"`.
- `tsx` runs scripts as CommonJS (no `"type": "module"`): **no top-level `await` in scripts**; use `async function main()` + `main().catch(...)`.
- Leaflet touches `window` at import: load `MerchantMap` with `next/dynamic` and `{ ssr: false }` from a client component. Use `CircleMarker` (not `Marker`) to avoid broken default icon assets. Import `leaflet/dist/leaflet.css` inside `MerchantMap.tsx`.
- AI SDK 7: use `generateText` with `instructions`, `tools` built with `tool({ description, inputSchema, execute })`, `stopWhen: [isStepCount(n), customStop]`, `providerOptions: { deepseek: { thinking: { type: "disabled" } } }`, `temperature: 0`. Tests use `MockLanguageModelV4` from `ai/test`. Tool `input` on step results is `unknown`: re-parse with zod. If an installed type differs from these names, follow the installed type definitions (check `node_modules/ai/dist/index.d.ts`) and record the difference in PROGRESS.
- DeepSeek thinking mode is on by default and makes temperature ignored and tool turns fragile; always disable it.

## 7. Commands (after T1)

| Command | What it does |
|---|---|
| `npm run dev` | dev server on http://localhost:3000 |
| `npm run build` | production build + type check |
| `npm run lint` | ESLint (includes readability rules) |
| `npm test` | vitest unit tests in `tests/unit` (no network, no keys) |
| `npm run check:rules` | `node scripts/check-rules.mjs`: header comments, file length, tree, fixture UUIDs, no secrets |
| `npm run eval` | category-pick eval set with real keys (T11) |
| `npm run smoke` | real-key end-to-end smoke test (T12) |

## 8. Things not to do

- Don't call `api.qloo.com` or `staging.api.qloo.com`; only `https://hackathon.api.qloo.com`.
- Don't use Qloo `signal.demographics.*`, audiences, or heatmaps.
- Don't use `/v2/insights?filter.type=urn:tag` (returns empty for brand seeds; see QLOO_API.md §7).
- Don't edit `docs/*.md` except `docs/PROGRESS.md` (and QLOO_API.md §9 "Verification log", where a task says so).
- Don't rename endpoints, types, files, or cache keys defined in `docs/ARCHITECTURE.md`.
- Don't add features beyond the tasks. Don't build the optional extras before T12 is done.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
