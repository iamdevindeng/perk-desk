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
