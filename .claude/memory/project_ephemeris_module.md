---
name: project-ephemeris-module
description: Context on the astro-ask project's ephemeris calculation module — what was built, how it works, and what comes next
metadata:
  type: project
---

The ephemeris calculation module lives at `lib/ephemeris.ts`. It exposes `computeNatalChart(input)` which takes a UTC ISO-8601 datetime + lat/lng and returns a fully-typed `ChartData` object.

**Current state:** Uses Moshier flag (`SEFLG_MOSEPH`) — no ephemeris data files required. Chiron is skipped gracefully when unavailable. To switch to high-precision Swiss files, download `sepl_18.se1`, `semo_18.se1`, `seas_18.se1`, call `swe.set_ephe_path(dir)`, and replace `SEFLG_MOSEPH` with `SEFLG_SWIEPH` in the flags line.

**Why:** This is slice 1 of a larger astrology app. Coordinates and UTC instant come in ready — timezone conversion and geocoding happen upstream in a later slice.

**How to apply:** When extending this module, check that `lib/ephemeris.ts` is still the right entry point. The verify script at `scripts/verify-ephemeris.ts` runs three reference charts; run it after any changes to confirm correctness.

Key decisions:
- `calc_ut` (takes UT Julian Day) used for planets, not `calc` (ET)
- `houses_ex` used for cusps; Ascendant = `points[0]`, MC = `points[1]`
- House assignment handles 360°→0° wrap manually
- Aspects computed for every pair; orb ranges don't overlap so at most one match per pair
