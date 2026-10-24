# Perk Desk

> Cardlytics tells you where members spend; Perk Desk tells you which unsigned local merchants to sign first.

Perk Desk helps the marketing specialist at a community credit union pick the next ~10 local merchants to recruit for the member-perks program: member brand tastes → Qloo place categories (confirmed by the user) → ranked local merchants near each branch, with evidence, a map, a recruiting pitch and CSV export.

Built for the Qloo LLM Hackathon with Qloo Taste AI, DeepSeek, Next.js and OpenStreetMap.

**Merchant-selection tool. Not used for any credit decision or consumer ad targeting.** Uses aggregated brand data only; no age, gender, income or ZIP data.

_Status: local prototype implemented; owner review and deployment remain. See `docs/PROGRESS.md` for verification results and known issues._

## Run locally

From a fresh checkout, use Node.js 20.9 or later and a POSIX shell on macOS or Linux (or WSL on Windows).

```bash
npm install
cp .env.example .env.local
```

Fill in `QLOO_API_KEY` in `.env.local`. Add `DEEPSEEK_API_KEY` to use the agent; without it, the app uses deterministic category selection and template pitches. Qloo is still required in fallback mode. Keep `.env.local` private.

```bash
npm run dev
```

Open http://localhost:3000, choose a demo preset, plan the categories, then confirm them to find merchants. Check the recognized brand choices before confirming, especially in fallback mode.

Local development and preview deployments can use in-memory caching and rate limits without Upstash. Serverless instances do not share memory, and restarts clear it. Vercel production (`VERCEL_ENV=production`) requires both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for live research. If either is missing, live requests return HTTP 503 with "Live research is disabled: shared rate-limit store not configured." If the shared rate-limit service fails or times out, production also refuses live requests with HTTP 503. Cached results, including demo presets, remain available when the cache can serve them.

Daily live budgets are 30 plans per IP and 200 plans globally, plus 10 research runs per IP and 60 runs globally. A judge access code skips only the per-IP limit. Cached requests are unlimited; a preset without a cached result still uses the global budget and requires the shared rate-limit store in production.

For each live research run, server logs include one structured usage line: `[usage] scope=run ip_hash=<short sha256> qloo_calls=<n> llm_calls=<n>`. Counts include outbound HTTP attempts, retries, and failures; cache hits add zero. Read these in Vercel logs to track API usage. The line contains a short SHA-256 hash of the IP, never the raw IP or API keys.

Run the offline unit tests and the smoke check separately:

```bash
npm test
npm run smoke
```

The smoke check makes live Qloo calls and uses DeepSeek when configured. To check fallback mode explicitly, run `PD_AGENT_DISABLED=1 npm run smoke`.

## Docs
- `docs/PRD.md`: product requirements
- `docs/ARCHITECTURE.md`: design
- `docs/QLOO_API.md`: Qloo endpoints used
- `docs/TASKS.md`, `docs/PROGRESS.md`: build plan and log

## License
MIT, see `LICENSE`.
