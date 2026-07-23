// Sky-event detection built on a single primitive: angle crossings between
// two longitude series. Moon phases are Sun–Moon elongation crossing
// 0/90/180/270; planet aspects are pairwise separation crossing 0/90/120/180.
// Nothing else — no stations, no ingresses, no orb tracking.
//
// Deliberately samples ONLY the ten Sun–Pluto bodies via calc_ut, one call
// per body per day. Chiron is skipped: it pulls in the seas_*.se1
// ephemeris-file dependency and isn't needed for sky events. The True Node
// is not swept daily either — it is evaluated only at refined new/full moon
// instants to classify eclipses (see classifyEclipse below).
//
// Everything here is deterministic astronomy. Crossings are bracketed
// between daily samples and refined by bisection (recomputing longitudes at
// midpoints), so each event carries an accurate computed date. The model
// never touches detection or timing.

import * as swe from "sweph";
import { CALC_FLAGS, lonToSignInfo } from "../ephemeris";

// ─── bodies ───────────────────────────────────────────────────────────────────

export const SKY_BODIES = [
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
] as const;

export type SkyBody = (typeof SKY_BODIES)[number];

const BODY_IDS: Record<SkyBody, number> = {
  Sun:     swe.constants.SE_SUN,
  Moon:    swe.constants.SE_MOON,
  Mercury: swe.constants.SE_MERCURY,
  Venus:   swe.constants.SE_VENUS,
  Mars:    swe.constants.SE_MARS,
  Jupiter: swe.constants.SE_JUPITER,
  Saturn:  swe.constants.SE_SATURN,
  Uranus:  swe.constants.SE_URANUS,
  Neptune: swe.constants.SE_NEPTUNE,
  Pluto:   swe.constants.SE_PLUTO,
};

// Aspect pairs exclude the Moon — it crosses every angle to every planet
// monthly, which is noise next to its phases (already covered above).
const ASPECT_BODIES: readonly SkyBody[] = SKY_BODIES.filter(b => b !== "Moon");

// ─── types ────────────────────────────────────────────────────────────────────

export interface DetectedEvent {
  date: string;            // "YYYY-MM-DD", bisection-refined
  kind: "moon_phase" | "aspect";
  bodies: string[];
  // moon_phase: elongation 0|90|180|270; aspect: separation 0|90|120|180.
  angle: number;
  label: string;           // short human text, built from computed facts only
  factors: string[];       // involved planet names, for topic-relevance overlap
  // Eclipse fields — set on new/full moons only (see classifyEclipse), all
  // COMPUTED from node proximity. The model never decides eclipse status; it
  // receives these as facts.
  isEclipse?: boolean;
  eclipseType?: "solar" | "lunar";
  nodalDistance?: number;  // degrees from the Sun to the nearer node at the instant
  nodeUsed?: "North" | "South";
}

export interface ScanInput {
  startDate: string;       // "YYYY-MM-DD" inclusive
  endDate: string;         // "YYYY-MM-DD" inclusive
  stepDays?: number;
}

// ─── ephemeris sampling ───────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function jdUt(dateMs: number): number {
  const d = new Date(dateMs);
  const res = swe.utc_to_jd(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
    swe.constants.SE_GREG_CAL
  );
  if (res.flag < 0) throw new Error(`utc_to_jd failed: ${res.error}`);
  return res.data[1];
}

// Longitude of one body at one instant — the only ephemeris call in this
// module. Used both for the daily sweep and for bisection refinement.
export function longitudeAt(body: SkyBody, dateMs: number): number {
  const res = swe.calc_ut(jdUt(dateMs), BODY_IDS[body], CALC_FLAGS);
  if (res.flag < 0) throw new Error(`calc_ut failed for ${body}: ${res.error}`);
  return res.data[0];
}

export interface LongitudeSample {
  date: string;                       // "YYYY-MM-DD" (noon UTC sample)
  dateMs: number;
  longitudes: Record<string, number>; // body → ecliptic longitude in degrees
}

