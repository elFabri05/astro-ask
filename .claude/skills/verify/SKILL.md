---
name: verify
description: How to build, launch, and drive astro-ask for runtime verification.
---

# Verifying astro-ask

Next.js app, SQLite via Prisma (`prisma/dev.db`), Gemini via `@ai-sdk/google`.

## Launch

- `npm run dev` in the background. Port 3000 is often taken — read the startup
  log for the actual port (usually 3001).
- Env comes from `.env` (DATABASE_URL, GOOGLE_GENERATIVE_AI_API_KEY,
  GOOGLE_MODEL). Nothing else to configure.
- Hot reload works for `lib/` edits, but a request landing mid-recompile can
  transiently 404 — retry before trusting a 404.

## Drive

- No `sqlite3` CLI on this machine — query/seed the DB with
  `npx tsx -e "..."` + PrismaClient (wrap in an async `main()`; Node 18 tsx
  eval rejects top-level await). Model names: `birthChart`, `transitChart`,
  `interpretation`, `session`, `message`.
- Browser: no Playwright browsers installed, but `/usr/bin/google-chrome`
  exists. `npm i playwright-core` in the scratchpad and launch with
  `executablePath: '/usr/bin/google-chrome'`.
- Useful surfaces:
  - `GET /api/charts/:id/transits?date=YYYY-MM-DD[&time=&placeLabel=&placeLat=&placeLng=]`
    resolves/creates a TransitChart + opener.
  - `GET /api/charts/:id/transits?transitChartId=` exact restore, also the
    opener Retry path.
  - Page: `/chart/:id/transits?date=...` (transient view when the transit has
    no sessions; otherwise opens the newest session).
- Find real ids by querying `birthChart` / `transitChart` first.

## Gotchas

- **Gemini free tier is 20 req/day/model.** Any request that resolves a
  transit with no cached opener fires a real LLM call (~20s). To test opener
  failure paths WITHOUT burning quota, temporarily `throw` right before the
  `generateText` call in `getOrCreateTransitOpener` (lib/interpret.ts) — a
  message matching `/quota/i` classifies as `rate_limited`, anything else as
  `generation_failed`. Cache hits bypass the throw, which also proves the
  reuse path. Remove the stub after.
- To simulate opener recovery without an LLM call, insert an
  `interpretation` row (`type: 'transit'`, any `model`) for the transitChart,
  then hit Retry.
- Clean up test-created `transitChart`/`interpretation`/`session` rows after
  (delete interpretations and sessions before their transitChart).
- Known pre-existing console noise: React hydration warning from float
  rounding in `CompactChartWheel` SVG; harmless.
