import type { ChartData } from "./ephemeris";

export interface AstroChartData {
  planets: Record<string, number[]>;
  cusps: number[];
}

// Our body names match astrochart's expected planet keys except this one.
const BODY_NAME_MAP: Record<string, string> = {
  "True Node": "NNode",
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
