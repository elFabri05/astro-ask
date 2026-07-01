---
name: project-charts-pipeline
description: The calculate-and-persist pipeline — validation, service layer, Prisma schema, and API routes for natal charts
metadata:
  type: project
---

**Files added in this slice:**
- `lib/validation.ts` — Zod v4 schema (`BirthDataInput`), single source of truth for input shape
- `lib/db.ts` — Prisma singleton with Next.js hot-reload guard
- `lib/charts.ts` — service layer: `createBirthChart` + `getBirthChart`; route handlers call these directly
- `prisma/schema.prisma` — SQLite now, Postgres-portable (only datasource block changes)
- `app/api/charts/route.ts` — POST: create chart; 201 + record, 400 + ZodError.flatten() on validation fail
- `app/api/charts/[id]/route.ts` — GET: fetch by id; 404 if not found

**Key constraints baked in:**
- local → UTC conversion via `resolveUtcInstant` happens BEFORE `computeNatalChart` is called; this is the invariant this slice exists to enforce
- `chartData` is frozen at write time as `JSON.stringify(ChartData)` in a `String` column (not JSON type, for Postgres portability)
- On read, it's parsed back to `ChartData`; never recomputed

**Node version constraint:** Prisma v7 requires Node ≥20. We're on Node 18, so Prisma v5.22 is pinned. Do not upgrade Prisma without upgrading Node first.

**Zod version:** v4.4.3 (installed as `zod`). Classic API (same as v3 for our usage): `z.object()`, `.parse()`, `ZodError`, `.flatten().fieldErrors`.

**DATABASE_URL:** `file:./dev.db` in `.env`. SQLite file at `prisma/dev.db`.
