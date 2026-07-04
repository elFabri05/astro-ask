// Deterministic strength scoring for detected sky events. Pure function of
// the event — every weight lives in the WEIGHTS table below, nothing is
// learned or model-derived. Scores are relative (roughly 0–10); only their
// ordering and rough magnitude matter, see rankEvents in lib/events/find.ts.
//
// All detected events are exact by construction (crossings are bisection-
// refined to the instant), so there is no orb falloff: "tighter is stronger"
// is uniformly satisfied at orb zero.

import type { DetectedEvent } from "./detect";

export const WEIGHTS = {
  // Slower bodies make rarer, longer-lasting configurations — they dominate.
  // An outer–outer aspect (decades apart) must outrank anything a fast body
  // does; a Sun–Mercury conjunction is routine.
  body: {
    Pluto: 10, Neptune: 9.5, Uranus: 9, Saturn: 8.5, Jupiter: 7.5,
    Mars: 5, Sun: 4.5, Venus: 4, Mercury: 3.5, Moon: 1.5,
  } as Record<string, number>,

  // Hard aspects outrank soft; the conjunction outranks everything.
  aspect: { 0: 1.0, 180: 0.9, 90: 0.85, 120: 0.7 } as Record<number, number>,

  // Moon phases by elongation angle: the syzygies (new/full) carry the
  // month; the quarters are secondary beats.
  moonPhase: { 0: 5, 90: 3, 180: 5.5, 270: 3 } as Record<number, number>,
} as const;

function bodyWeight(body: string): number {
  return WEIGHTS.body[body] ?? 3;
}

export function scoreStrength(event: DetectedEvent): number {
  switch (event.kind) {
    case "moon_phase":
      return WEIGHTS.moonPhase[event.angle] ?? 3;
    case "aspect": {
      const mean = (bodyWeight(event.bodies[0]) + bodyWeight(event.bodies[1])) / 2;
      return mean * (WEIGHTS.aspect[event.angle] ?? 0.5);
    }
  }
}
