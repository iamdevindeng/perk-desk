# Perk Desk — Fix R10: quota protection (2026-10-24)

> Codex: read this file after AGENTS.md. Same rules as FIXES-R1: one commit, run `npm run lint && npm run typecheck && npm test && npm run build && npm run check:rules`, log in docs/PROGRESS.md, no remote actions.

Goal: a public deploy must not be able to burn the Qloo hackathon key or the DeepSeek balance before judging ends (Nov 5 ET).

R10a. Lower daily limits in src/lib/config.ts:
- RUN_LIMIT_PER_IP = 10, RUN_LIMIT_GLOBAL = 60
- PLAN_LIMIT_PER_IP = 30, PLAN_LIMIT_GLOBAL = 200
Keep: judge code skips only the per-IP limit (global still applies); demo presets served from cache stay unlimited. Update tests and any docs that quote the old numbers (ARCHITECTURE/PRD/README).

R10b. Upstash is REQUIRED in production (fail closed):
- In-memory limits are per serverless instance and reset on cold start, so they do not protect a Vercel deploy.
- When running on Vercel production (`process.env.VERCEL_ENV === "production"`, read only via src/lib/env.ts) and UPSTASH_REDIS_REST_URL/TOKEN are missing: /api/plan and /api/run must refuse live (non-preset) requests with HTTP 503 and a clear message ("Live research is disabled: shared rate-limit store not configured."). Cached demo presets still work.
- Local dev and preview deploys keep the in-memory fallback as today, with the existing warning.
- If Upstash is configured but a call to it fails at runtime, deny the live request (503) instead of falling back to memory in production.
- Tests: production + no Upstash → 503 for live, 200 for cached preset; dev + no Upstash → in-memory works.

R10c. Usage visibility: log one structured line per live run on the server (`[usage] scope=run ip_hash=<short sha256> qloo_calls=<n> llm_calls=<n>`), no raw IP, no keys. Devin reads it in Vercel logs.

Done when: all checks green, PROGRESS has an "R10" entry.
