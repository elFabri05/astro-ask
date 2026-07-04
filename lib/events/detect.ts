// Deterministic event detection over a time window. Steps through the window
// (daily by default), computes each day's transits with the existing engine
// (computeTransitData → Swiss Ephemeris), and finds the moments something
// discrete happens: an aspect going exact, a lunation, a station, an ingress.
//
// Everything here is astronomy: sign-change bracketing between consecutive
// steps plus linear interpolation pins each event to a date. No model is
// involved at any point — detection, timing, and the astrology tags attached
// to each event (rawFactors, consumed by lib/events/score.ts and
// lib/events/topic.ts) are all computed.

import {
  lonToSignInfo,
  assignHouse,
  type ChartData,
  type PlanetPosition,
} from "../ephemeris";
import { computeTransitData, type TransitData } from "../transits";

// ─── types ────────────────────────────────────────────────────────────────────

export type EventKind =
  | "transit-natal-aspect" // a transit-to-natal aspect reaching exact
  | "natal-house-ingress"  // a transiting planet crossing a natal house cusp
  | "lunation"             // new or full moon
  | "sky-conjunction"      // two transiting planets conjunct each other
  | "station"              // a planet's longitude speed crossing zero
  | "sign-ingress";        // an outer planet (Jupiter..Pluto) changing sign

export interface DetectedEvent {
  date: string;            // "YYYY-MM-DD" — interpolated to the exact crossing
  kind: EventKind;
  bodies: string[];        // transiting bodies involved
  natalPoint?: string;     // for transit-natal-aspect: the natal point contacted
  house?: number;          // the natal house the event lands in / ingresses into
  aspectType?: string;     // for aspect events: conjunction | opposition | ...
  motion?: "direct" | "retrograde"; // transiting body's motion at the event
  description: string;     // short human label, built from computed facts only
  rawFactors: string[];    // astrology tags for relevance/strength scoring
}

export interface ScanInput {
  natal: ChartData;
  startDate: string;       // "YYYY-MM-DD" inclusive
  endDate: string;         // "YYYY-MM-DD" inclusive
  stepDays?: number;
}

// ─── detection tuning (deterministic policy, in one place) ───────────────────
//
// The Moon crosses every natal point and house cusp roughly monthly — as
// individual "events" those are noise, so the Moon participates only through
// lunations. The Sun never stations; the True Node's oscillating speed would
// register as a constant stream of fake stations.

const ASPECT_ANGLES: ReadonlyArray<{ type: string; angle: number }> = [
  { type: "conjunction", angle: 0 },
  { type: "sextile",     angle: 60 },
  { type: "square",      angle: 90 },
  { type: "trine",       angle: 120 },
  { type: "opposition",  angle: 180 },
];

