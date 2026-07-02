import type { ChartData } from "./ephemeris";
import type { FormedAspect } from "@astrodraw/astrochart";

export interface AstroChartData {
  planets: Record<string, number[]>;
  cusps: number[];
}

// Our body names match astrochart's expected planet keys except this one.
const BODY_NAME_MAP: Record<string, string> = {
  "True Node": "NNode",
};

// Mirrors lib/ephemeris.ts's NATAL_ORBS (the orb config actually used to
// compute chart.aspects) — kept here rather than imported since it's paired
// with presentation-only data (line color) that has no place in ephemeris.ts.
const ASPECT_META: Record<string, { degree: number; orbit: number; color: string }> = {
  conjunction: { degree: 0,   orbit: 8, color: "#6b7280" },
  sextile:     { degree: 60,  orbit: 4, color: "#27AE60" },
  square:      { degree: 90,  orbit: 6, color: "#FF4500" },
  trine:       { degree: 120, orbit: 6, color: "#27AE60" },
  opposition:  { degree: 180, orbit: 8, color: "#FF4500" },
};

// Pure data transform — no rendering. astrochart wants planets as
// { Name: [longitude, velocity] } (negative velocity = retrograde marker)
// and cusps as exactly 12 longitudes in house order.
export function toAstroChartData(chart: ChartData): AstroChartData {
  const planets: Record<string, number[]> = {};
  for (const p of chart.positions) {
    const name = BODY_NAME_MAP[p.body] ?? p.body;
    planets[name] = [p.longitude, p.retrograde ? -1 : 1];
  }

  const cusps = [...chart.houses]
    .sort((a, b) => a.house - b.house)
    .map(h => h.longitude);

  return { planets, cusps };
}

// Maps OUR already-computed aspects (chart.aspects, from lib/ephemeris.ts's
// NATAL_ORBS) into astrochart's FormedAspect shape. Passed as customAspects
// to Radix#aspects() so the library draws exactly these lines instead of
// recomputing aspects with its own default orbs.
export function toAstroChartAspects(chart: ChartData): FormedAspect[] {
  const longitudeByBody = new Map(chart.positions.map(p => [p.body, p.longitude]));

  const formed: FormedAspect[] = [];
  for (const a of chart.aspects) {
    const meta = ASPECT_META[a.type];
    const pos1 = longitudeByBody.get(a.body1);
    const pos2 = longitudeByBody.get(a.body2);
    if (!meta || pos1 === undefined || pos2 === undefined) continue;

    formed.push({
      point:     { name: BODY_NAME_MAP[a.body1] ?? a.body1, position: pos1 },
      toPoint:   { name: BODY_NAME_MAP[a.body2] ?? a.body2, position: pos2 },
      aspect:    { name: a.type, degree: meta.degree, orbit: meta.orbit, color: meta.color },
      precision: a.orb.toString(),
    });
  }

  return formed;
}
