---
name: project-interpretation-slice
description: Natal interpretation slice — prompts module, interpret service, API route, InterpretationSection UI
metadata:
  type: project
---

**Files added:**
- `lib/prompts.ts` — pure prompt builder; `buildNatalSystemPrompt()` + `buildNatalUserPrompt(ChartData)`. No network, fully testable.
- `lib/interpret.ts` — service; `generateNatalInterpretation(chartId, {force?})` + `getNatalInterpretation(chartId)`. Cache by (chartId, type="natal"); force=true deletes old row then inserts fresh one.
- `app/api/charts/[id]/interpretation/route.ts` — GET → 204 if none, 200 + record if exists; POST → generate (pass force:true to body for regenerate).
- `components/InterpretationSection.tsx` + `.module.css` — client component; takes chartId + initial InterpretationRecord|null; "Generate" / "Regenerate" buttons; pure React state.
- `app/chart/[id]/page.tsx` — updated server component; fetches chart + interpretation in parallel; renders InterpretationSection.
- `scripts/verify-prompts.ts` — 22 assertions; runs without API key; `npm run verify:prompts`.
- `prisma/migrations/20260701180511_add_interpretation/migration.sql` — adds Interpretation table.

**Key decisions:**
- ai@4.3.19 + @ai-sdk/anthropic@1.2.12 pinned (ai v7 requires Node ≥22; project is Node 18.19.1)
- MODEL_ID constant in `lib/interpret.ts`; default `claude-haiku-4-5-20251001`; overridable via `ANTHROPIC_MODEL` env var
- `ANTHROPIC_API_KEY` must be set in `.env` — it is currently blank ("")
- Cache invariant: ONE interpretation row per (chartId, type); force-regenerate deletes then inserts
- `ai` and `@ai-sdk/anthropic` added to `experimental.serverComponentsExternalPackages` (ESM packages, Next.js 14)

**Verify (no API key needed):** `npm run verify:prompts` → 22 passed
**Browser verify (needs ANTHROPIC_API_KEY in .env):**
  1. Open /new, fill form, submit → navigate to /chart/:id
  2. Page shows "No interpretation yet" + "Generate interpretation" button
  3. Click Generate → interpretation appears with real Sun sign, etc.
  4. Reload → same text loads instantly (cached)
  5. Click Regenerate → fresh text replaces it
