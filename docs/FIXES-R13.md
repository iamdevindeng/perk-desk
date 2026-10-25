# FIXES-R13 — R49 (Independents only info tooltip)

Base: `8602ef4`. Approved by Devin on 2026-10-26.

## Rules (same as every round)
- Follow AGENTS.md and the readability rules. Small functions, plain names, a short WHY comment where a choice is not obvious.
- No live Qloo or DeepSeek calls, ever (tests use invented fixtures only). No Qloo response data in the repo.
- Do NOT push. Never use `--force` or `--no-verify`.
- Do not change presets, cache keys, request/response shapes, rate limits, Qloo call caps, the saved profile schema, or the filtering logic itself.
- No new dependencies. No new folders. (There is no tooltip component or Radix in the repo; build a tiny native one.)

---

## R49 — Info tooltip next to "Independents only"

**Why:** users and judges don't know what "independent" means here. National chains are already removed during research; the switch only hides local brands flagged `multiLocation` (2+ locations nearby).

**Do:**
1. Add a small reusable component `src/components/ui/info-tooltip.tsx` (one file, about 40–60 lines): a round "i" icon button (`type="button"`, about 18–20px, slate color, visible focus ring) plus a small popup with `role="tooltip"` and a stable `id`, wired with `aria-describedby` on the button. Props: `label` (button aria-label) and `text`.
2. Behavior:
   - Desktop: shows on mouse hover and on keyboard focus; hides on mouse leave and blur.
   - Touch / click: a click toggles it open/closed (so phones can read it).
   - Escape closes it; a click outside closes it.
   - The popup must not take focus or trap anything.
3. Place it right after the "Independents only" label in `MerchantResults` (`MerchantCard.tsx`). It must sit OUTSIDE the `<Label>` that wraps the switch, so clicking the icon never toggles the switch.
   - `label`: `What does Independents only mean?`
   - `text`: `Hides local brands with 2+ locations nearby. National chains are already excluded.`
4. Layout: the popup is absolutely positioned near the icon, max width about 240px, small text, white background, border, shadow. It must not be clipped by the card (check `overflow` on ancestors) and must stay fully on screen at 375px width. z-index: reuse or sit just below `TOP_BAR_Z_INDEX` so it is above the map but under the sticky bar; put any new number in `config.ts` with a WHY comment.
5. Respect reduced motion (no animation, or only under `motion-safe`).

**Tests (new file `tests/unit/info-tooltip.test.ts`, plus one check in the merchant results tests):**
- renders the icon button with the aria-label and `aria-describedby` pointing at the tooltip id;
- hidden by default; focus shows it; blur hides it; click toggles; Escape closes;
- the text in `MerchantResults` matches exactly;
- clicking the icon does not change the Independents only switch.

---

## Finish
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run check:privacy` all green.
- Update `docs/PROGRESS.md` (R49).
- Commit locally with a clear message (`R49: ...`). Do NOT push.
- Keep the dev server running on port 3000.
- Report the commit hash and the test count.
