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
import { getBirthChart, type BirthChartRecord } from "./charts";
import { resolveUtcInstant, type ResolvedPlace } from "./geo";
import { prisma } from "./db";
import { Prisma } from "@prisma/client";

// Tighter than natal orbs, on purpose — a transit hit should mean something.
const TRANSIT_ORBS: readonly AspectOrbConfig[] = [
  { type: "conjunction", angle: 0,   orb: 6 },
  { type: "opposition",  angle: 180, orb: 6 },
  { type: "square",      angle: 90,  orb: 6 },
  { type: "trine",       angle: 120, orb: 6 },
  { type: "sextile",     angle: 60,  orb: 5 },
];

export class ChartNotFoundError extends Error {}

// ─── interfaces ───────────────────────────────────────────────────────────────

// What actually gets persisted. Only the inputs to aspect detection are
// stored — never the aspects themselves. Aspects are a pure function of the
// transiting positions + the natal chart + TRANSIT_ORBS (no ephemeris call),
// so they're recomputed on every read (see parseTransitData). That way an
// orb-config change takes effect immediately instead of being frozen into
// rows written under the old orbs.
export interface StoredTransitData {
  targetDate: string;
  transitInstant: string;              // ISO UTC noon
  transitingPositions: PlanetPosition[]; // `house` = natal house occupied
  meta: { ephemeris: "swieph" | "moseph" };
}

// The hydrated shape callers see: stored inputs plus the derived aspects.
export interface TransitData extends StoredTransitData {
  transitToTransitAspects: Aspect[];   // the sky's own configuration — both bodies transiting
  transitToNatalAspects: Aspect[];     // body1 = transiting, body2 = natal
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

// The single source of truth for how transit aspects are derived. Both sets
// are a pure function of the transiting positions + the natal chart against
// TRANSIT_ORBS — no ephemeris call — used both when first building a chart and
// when hydrating a cached row on read.
function computeTransitAspects(
  transitingPositions: PlanetPosition[],
  natal: ChartData
): Pick<TransitData, "transitToTransitAspects" | "transitToNatalAspects"> {
  // Aspect targets: natal planets plus the natal angles.
  const natalTargets: AspectBody[] = [
    ...natal.positions.map(p => ({ body: p.body, longitude: p.longitude })),
    { body: "Ascendant", longitude: natal.ascendant },
    { body: "Midheaven", longitude: natal.midheaven },
  ];
  return {
    // The sky's own configuration — transiting planets aspecting each other,
    // independent of any individual chart. computeAspects handles the self-set
    // dedup (skip self-pairs and A–B/B–A duplicates).
    transitToTransitAspects: computeAspects(transitingPositions, transitingPositions, TRANSIT_ORBS),
    transitToNatalAspects:   computeAspects(transitingPositions, natalTargets, TRANSIT_ORBS),
  };
}

// Drops the derived aspects before persisting — only inputs are cached.
function toStored(d: TransitData): StoredTransitData {
  const { targetDate, transitInstant, transitingPositions, meta } = d;
  return { targetDate, transitInstant, transitingPositions, meta };
}

// Cached rows store only StoredTransitData — aspects are recomputed here
// against the current natal chart + TRANSIT_ORBS. Any aspect fields left on an
// older row are parsed away by the StoredTransitData cast and ignored.
function parseTransitData(raw: string, natal: ChartData): TransitData {
  const stored = JSON.parse(raw) as StoredTransitData;
  return { ...stored, ...computeTransitAspects(stored.transitingPositions, natal) };
}

function toRecord(row: {
  id: string; chartId: string; transitInstantUtc: string; latitude: number; longitude: number;
  targetDate: string; localTime: string | null; timezone: string | null; placeLabel: string | null;
  transitData: string; createdAt: Date;
}, natal: ChartData): TransitChartRecord {
  return { ...row, transitData: parseTransitData(row.transitData, natal) };
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

  return {
    targetDate,
    transitInstant: transitInstantUtc,
    transitingPositions,
    ...computeTransitAspects(transitingPositions, natal),
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
  if (!row) return null;
  // Aspects are recomputed on read, so hydration needs the natal chart.
  // resolveTransitTarget already proved it exists (throws otherwise).
  const chart = await getBirthChart(chartId);
  if (!chart) throw new ChartNotFoundError(`Chart not found: ${chartId}`);
  return toRecord(row, chart.chartData);
}

export async function getTransitChartById(id: string): Promise<TransitChartRecord | null> {
  const row = await prisma.transitChart.findUnique({ where: { id } });
  if (!row) return null;
  const chart = await getBirthChart(row.chartId);
  if (!chart) throw new ChartNotFoundError(`Chart not found: ${row.chartId}`);
  return toRecord(row, chart.chartData);
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
        transitData:       JSON.stringify(toStored(transitData)),
      },
    });
    return toRecord(row, chart.chartData);
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
