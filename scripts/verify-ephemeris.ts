import { computeNatalChart, type ChartData } from "../lib/ephemeris";

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

function fmt(lon: number): string {
  const sign = SIGNS[Math.floor(lon / 30)];
  const deg  = (lon % 30).toFixed(2);
  return `${deg}° ${sign}`;
}

function printChart(label: string, utcDateTime: string, latitude: number, longitude: number): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`  UTC: ${utcDateTime}  lat: ${latitude}  lng: ${longitude}`);
  console.log("─".repeat(60));

  let chart: ChartData;
  try {
    chart = computeNatalChart({ utcDateTime, latitude, longitude });
  } catch (err) {
    console.error("  ERROR:", err);
    return;
  }

  const sun  = chart.positions.find(p => p.body === "Sun");
  const moon = chart.positions.find(p => p.body === "Moon");

  console.log(`  Sun       : ${sun  ? fmt(sun.longitude)  : "—"}  (house ${sun?.house})`);
  console.log(`  Moon      : ${moon ? fmt(moon.longitude) : "—"}  (house ${moon?.house})`);
  console.log(`  Ascendant : ${fmt(chart.ascendant)}`);
  console.log(`  Midheaven : ${fmt(chart.midheaven)}`);
  console.log(`  Planets   : ${chart.positions.length}`);
  console.log(`  Aspects   : ${chart.aspects.length}`);
  console.log(`  Ephemeris : ${chart.meta.ephemeris}`);

  console.log("\n  All planet positions:");
  for (const p of chart.positions) {
    const rx = p.retrograde ? " ℞" : "  ";
    console.log(`    ${p.body.padEnd(10)}${rx}  ${p.signDegree.toFixed(2).padStart(5)}° ${p.sign.padEnd(12)}  H${p.house}`);
  }
}

// ── reference charts ─────────────────────────────────────────────────────────

printChart(
  "Chart 1 — London, UK  (local 14:30 GMT = UTC)",
  "1990-01-15T14:30:00Z",
  51.5074,
  -0.1278,
);

printChart(
  "Chart 2 — Sydney, AU  (local 13:00 AEST = 03:00 UTC)",
  "1985-07-20T03:00:00Z",
  -33.8688,
  151.2093,
);

printChart(
  "Chart 3 — Reykjavik, IS  (local 12:00 = UTC, Iceland has no DST)",
  "2000-06-21T12:00:00Z",
  64.1466,
  -21.9426,
);

console.log(`\n${"─".repeat(60)}`);
console.log("  Done. Verify Sun/Moon/ASC against astro.com using the");
console.log("  local times and cities shown in each header above.");
console.log("─".repeat(60));
