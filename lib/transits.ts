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
  transitToNatalAspects: Aspect[];     // body1 = transiting, body2 = natal
  meta: { ephemeris: "swieph" | "moseph" };
}

export interface TransitChartRecord {
  id:          string;
  chartId:     string;
  targetDate:  string;
  transitData: TransitData; // parsed; never re-computed on read
  createdAt:   Date;
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

function parseTransitData(raw: string): TransitData {
  return JSON.parse(raw) as TransitData;
}

function toRecord(row: {
  id: string; chartId: string; targetDate: string;
  transitData: string; createdAt: Date;
}): TransitChartRecord {
  return { ...row, transitData: parseTransitData(row.transitData) };
}

// ─── public API ───────────────────────────────────────────────────────────────

// targetDate is a resolved calendar date, not a UI concept — today it always
// comes from a manually-picked date, but nothing here assumes that. A future
// named-event picker (full moon, a conjunction, etc.) just needs to resolve
// its own selection down to a "YYYY-MM-DD" date string upstream; from here
// down (this function, getOrCreateTransitChart, the API route) the path is
// unchanged, since a date is the only thing this layer ever needed.
export function computeTransitData(input: {
  natal: ChartData;
  targetDate: string;
}): TransitData {
  const { natal, targetDate } = input;
  const transitInstant = `${targetDate}T12:00:00Z`;
  const jd_ut = jdUtFromIso(transitInstant);

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

  // Aspect targets: natal planets plus the natal angles.
  const natalTargets: AspectBody[] = [
    ...natal.positions.map(p => ({ body: p.body, longitude: p.longitude })),
    { body: "Ascendant", longitude: natal.ascendant },
    { body: "Midheaven", longitude: natal.midheaven },
  ];

  const transitToNatalAspects = computeAspects(transitingPositions, natalTargets, TRANSIT_ORBS);

  return {
    targetDate,
    transitInstant,
    transitingPositions,
    transitToNatalAspects,
    meta: { ephemeris: EPHEMERIS_MODE },
  };
}

// Read-only lookup — never computes. Used both as the cache check inside
// getOrCreateTransitChart and by callers that must not trigger ephemeris work
// (e.g. listing sessions for a date that may not have been computed yet).
export async function findTransitChart(
  chartId: string,
  targetDate: string
): Promise<TransitChartRecord | null> {
  const row = await prisma.transitChart.findUnique({
    where: { chartId_targetDate: { chartId, targetDate } },
  });
  return row ? toRecord(row) : null;
}

export async function getTransitChartById(id: string): Promise<TransitChartRecord | null> {
  const row = await prisma.transitChart.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

// targetDate: see the note on computeTransitData — any future way of
// picking "when" (a named event, not just a calendar widget) resolves to
// this same date string before it ever reaches here.
export async function getOrCreateTransitChart(
  chartId: string,
  targetDate: string
): Promise<TransitChartRecord> {
  const existing = await findTransitChart(chartId, targetDate);
  if (existing) return existing;

  const chart = await getBirthChart(chartId);
  if (!chart) throw new ChartNotFoundError(`Chart not found: ${chartId}`);

  const transitData = computeTransitData({ natal: chart.chartData, targetDate });

  try {
    const row = await prisma.transitChart.create({
      data: {
        chartId,
        targetDate,
        transitData: JSON.stringify(transitData),
      },
    });
    return toRecord(row);
  } catch (err) {
    // Race: another call created the same (chartId, targetDate) row first —
    // the @@unique constraint is the source of truth, so just re-read it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const row = await findTransitChart(chartId, targetDate);
      if (row) return row;
    }
    throw err;
  }
}