// One pass over the window, computing only the requested bodies' longitudes
// per day — no houses, no aspectarian, no full transit data.
export function sampleLongitudes(input: {
  bodies: readonly SkyBody[];
  startDate: string;
  endDate: string;
  stepDays?: number;
}): LongitudeSample[] {
  const { bodies, startDate, endDate, stepDays = 1 } = input;
  const startMs = Date.parse(`${startDate}T12:00:00Z`);
  const endMs   = Date.parse(`${endDate}T12:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new Error(`sampleLongitudes: invalid date range ${startDate}..${endDate}`);
  }

  const samples: LongitudeSample[] = [];
  for (let ms = startMs; ms <= endMs; ms += stepDays * DAY_MS) {
    const longitudes: Record<string, number> = {};
    for (const body of bodies) {
      longitudes[body] = longitudeAt(body, ms);
    }
    samples.push({ date: new Date(ms).toISOString().slice(0, 10), dateMs: ms, longitudes });
  }
  return samples;
}

// ─── the crossing primitive ───────────────────────────────────────────────────

// A longitude time series: daily samples for bracketing, plus an evaluator
// for bisection refinement. A transiting body's series recomputes via
// calc_ut; a FIXED natal point is simply `lonAt: () => natalLongitude` —
// same primitive, so natal contacts can reuse findCrossings later.
export interface LongitudeSeries {
  samples: ReadonlyArray<{ dateMs: number; lon: number }>;
  lonAt: (dateMs: number) => number;
}

export function bodySeries(body: SkyBody, sampled: LongitudeSample[]): LongitudeSeries {
  return {
    samples: sampled.map(s => ({ dateMs: s.dateMs, lon: s.longitudes[body] })),
    lonAt: ms => longitudeAt(body, ms),
  };
}

export function fixedSeries(longitude: number, sampled: LongitudeSample[]): LongitudeSeries {
  return {
    samples: sampled.map(s => ({ dateMs: s.dateMs, lon: longitude })),
    lonAt: () => longitude,
  };
}

export interface Crossing {
  dateMs: number;  // refined instant
  angle: number;   // the target angle that was crossed (as passed in)
}

function norm360(x: number): number {
  return ((x % 360) + 360) % 360;
}

// Signed angular difference folded into [-180, 180).
function wrap180(x: number): number {
  return norm360(x + 180) - 180;
}

// Bisection iterations: one day / 2^16 ≈ 1.3 seconds of precision, from ~32
// extra calc_ut calls per detected crossing — refinement cost is confined to
// actual events, never the whole sweep.
const BISECTION_STEPS = 16;

// Walk consecutive samples of the DIRECTED angle a−b (normalized to
// [0,360)) and find where it crosses each target angle, refining each hit by
// bisection. Directed means 90 and 270 are distinct targets — pass both when
// an aspect is symmetric. Zero is treated as non-negative so a crossing
// landing exactly on a sample is counted by exactly one interval; the
// |g0−g1| < 180 guard rejects the artificial jump wrap180 produces at ±180.
export function findCrossings(
  seriesA: LongitudeSeries,
  seriesB: LongitudeSeries,
  targetAngles: readonly number[]
): Crossing[] {
  const a = seriesA.samples;
  const b = seriesB.samples;
  if (a.length !== b.length) {
    throw new Error(`findCrossings: series lengths differ (${a.length} vs ${b.length})`);
  }

  const gapAt = (ms: number, target: number): number =>
    wrap180(norm360(seriesA.lonAt(ms) - seriesB.lonAt(ms)) - target);

  const crossings: Crossing[] = [];
  for (let i = 0; i + 1 < a.length; i++) {
    const sep0 = norm360(a[i].lon - b[i].lon);
    const sep1 = norm360(a[i + 1].lon - b[i + 1].lon);

    for (const target of targetAngles) {
      let g0 = wrap180(sep0 - target);
      const g1 = wrap180(sep1 - target);
      if ((g0 < 0) === (g1 < 0)) continue;
      if (Math.abs(g0 - g1) >= 180) continue;

      let lo = a[i].dateMs;
      let hi = a[i + 1].dateMs;
      for (let step = 0; step < BISECTION_STEPS; step++) {
        const mid = (lo + hi) / 2;
        const gMid = gapAt(mid, target);
        if ((gMid < 0) === (g0 < 0)) {
          lo = mid;
          g0 = gMid;
        } else {
          hi = mid;
        }
      }
      crossings.push({ dateMs: (lo + hi) / 2, angle: target });
    }
  }
  return crossings;
}

// ─── eclipse classification ───────────────────────────────────────────────────
//
// Standard ASTROLOGICAL node-proximity approximation: a new moon is a solar
// eclipse when the Sun is within ~18° of a lunar node, a full moon is a lunar
// eclipse within ~12°. This flags eclipses reliably at the dates the syzygy
// detection already refined, but does NOT determine type (total/partial/
// annular), magnitude, or visibility — sweph's dedicated eclipse functions
// (swe_sol_eclipse_when_glob / swe_lun_eclipse_when) are the upgrade path if
// that precision is ever wanted.
//
// Distances use the TRUE Node (consistent with natal/transit computation,
// SE_TRUE_NODE); the Mean Node would give slightly different distances near
// the limits.

export const SOLAR_ECLIPSE_LIMIT_DEG = 18; // new moon: Sun within this of a node
export const LUNAR_ECLIPSE_LIMIT_DEG = 12; // full moon: Sun within this of a node

// True Node longitude at an instant. Works under Moshier (no data files) —
// the node comes from lunar theory, not the asteroid ephemeris.
function trueNodeLongitudeAt(dateMs: number): number {
  const res = swe.calc_ut(jdUt(dateMs), swe.constants.SE_TRUE_NODE, CALC_FLAGS);
  if (res.flag < 0) throw new Error(`calc_ut failed for True Node: ${res.error}`);
  return res.data[0];
}

interface EclipseInfo {
  isEclipse: boolean;
  eclipseType: "solar" | "lunar";
  nodalDistance: number;
  nodeUsed: "North" | "South";
}

// Classify a refined syzygy instant (angle 0 = new moon, 180 = full moon).
// The nodal axis is a line: compare the Sun against both ends and take the
// nearer one.
function classifyEclipse(angle: 0 | 180, dateMs: number, sunLon: number): EclipseInfo {
  const northLon = trueNodeLongitudeAt(dateMs);
  const distNorth = Math.abs(wrap180(sunLon - northLon));
  const distSouth = Math.abs(wrap180(sunLon - (northLon + 180)));

  const [nodalDistance, nodeUsed]: [number, "North" | "South"] =
    distNorth <= distSouth ? [distNorth, "North"] : [distSouth, "South"];

  const eclipseType = angle === 0 ? "solar" as const : "lunar" as const;
  const limit = angle === 0 ? SOLAR_ECLIPSE_LIMIT_DEG : LUNAR_ECLIPSE_LIMIT_DEG;

  return { isEclipse: nodalDistance <= limit, eclipseType, nodalDistance, nodeUsed };
}

// ─── event composition ────────────────────────────────────────────────────────

const MOON_PHASES: Record<number, string> = {
  0:   "New Moon",
  90:  "First Quarter",
  180: "Full Moon",
  270: "Last Quarter",
};

// Aspect names by folded separation; 90/270 both fold to the square, etc.
const ASPECT_NAMES: Record<number, string> = {
  0:   "conjunct",
  90:  "square",
  120: "trine",
  180: "opposite",
};
const ASPECT_TARGETS = [0, 90, 120, 180, 240, 270] as const;

function fold(angle: number): number {
  return angle > 180 ? 360 - angle : angle;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function fmtDegSign(lon: number): string {
  const { sign, signDegree } = lonToSignInfo(lon);
  return `${signDegree.toFixed(1)}° ${sign}`;
}

export function scanEvents({ startDate, endDate, stepDays = 1 }: ScanInput): DetectedEvent[] {
  const sampled = sampleLongitudes({ bodies: SKY_BODIES, startDate, endDate, stepDays });
  if (sampled.length < 2) return [];

  const series = new Map<SkyBody, LongitudeSeries>(
    SKY_BODIES.map(body => [body, bodySeries(body, sampled)])
  );

  const events: DetectedEvent[] = [];

  // Moon phases: Sun–Moon elongation crossing the four phase angles. The
  // syzygies (new/full) are additionally classified for eclipses by node
  // proximity at the same refined instant — see classifyEclipse.
  for (const c of findCrossings(series.get("Moon")!, series.get("Sun")!, [0, 90, 180, 270])) {
    const phase = MOON_PHASES[c.angle];
    const moonLon = longitudeAt("Moon", c.dateMs);

    const event: DetectedEvent = {
      date: isoDate(c.dateMs),
      kind: "moon_phase",
      bodies: ["Moon", "Sun"],
      angle: c.angle,
      label: `${phase} at ${fmtDegSign(moonLon)}`,
      factors: ["Moon", "Sun"],
    };

    if (c.angle === 0 || c.angle === 180) {
      const sunLon = longitudeAt("Sun", c.dateMs);
      const eclipse = classifyEclipse(c.angle, c.dateMs, sunLon);
      Object.assign(event, eclipse);
      if (eclipse.isEclipse) {
        const kindLabel = eclipse.eclipseType === "solar" ? "Solar eclipse" : "Lunar eclipse";
        event.label =
          `${kindLabel} (${phase.toLowerCase()}) at ${fmtDegSign(moonLon)} ` +
          `near the ${eclipse.nodeUsed} Node`;
      }
    }

    events.push(event);
  }

  // Major aspects between planet pairs (Moonless, see ASPECT_BODIES).
  for (let i = 0; i < ASPECT_BODIES.length; i++) {
    for (let j = i + 1; j < ASPECT_BODIES.length; j++) {
      const nameA = ASPECT_BODIES[i];
      const nameB = ASPECT_BODIES[j];
      for (const c of findCrossings(series.get(nameA)!, series.get(nameB)!, ASPECT_TARGETS)) {
        const folded = fold(c.angle);
        const lonA = longitudeAt(nameA, c.dateMs);
        events.push({
          date: isoDate(c.dateMs),
          kind: "aspect",
          bodies: [nameA, nameB],
          angle: folded,
          label: `${nameA} ${ASPECT_NAMES[folded]} ${nameB} at ${fmtDegSign(lonA)}`,
          factors: [nameA, nameB],
        });
      }
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}
