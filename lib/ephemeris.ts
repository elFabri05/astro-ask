import * as swe from "sweph";
import path from "path";
import { computeAspects, type Aspect, type AspectOrbConfig } from "./aspects";

// Swiss ephemeris data directory — holds seas_18.se1 (Chiron/asteroids) and
// sepl_18.se1 (planets; required by sweph to reduce asteroid positions to
// geocentric). Only Chiron reads from it today; every other body stays on
// Moshier. See README for where to put the files.
const EPHE_PATH = process.env.SE_EPHE_PATH ?? path.join(process.cwd(), "ephe");
swe.set_ephe_path(EPHE_PATH);

// ─── aspect configuration ────────────────────────────────────────────────────
const NATAL_ORBS: readonly AspectOrbConfig[] = [
  { type: "conjunction", angle: 0,   orb: 8 },
  { type: "sextile",     angle: 60,  orb: 4 },
  { type: "square",      angle: 90,  orb: 6 },
  { type: "trine",       angle: 120, orb: 6 },
  { type: "opposition",  angle: 180, orb: 8 },
];

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

// Moshier flag — no ephemeris files required for the ten planets + True Node.
// To switch EVERYTHING to high-precision Swiss files: also download
// sepl_18/semo_18.se1 into EPHE_PATH and replace SEFLG_MOSEPH with
// SEFLG_SWIEPH here (and update EPHEMERIS_MODE).
export const CALC_FLAGS = swe.constants.SEFLG_MOSEPH | swe.constants.SEFLG_SPEED;
export const EPHEMERIS_MODE: "swieph" | "moseph" = "moseph";

// Chiron is the exception: Moshier has no asteroid theory, so it must use the
// Swiss file mode against seas_18.se1 (+ sepl_18.se1) in EPHE_PATH.
const CHIRON_FLAGS = swe.constants.SEFLG_SWIEPH | swe.constants.SEFLG_SPEED;

export const PLANET_BODIES: Array<{ id: number; name: string; optional?: true; flags?: number }> = [
  { id: swe.constants.SE_SUN,       name: "Sun"       },
  { id: swe.constants.SE_MOON,      name: "Moon"      },
  { id: swe.constants.SE_MERCURY,   name: "Mercury"   },
  { id: swe.constants.SE_VENUS,     name: "Venus"     },
  { id: swe.constants.SE_MARS,      name: "Mars"      },
  { id: swe.constants.SE_JUPITER,   name: "Jupiter"   },
  { id: swe.constants.SE_SATURN,    name: "Saturn"    },
  { id: swe.constants.SE_URANUS,    name: "Uranus"    },
  { id: swe.constants.SE_NEPTUNE,   name: "Neptune"   },
  { id: swe.constants.SE_PLUTO,     name: "Pluto"     },
  { id: swe.constants.SE_TRUE_NODE, name: "True Node" },
  { id: swe.constants.SE_CHIRON,    name: "Chiron", optional: true, flags: CHIRON_FLAGS },
];

// One warning per body per process — a missing seas_*.se1 would otherwise
// log on every chart/transit computation.
const warnedMissingBodies = new Set<string>();

// calc_ut for one PLANET_BODIES entry. Required bodies throw on failure, as
// before. Optional bodies (Chiron) degrade gracefully: warn once and return
// null so callers omit them — a missing ephemeris file must never break
// chart, transit, or scan computation.
export function calcBodyLongitude(
  jd_ut: number,
  planet: (typeof PLANET_BODIES)[number]
): { lon: number; lonSpeed: number } | null {
  const res = swe.calc_ut(jd_ut, planet.id, planet.flags ?? CALC_FLAGS);
  if (res.flag < 0) {
    if (planet.optional) {
      if (!warnedMissingBodies.has(planet.name)) {
        warnedMissingBodies.add(planet.name);
        console.warn(
          `[ephemeris] ${planet.name} unavailable, omitting from charts ` +
          `(expected data file in ${EPHE_PATH}): ${res.error}`
        );
      }
      return null;
    }
    throw new Error(`calc_ut failed for ${planet.name}: ${res.error}`);
  }
  const [lon, , , lonSpeed] = res.data;
  return { lon, lonSpeed };
}

// ─── interfaces ───────────────────────────────────────────────────────────────

