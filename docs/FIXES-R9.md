# FIXES-R9 — branch memory and empty-branch guard (from live testing, 2026-10-25)

Scope: only R39–R40 below. Both follow from R36 and affect what judges see.

## Rules for this round

- Follow AGENTS.md (readability rules, privacy and security hooks).
- Zero live Qloo or DeepSeek calls in tests.
- Do NOT push. Commit locally only; Devin decides when to push.
- One commit per item (R39, R40). Run the full test suite, lint and typecheck before each commit.
- Touch nothing outside these items. Demo cache keys, preset data, and plan/run request shapes must stay unchanged.
- Never use `--force` or `--no-verify`.

## R39 — Remember branches per city

Problem: after R36, switching City always resets branches, so Denver → Austin → Denver loses the Denver branches the user entered.

1. Profile (`src/lib/types.ts`, `ProfileSchema`)
   - Add `branchesByCity: z.record(z.string().min(1).max(80), z.array(BranchSchema).min(1).max(5)).default({})`.
   - Keep at most 10 cities. When saving an 11th, drop the oldest saved city.
   - Existing saved profiles without this field must still load (the default handles it).
   - This field is browser-only. `buildPlanRequest` and `buildRunRequest` must NOT include it.

2. City select (`src/components/ProfileForm.tsx`, `CityField`)
   - On a City `<select>` change:
     - If the current `profile.city` (trimmed) is not empty, save the current branches under that city in `branchesByCity`.
     - If the new city is a known city with saved branches, restore them. Otherwise use one blank branch, as R36 does now.
     - Choosing "Other city" always starts with one blank branch.
   - Status line under the City field (`role="status"`):
     - Restored: "Restored your saved branches for <city label>."
     - Reset: keep the current R36 text.
     - Hide it the same way as R36 (after a branch edit or a preset pick).
   - Typing in the Other-city input still never resets or restores branches.

3. Presets (`selectPreset` in `src/app/page.tsx`)
   - Before loading a preset, save the current branches under the current city (same rule as above).
   - Keep the existing `branchesByCity` when the preset profile is loaded, instead of wiping it.
   - Everything else about presets stays exactly as now.

Tests:
- Denver → Austin → Denver restores the Denver branches and shows the restored message.
- A city with nothing saved gets one blank branch and the reset message.
- Other city always starts blank.
- The 10-city cap drops the oldest city.
- An old saved profile without `branchesByCity` loads.
- Plan and run request payloads do not contain `branchesByCity`.
- Preset canonical hashes and cache keys are unchanged.
- Picking a preset keeps the saved branch memory.

## R40 — Don't allow planning with an unlocated branch

Problem: a blank branch (no address, no map point) still enables "Plan categories". The plan then uses one of the user's daily plans and ends with "No branch locations were resolved", which is confusing.

Fix (`canPlan` in `src/app/page.tsx`):
- Planning is allowed only when every branch has either coordinates (`lat` and `lon`) or a non-empty trimmed address.
- When the button is disabled for this reason, show a hint next to it: "Add an address or pick a map location for every branch."
- No server or schema change.

Tests:
- A blank branch disables planning and shows the hint.
- An address-only branch enables planning, and so does a map-picked branch.
- Both presets can plan.

## Report back

Commit hashes, test count, and anything you could not do. Wait for review before any push.
