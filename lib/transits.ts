import * as swe from "sweph";
import {
  PLANET_BODIES,
  CALC_FLAGS,
  EPHEMERIS_MODE,
  lonToSignInfo,
  assignHouse,
  type PlanetPosition,
  type ChartData,
} from "./ephemeris";
import { computeAspects, type Aspect, type AspectBody, type AspectOrbConfig } from "./aspects";
import { getBirthChart } from "./charts";
import { resolveUtcInstant, type ResolvedPlace } from "./geo";
import { prisma } from "./db";
import { Prisma } from "@prisma/client";

// Tighter than natal orbs, on purpose — a transit hit should mean something.
const TRANSIT_ORBS: readonly AspectOrbConfig[] = [
  { type: "conjunction", angle: 0,   orb: 3 },
  { type: "opposition",  angle: 180, orb: 3 },
  { type: "square",      angle: 90,  orb: 3 },
  { type: "trine",       angle: 120, orb: 3 },
  { type: "sextile",     angle: 60,  orb: 2 },
];

export class ChartNotFoundError extends Error {}

// ─── interfaces ───────────────────────────────────────────────────────────────

export interface TransitData {
  targetDate: string;
  transitInstant: string;              // ISO UTC noon
  transitingPositions: PlanetPosition[]; // `house` = natal house occupied
  transitToTransitAspects: Aspect[];   // the sky's own configuration — both bodies transiting
  transitToNatalAspects: Aspect[];     // body1 = transiting, body2 = natal
  meta: { ephemeris: "swieph" | "moseph" };
}

export interface TransitChartRecord {
  id:                string;
  chartId:           string;
  transitInstantUtc: string;         // ISO UTC, the actual instant the ephemeris was computed at
  latitude:          number;         // location used for the calc (override place, or natal default)
  longitude:         number;
  targetDate:        string;         // "YYYY-MM-DD", human-facing calendar date
  localTime:         string | null;  // "HH:mm", human-facing; null when defaulted to noon
  timezone:          string | null;  // IANA zone the local time was resolved in; null when defaulted
  placeLabel:        string | null;  // human label of an overridden place; null when using natal location
  transitData:       TransitData;    // parsed; never re-computed on read
  createdAt:         Date;
}

// What the caller asked for: a date is required, time and a place override
// are independently optional. Omitting both must resolve identically to the
// historical noon-UTC-at-natal-location behavior — see resolveTransitTarget.
export interface TransitTargetInput {
  targetDate: string;
  localTime?: string;
  place?: ResolvedPlace;
}