export interface PlanetPosition {
  body: string;
  longitude: number;
  sign: string;
  signDegree: number;
  house: number;
  retrograde: boolean;
  // Longitude speed in °/day. Optional: chart/transit JSON cached before this
  // field existed lacks it; freshly computed positions always carry it.
  lonSpeed?: number;
}

export interface HouseCusp {
  house: number;
  longitude: number;
  sign: string;
  signDegree: number;
}

export type { Aspect };

export interface ChartData {
  positions: PlanetPosition[];
  houses: HouseCusp[];
  ascendant: number;
  midheaven: number;
  aspects: Aspect[];
  meta: {
    utcDateTime: string;
    latitude: number;
    longitude: number;
    houseSystem: string;
    ephemeris: "swieph" | "moseph";
  };
}

// ─── internal helpers ─────────────────────────────────────────────────────────

export function lonToSignInfo(lon: number): { sign: string; signDegree: number } {
  return {
    sign: SIGNS[Math.floor(lon / 30)],
    signDegree: lon % 30,
  };
}

export function assignHouse(lon: number, cusps: number[]): number {
  for (let h = 0; h < 12; h++) {
    const cusp     = cusps[h];
    const nextCusp = cusps[(h + 1) % 12];

    if (cusp <= nextCusp) {
      if (lon >= cusp && lon < nextCusp) return h + 1;
    } else {
      // cusp span crosses 0° (e.g. 350°→10°)
      if (lon >= cusp || lon < nextCusp) return h + 1;
    }
  }
  return 1;
}

// ─── public API ───────────────────────────────────────────────────────────────

export function computeNatalChart(input: {
  utcDateTime: string;
  latitude: number;
  longitude: number;
  houseSystem?: string;
}): ChartData {
  const { utcDateTime, latitude, longitude, houseSystem = "P" } = input;

  // Parse ISO 8601 UTC string via Date (handles 'Z' and offset variants)
  const d = new Date(utcDateTime);
  const year  = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1; // Swiss Ephemeris is 1-indexed
  const day   = d.getUTCDate();
  const hour  = d.getUTCHours();
  const min   = d.getUTCMinutes();
  const sec   = d.getUTCSeconds();

  const jdRes = swe.utc_to_jd(year, month, day, hour, min, sec, swe.constants.SE_GREG_CAL);
  if (jdRes.flag < 0) {
    throw new Error(`utc_to_jd failed: ${jdRes.error}`);
  }
  const [, jd_ut] = jdRes.data; // calc_ut and houses_ex both take UT Julian Day

  // ── planet positions ────────────────────────────────────────────────────────
  const positions: PlanetPosition[] = [];

  for (const planet of PLANET_BODIES) {
    const calc = calcBodyLongitude(jd_ut, planet);
    if (calc === null) continue; // optional body (Chiron) unavailable — omitted
    const { lon, lonSpeed } = calc;
    const { sign, signDegree } = lonToSignInfo(lon);
    positions.push({
      body: planet.name,
      longitude: lon,
      sign,
      signDegree,
      house: 0, // assigned below once cusps are known
      retrograde: lonSpeed < 0,
      lonSpeed,
    });
  }

  // ── house cusps + angles ───────────────────────────────────────────────────
  // houses_ex is typed with overloads; cast houseSystem to avoid union return type
  const hsys = houseSystem as "P";
  const hRes = swe.houses_ex(jd_ut, 0, latitude, longitude, hsys);
  if (hRes.flag < 0) {
    throw new Error(`houses_ex failed for hsys=${houseSystem} at lat=${latitude}`);
  }

  const cusps     = Array.from(hRes.data.houses) as number[]; // [cusp1, ..., cusp12]
  const points    = hRes.data.points as unknown as number[];   // [asc, mc, armc, ...]
  const ascendant = points[0];
  const midheaven = points[1];

  // assign each planet to a house
  for (const pos of positions) {
    pos.house = assignHouse(pos.longitude, cusps);
  }

  const houses: HouseCusp[] = cusps.map((lon, i) => ({
    house: i + 1,
    longitude: lon,
    ...lonToSignInfo(lon),
  }));

  return {
    positions,
    houses,
    ascendant,
    midheaven,
    aspects: computeAspects(positions, positions, NATAL_ORBS),
    meta: {
      utcDateTime,
      latitude,
      longitude,
      houseSystem,
      ephemeris: EPHEMERIS_MODE,
    },
  };
}
