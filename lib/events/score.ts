// Deterministic strength scoring for detected events. Pure function of the
// event — every weight lives in the WEIGHTS table below, nothing is learned
// or model-derived. Scores are relative (roughly 0–13); only their ordering
// and rough magnitude matter, see rankEvents in lib/events/find.ts.

import { CHART_RULER_TAG, type DetectedEvent } from "./detect";

export const WEIGHTS = {
  // Slower bodies make rarer, longer-lasting contacts — they dominate.
  transitBody: {
    Pluto: 10, Neptune: 9.5, Uranus: 9, Saturn: 8.5, Jupiter: 7.5,
    Chiron: 6.5, "True Node": 6, Mars: 5, Sun: 4.5, Venus: 4,
    Mercury: 3.5, Moon: 1.5,
  } as Record<string, number>,

  // What is touched matters as much as what touches it: the luminaries and
  // the angles define the chart; personal planets next; outer natal placements
  // are generational and count least. Scaled /10 when combined (see below).
  natalTarget: {
    Sun: 10, Moon: 10, Ascendant: 10, Midheaven: 10,
    Mercury: 6.5, Venus: 6.5, Mars: 6.5,
    Jupiter: 4.5, Saturn: 4.5, Chiron: 4, "True Node": 4,
    Uranus: 3, Neptune: 3, Pluto: 3,
  } as Record<string, number>,

  // Added to the natal-target weight when the contacted point rules the
  // Ascendant sign (tagged at detection time).
  chartRulerBonus: 3,

  // Hard aspects outrank soft; the conjunction outranks everything.
  aspect: {
    conjunction: 1.0, opposition: 0.9, square: 0.85, trine: 0.7, sextile: 0.55,
  } as Record<string, number>,

  // All detected events are exact by construction (crossings are interpolated
  // to the day), so there is no orb falloff — exactness is uniform.

  // Kind-level factors and bases. Transit-to-natal contacts are the heart of
  // the feature — rare, personal, precisely datable — so they get a factor up
  // relative to ambient sky events; lunations recur monthly and are kept in
  // the mid-range so only well-placed or topic-relevant ones rise.
  transitContactFactor: 1.25,     // × the aspect score below
  lunationBase: { "Full Moon": 5, "New Moon": 4.5 },
  lunationAngularHouseBonus: 1.5, // a lunation on the natal 1st/4th/7th/10th
  stationFactor: 0.9,             // × transitBody
  signIngressFactor: 1.0,         // × transitBody (already outer-only)
  houseIngressFactor: 0.9,        // × transitBody
  houseIngressAngularBonus: 1.25, // × when entering an angular house
  skyConjunctionFactor: 0.8,      // × mean of the two bodies' weights
} as const;

const ANGULAR_HOUSES = new Set([1, 4, 7, 10]);

function bodyWeight(body: string): number {
  return WEIGHTS.transitBody[body] ?? 3;
}

export function scoreStrength(event: DetectedEvent): number {
  switch (event.kind) {
    case "transit-natal-aspect": {
      const target = (event.natalPoint && WEIGHTS.natalTarget[event.natalPoint]) || 3;
      const ruler = event.rawFactors.includes(CHART_RULER_TAG) ? WEIGHTS.chartRulerBonus : 0;
      const aspect = (event.aspectType && WEIGHTS.aspect[event.aspectType]) || 0.5;
      return WEIGHTS.transitContactFactor *
        bodyWeight(event.bodies[0]) * aspect * (target + ruler) / 10;
    }
    case "lunation": {
      const base = event.rawFactors.includes("Full Moon")
        ? WEIGHTS.lunationBase["Full Moon"]
        : WEIGHTS.lunationBase["New Moon"];
      const angular = event.house !== undefined && ANGULAR_HOUSES.has(event.house);
      return base + (angular ? WEIGHTS.lunationAngularHouseBonus : 0);
    }
    case "station":
      return bodyWeight(event.bodies[0]) * WEIGHTS.stationFactor;
    case "sign-ingress":
      return bodyWeight(event.bodies[0]) * WEIGHTS.signIngressFactor;
    case "natal-house-ingress": {
      const angular = event.house !== undefined && ANGULAR_HOUSES.has(event.house);
      return bodyWeight(event.bodies[0]) * WEIGHTS.houseIngressFactor *
        (angular ? WEIGHTS.houseIngressAngularBonus : 1);
    }
    case "sky-conjunction": {
      const mean = (bodyWeight(event.bodies[0]) + bodyWeight(event.bodies[1])) / 2;
      return mean * WEIGHTS.skyConjunctionFactor;
    }
  }
}