interface ResolvedTransitTarget {
  transitInstantUtc: string;
  latitude:          number;
  longitude:         number;
  targetDate:        string;
  localTime:         string | null;
  timezone:          string | null;
  placeLabel:        string | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function jdUtFromIso(isoUtc: string): number {
  const d = new Date(isoUtc);
  const jdRes = swe.utc_to_jd(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    swe.constants.SE_GREG_CAL
  );
  if (jdRes.flag < 0) {
    throw new Error(`utc_to_jd failed: ${jdRes.error}`);
  }
  const [, jd_ut] = jdRes.data;
  return jd_ut;
}

// Old cached rows (written before transit-to-transit aspects were tracked)
// lack transitToTransitAspects. It's derivable from transitingPositions
// alone (no natal chart or ephemeris call needed), so backfill it in memory
// on read rather than forcing a data migration or a cache reset.
function parseTransitData(raw: string): TransitData {
  const data = JSON.parse(raw) as TransitData;
  if (!data.transitToTransitAspects) {
    data.transitToTransitAspects = computeAspects(
      data.transitingPositions, data.transitingPositions, TRANSIT_ORBS
    );
  }
  return data;
}

function toRecord(row: {
  id: string; chartId: string; transitInstantUtc: string; latitude: number; longitude: number;
  targetDate: string; localTime: string | null; timezone: string | null; placeLabel: string | null;
  transitData: string; createdAt: Date;
}): TransitChartRecord {
  return { ...row, transitData: parseTransitData(row.transitData) };
}

// Resolves a (date, time?, place?) input down to the exact instant + location
// used for the ephemeris calc, before any cache lookup — the resolved key is
// what determines cache identity, not the raw input. Throws ChartNotFoundError
// if chartId doesn't exist, since the natal location is the fallback for any
// omitted piece.
//
// Omitting both time and place bypasses resolveUtcInstant entirely (no geo-tz
// lookup) so it reproduces the historical `${targetDate}T12:00:00Z` behavior
// byte-for-byte.
async function resolveTransitTarget(
  chartId: string,
  target: TransitTargetInput
): Promise<ResolvedTransitTarget> {
  const chart = await getBirthChart(chartId);
  if (!chart) throw new ChartNotFoundError(`Chart not found: ${chartId}`);

  const { targetDate, localTime, place } = target;

  if (place) {
    const { utcDateTime, timezone } = resolveUtcInstant({
      localDate: targetDate,
      localTime: localTime ?? "12:00",
      latitude:  place.latitude,
      longitude: place.longitude,
    });
    return {
      transitInstantUtc: utcDateTime,
      latitude:  place.latitude,
      longitude: place.longitude,
      targetDate,
      localTime: localTime ?? null,
      timezone,
      placeLabel: place.label,
    };
  }

  if (localTime) {
    const { utcDateTime, timezone } = resolveUtcInstant({
      localDate: targetDate,
      localTime,
      latitude:  chart.latitude,
      longitude: chart.longitude,
    });
    return {
      transitInstantUtc: utcDateTime,
      latitude:  chart.latitude,
      longitude: chart.longitude,
      targetDate,
      localTime,
      timezone,
      placeLabel: null,
    };
  }

  return {
    transitInstantUtc: `${targetDate}T12:00:00Z`,
    latitude:  chart.latitude,
    longitude: chart.longitude,
    targetDate,
    localTime: null,
    timezone: null,
    placeLabel: null,
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

// transitInstantUtc is the resolved instant (see resolveTransitTarget) —
// today it's always noon UTC or a resolved local time, but nothing here
// assumes that. A future named-event picker (full moon, a conjunction, etc.)
// just needs to resolve its own selection down to an instant upstream; from
// here down the path is unchanged.
export function computeTransitData(input: {
  natal: ChartData;
  targetDate: string;
  transitInstantUtc: string;
}): TransitData {
  const { natal, targetDate, transitInstantUtc } = input;
  const jd_ut = jdUtFromIso(transitInstantUtc);

  // natal cusps in house order (index 0 = house 1 cusp, ... index 11 = house 12)
  const natalCusps = [...natal.houses]
    .sort((a, b) => a.house - b.house)
    .map(h => h.longitude);

  const transitingPositions: PlanetPosition[] = [];
  for (const planet of PLANET_BODIES) {
    const res = swe.calc_ut(jd_ut, planet.id, CALC_FLAGS);
    if (res.flag < 0) {
      if (planet.optional) continue; // Chiron requires swieph file; skip gracefully
      throw new Error(`calc_ut failed for ${planet.name}: ${res.error}`);
    }
    const [lon, , , lonSpd] = res.data;
    const { sign, signDegree } = lonToSignInfo(lon);
    transitingPositions.push({
      body: planet.name,
      longitude: lon,
      sign,
      signDegree,
      house: assignHouse(lon, natalCusps), // natal house, not a recomputed one
      retrograde: lonSpd < 0,
    });
  }

  // The sky's own configuration — transiting planets aspecting each other,
  // independent of any individual chart. Same self-set dedup as the natal
  // chart's internal aspects (skip self-pairs and A–B/B–A duplicates).
  const transitToTransitAspects = computeAspects(transitingPositions, transitingPositions, TRANSIT_ORBS);

  // Aspect targets: natal planets plus the natal angles.
  const natalTargets: AspectBody[] = [
    ...natal.positions.map(p => ({ body: p.body, longitude: p.longitude })),
    { body: "Ascendant", longitude: natal.ascendant },
    { body: "Midheaven", longitude: natal.midheaven },
  ];

  const transitToNatalAspects = computeAspects(transitingPositions, natalTargets, TRANSIT_ORBS);

  return {
    targetDate,
    transitInstant: transitInstantUtc,
    transitingPositions,
    transitToTransitAspects,
    transitToNatalAspects,
    meta: { ephemeris: EPHEMERIS_MODE },
  };
}

// Read-only lookup — never computes. Used both as the cache check inside
// getOrCreateTransitChart and by callers that must not trigger ephemeris work
// (e.g. listing sessions for a combination that may not have been computed
// yet). Still resolves the target first (cheap: no ephemeris, at most a
// geo-tz lookup) since the resolved instant + location is the cache key.
export async function findTransitChart(
  chartId: string,
  target: TransitTargetInput
): Promise<TransitChartRecord | null> {
  const resolved = await resolveTransitTarget(chartId, target);
  const row = await prisma.transitChart.findUnique({
    where: {
      chartId_transitInstantUtc_latitude_longitude: {
        chartId,
        transitInstantUtc: resolved.transitInstantUtc,
        latitude:          resolved.latitude,
        longitude:         resolved.longitude,
      },
    },
  });
  return row ? toRecord(row) : null;
}

export async function getTransitChartById(id: string): Promise<TransitChartRecord | null> {
  const row = await prisma.transitChart.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

// target: see the note on computeTransitData — any future way of picking
// "when" (a named event, not just a calendar widget) resolves to a
// TransitTargetInput before it ever reaches here.
export async function getOrCreateTransitChart(
  chartId: string,
  target: TransitTargetInput
): Promise<TransitChartRecord> {
  const existing = await findTransitChart(chartId, target);
  if (existing) return existing;

  const chart = await getBirthChart(chartId);
  if (!chart) throw new ChartNotFoundError(`Chart not found: ${chartId}`);

  const resolved = await resolveTransitTarget(chartId, target);
  const transitData = computeTransitData({
    natal: chart.chartData,
    targetDate: resolved.targetDate,
    transitInstantUtc: resolved.transitInstantUtc,
  });

  try {
    const row = await prisma.transitChart.create({
      data: {
        chartId,
        transitInstantUtc: resolved.transitInstantUtc,
        latitude:          resolved.latitude,
        longitude:         resolved.longitude,
        targetDate:        resolved.targetDate,
        localTime:         resolved.localTime,
        timezone:          resolved.timezone,
        placeLabel:        resolved.placeLabel,
        transitData:       JSON.stringify(transitData),
      },
    });
    return toRecord(row);
  } catch (err) {
    // Race: another call created the same resolved row first — the
    // @@unique constraint is the source of truth, so just re-read it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const row = await findTransitChart(chartId, target);
      if (row) return row;
    }
    throw err;
  }
}
