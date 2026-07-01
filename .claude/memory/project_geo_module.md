---
name: project-geo-module
description: Context on the astro-ask geo module — geocoding + timezone resolution that feeds UTC instants into the ephemeris module
metadata:
  type: project
---

The geo module lives at `lib/geo.ts`. It provides two exports:

- `resolvePlace(query)` → `ResolvedPlace | null` — async, uses node-geocoder with OpenStreetMap (Nominatim). Returns null on no-match; throws are caught internally.
- `resolveUtcInstant({ localDate, localTime, latitude, longitude })` → `ResolvedUtcInstant` — synchronous; does the timezone lookup + historical DST offset via luxon.

**Key design decisions:**

1. **geo-tz import**: Uses `geo-tz/dist/find-all` (not `geo-tz` default). The default "alike-since-1970" dataset merges Iceland into "Africa/Abidjan" since they share UTC+0 since 1970; the find-all dataset returns distinct IDs per country ("Atlantic/Reykjavik"). Also accurate for pre-1970 historical dates.

2. **Luxon for DST**: `DateTime.fromObject({...}, { zone })` then `.offset` gives the historical offset at that specific instant (not today's rules). This is what makes cases 4 vs 5 correctly show -300 vs -240 for NYC winter/summer 2000.

3. **No UTC math by hand**: All offset logic goes through luxon + IANA zone. Never roll offsets manually.

4. **resolvePlace returns null** (not throw) on no-match. Callers should check for null.

**Verify script**: `scripts/verify-geo.ts` — `npm run verify:geo`.

**How to apply**: This module is upstream of `lib/ephemeris.ts`. The chain is: resolvePlace → (lat/lng) → resolveUtcInstant → (utcDateTime, lat, lng) → computeNatalChart.