const NATAL_CONTACT_EXCLUDED = new Set(["Moon"]);
const HOUSE_INGRESS_EXCLUDED = new Set(["Moon"]);
const SKY_CONJUNCTION_EXCLUDED = new Set(["Moon"]);
const STATION_EXCLUDED = new Set(["Moon", "Sun", "True Node"]);
const SIGN_INGRESS_BODIES = new Set(["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]);

// Modern rulerships — used to tag contacts to the chart ruler (the planet
// ruling the Ascendant sign) so scoring can weight them up.
const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars",        Taurus: "Venus",     Gemini: "Mercury",
  Cancer: "Moon",       Leo: "Sun",          Virgo: "Mercury",
  Libra: "Venus",       Scorpio: "Pluto",    Sagittarius: "Jupiter",
  Capricorn: "Saturn",  Aquarius: "Uranus",  Pisces: "Neptune",
};

export const CHART_RULER_TAG = "Chart Ruler";

export function chartRulerOf(natal: ChartData): string {
  return SIGN_RULERS[lonToSignInfo(natal.ascendant).sign];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

// Signed angular difference folded into [-180, 180).
function wrap180(x: number): number {
  return ((x + 180) % 360 + 360) % 360 - 180;
}

// Fraction of the step at which d crosses zero between two samples, or null
// if it doesn't. Zero is treated as non-negative so an exact-zero sample is
// counted by exactly one of the two intervals it borders. The |d0−d1| < 180
// guard rejects the artificial jump wrap180 produces at ±180.
function zeroCrossing(d0: number, d1: number): number | null {
  if ((d0 < 0) === (d1 < 0)) return null;
  if (Math.abs(d0 - d1) >= 180) return null;
  return d0 / (d0 - d1);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Longitude linearly interpolated along the *short* arc between two samples.
function lerpLon(lon0: number, lon1: number, f: number): number {
  const lon = lon0 + f * wrap180(lon1 - lon0);
  return ((lon % 360) + 360) % 360;
}

const ORDINALS = [
  "1st", "2nd", "3rd", "4th", "5th", "6th",
  "7th", "8th", "9th", "10th", "11th", "12th",
];

export function houseTag(house: number): string {
  return `${ORDINALS[house - 1]} house`;
}

function fmtDegSign(lon: number): string {
  const { sign, signDegree } = lonToSignInfo(lon);
  return `${signDegree.toFixed(1)}° ${sign}`;
}

function dedupe(tags: string[]): string[] {
  return [...new Set(tags)];
}

// ─── scan ─────────────────────────────────────────────────────────────────────

interface NatalTarget {
  name: string;
  longitude: number;
  sign: string;
  house: number;
}

interface Snapshot {
  dateMs: number;                          // the sampled instant (noon UTC)
  byBody: Map<string, PlanetPosition>;
}

function snapshotAt(natal: ChartData, dateMs: number): Snapshot {
  const iso = new Date(dateMs).toISOString();
  const transit: TransitData = computeTransitData({
    natal,
    targetDate: iso.slice(0, 10),
    transitInstantUtc: iso,
  });
  return {
    dateMs,
    byBody: new Map(transit.transitingPositions.map(p => [p.body, p])),
  };
}

export function scanEvents({ natal, startDate, endDate, stepDays = 1 }: ScanInput): DetectedEvent[] {
  const startMs = Date.parse(`${startDate}T12:00:00Z`);
  const endMs   = Date.parse(`${endDate}T12:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new Error(`scanEvents: invalid date range ${startDate}..${endDate}`);
  }
  if (endMs <= startMs) return [];

  const stepMs = stepDays * DAY_MS;
  const natalCusps = [...natal.houses]
    .sort((a, b) => a.house - b.house)
    .map(h => h.longitude);
  const chartRuler = chartRulerOf(natal);

  // Aspect targets mirror computeTransitData's: natal planets + the angles.
  const natalTargets: NatalTarget[] = [
    ...natal.positions.map(p => ({
      name: p.body, longitude: p.longitude, sign: p.sign, house: p.house,
    })),
    { name: "Ascendant", longitude: natal.ascendant,
      sign: lonToSignInfo(natal.ascendant).sign, house: 1 },
    { name: "Midheaven", longitude: natal.midheaven,
      sign: lonToSignInfo(natal.midheaven).sign, house: 10 },
  ];

  const events: DetectedEvent[] = [];
  let prev = snapshotAt(natal, startMs);

  for (let ms = startMs + stepMs; ms <= endMs; ms += stepMs) {
    const curr = snapshotAt(natal, ms);

    for (const [body, p1] of curr.byBody) {
      const p0 = prev.byBody.get(body);
      if (!p0) continue; // optional body (Chiron) missing from a step

      // ── transit-to-natal aspects going exact ──────────────────────────────
      if (!NATAL_CONTACT_EXCLUDED.has(body)) {
        for (const target of natalTargets) {
          const d0 = wrap180(p0.longitude - target.longitude);
          const d1 = wrap180(p1.longitude - target.longitude);
          for (const { type, angle } of ASPECT_ANGLES) {
            // Exact when the separation hits +angle or −angle; both sides are
            // distinct crossings except at 0°/180° where they coincide.
            const sides = angle === 0 || angle === 180 ? [angle] : [angle, -angle];
            for (const side of sides) {
              const f = zeroCrossing(wrap180(d0 - side), wrap180(d1 - side));
              if (f === null) continue;
              const motion = p1.retrograde ? "retrograde" : "direct";
              const isRuler = target.name === chartRuler;
              events.push({
                date: isoDate(prev.dateMs + f * stepMs),
                kind: "transit-natal-aspect",
                bodies: [body],
                natalPoint: target.name,
                house: target.house,
                aspectType: type,
                motion,
                description:
                  `Transiting ${body} ${type} natal ${target.name}` +
                  (motion === "retrograde" ? " (retrograde pass)" : ""),
                rawFactors: dedupe([
                  body, target.name, type,
                  houseTag(target.house), target.sign,
                  p1.sign, houseTag(p1.house),
                  ...(isRuler ? [CHART_RULER_TAG] : []),
                ]),
              });
            }
          }
        }
      }

      // ── natal house ingress (daily precision is enough) ──────────────────
      if (!HOUSE_INGRESS_EXCLUDED.has(body) && p0.house !== p1.house) {
        events.push({
          date: isoDate(curr.dateMs),
          kind: "natal-house-ingress",
          bodies: [body],
          house: p1.house,
          motion: p1.retrograde ? "retrograde" : "direct",
          description:
            `${body} enters the natal ${houseTag(p1.house)}` +
            (p1.retrograde ? " (retrograde)" : ""),
          rawFactors: dedupe([body, houseTag(p1.house), p1.sign]),
        });
      }

      // ── stations: longitude speed crossing zero ───────────────────────────
      if (
        !STATION_EXCLUDED.has(body) &&
        p0.lonSpeed !== undefined && p1.lonSpeed !== undefined
      ) {
        const f = zeroCrossing(p0.lonSpeed, p1.lonSpeed);
        if (f !== null) {
          const stationLon = lerpLon(p0.longitude, p1.longitude, f);
          const { sign } = lonToSignInfo(stationLon);
          const house = assignHouse(stationLon, natalCusps);
          const turning = p1.lonSpeed < 0 ? "retrograde" : "direct";
          events.push({
            date: isoDate(prev.dateMs + f * stepMs),
            kind: "station",
            bodies: [body],
            house,
            motion: turning,
            description:
              `${body} stations ${turning} at ${fmtDegSign(stationLon)} (natal ${houseTag(house)})`,
            rawFactors: dedupe([body, sign, houseTag(house)]),
          });
        }
      }

      // ── outer-planet sign ingress ─────────────────────────────────────────
      if (SIGN_INGRESS_BODIES.has(body) && p0.sign !== p1.sign) {
        const direct = wrap180(p1.longitude - p0.longitude) >= 0;
        // The boundary crossed: entering sign's cusp when direct, the exited
        // sign's cusp when retrograde — same line, expressed from each side.
        const boundary = direct
          ? Math.floor(p1.longitude / 30) * 30
          : Math.floor(p0.longitude / 30) * 30;
        const f = zeroCrossing(
          wrap180(p0.longitude - boundary),
          wrap180(p1.longitude - boundary)
        );
        events.push({
          date: isoDate(prev.dateMs + (f ?? 1) * stepMs),
          kind: "sign-ingress",
          bodies: [body],
          motion: direct ? "direct" : "retrograde",
          description:
            `${body} enters ${p1.sign}` + (direct ? "" : " (retrograde)"),
          rawFactors: dedupe([body, p1.sign]),
        });
      }
    }

    // ── lunations: Sun–Moon elongation hitting 0° (new) or 180° (full) ──────
    const sun0 = prev.byBody.get("Sun"), moon0 = prev.byBody.get("Moon");
    const sun1 = curr.byBody.get("Sun"), moon1 = curr.byBody.get("Moon");
    if (sun0 && moon0 && sun1 && moon1) {
      const e0 = wrap180(moon0.longitude - sun0.longitude);
      const e1 = wrap180(moon1.longitude - sun1.longitude);
      for (const { phase, offset } of [
        { phase: "New Moon" as const,  offset: 0 },
        { phase: "Full Moon" as const, offset: 180 },
      ]) {
        const f = zeroCrossing(wrap180(e0 - offset), wrap180(e1 - offset));
        if (f === null) continue;
        const moonLon = lerpLon(moon0.longitude, moon1.longitude, f);
        const { sign } = lonToSignInfo(moonLon);
        const house = assignHouse(moonLon, natalCusps);
        events.push({
          date: isoDate(prev.dateMs + f * stepMs),
          kind: "lunation",
          bodies: ["Sun", "Moon"],
          house,
          aspectType: phase === "New Moon" ? "conjunction" : "opposition",
          description:
            `${phase} at ${fmtDegSign(moonLon)} (natal ${houseTag(house)})`,
          // Deliberately NOT tagged with Moon/Sun: every lunation involves
          // them, so those tags would let any Moon/Sun-flavored topic inflate
          // all lunations equally. What distinguishes one lunation from
          // another is its phase, sign, and natal house.
          rawFactors: dedupe([phase, sign, houseTag(house)]),
        });
      }
    }

    // ── conjunctions between transiting planets ──────────────────────────────
    const skyBodies = [...curr.byBody.keys()].filter(b => !SKY_CONJUNCTION_EXCLUDED.has(b));
    for (let i = 0; i < skyBodies.length; i++) {
      for (let j = i + 1; j < skyBodies.length; j++) {
        const a0 = prev.byBody.get(skyBodies[i]), b0 = prev.byBody.get(skyBodies[j]);
        const a1 = curr.byBody.get(skyBodies[i])!, b1 = curr.byBody.get(skyBodies[j])!;
        if (!a0 || !b0) continue;
        const f = zeroCrossing(
          wrap180(a0.longitude - b0.longitude),
          wrap180(a1.longitude - b1.longitude)
        );
        if (f === null) continue;
        const lon = lerpLon(a0.longitude, a1.longitude, f);
        const { sign } = lonToSignInfo(lon);
        const house = assignHouse(lon, natalCusps);
        events.push({
          date: isoDate(prev.dateMs + f * stepMs),
          kind: "sky-conjunction",
          bodies: [skyBodies[i], skyBodies[j]],
          house,
          aspectType: "conjunction",
          description:
            `${skyBodies[i]} conjunct ${skyBodies[j]} at ${fmtDegSign(lon)} (natal ${houseTag(house)})`,
          rawFactors: dedupe([skyBodies[i], skyBodies[j], sign, houseTag(house)]),
        });
      }
    }

    prev = curr;
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}
