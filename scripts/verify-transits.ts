import { createBirthChart } from "../lib/charts";
import { getOrCreateTransitChart } from "../lib/transits";

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

function fmt(lon: number): string {
  return `${(lon % 30).toFixed(2)}° ${SIGNS[Math.floor(lon / 30)]}`;
}

async function main() {
  console.log("─".repeat(60));
  console.log("  Step 1 — natal chart (London Reference)");
  console.log("─".repeat(60));

  const natal = await createBirthChart({
    name:      "London Reference",
    birthDate: "1990-01-15",
    birthTime: "14:30",
    place: {
      label:     "London, UK",
      latitude:  51.5074,
      longitude: -0.1278,
    },
  });
  console.log(`  chartId : ${natal.id}`);

  console.log("\n" + "─".repeat(60));
  console.log("  Step 2 — getOrCreateTransitChart (2025-01-15)");
  console.log("─".repeat(60));

  const targetDate = "2025-01-15";
  const t1 = await getOrCreateTransitChart(natal.id, targetDate);

  const sun    = t1.transitData.transitingPositions.find(p => p.body === "Sun");
  const moon   = t1.transitData.transitingPositions.find(p => p.body === "Moon");
  const saturn = t1.transitData.transitingPositions.find(p => p.body === "Saturn");

  console.log(`  transitInstant : ${t1.transitData.transitInstant}`);
  console.log(`  Sun    : ${sun    ? fmt(sun.longitude)    : "—"}  (natal house ${sun?.house})`);
  console.log(`  Moon   : ${moon   ? fmt(moon.longitude)   : "—"}  (natal house ${moon?.house})`);
  console.log(`  Saturn : ${saturn ? fmt(saturn.longitude) : "—"}  (natal house ${saturn?.house})`);

  console.log(`\n  Transit → Natal aspects (${t1.transitData.transitToNatalAspects.length}):`);
  for (const a of t1.transitData.transitToNatalAspects) {
    console.log(`    ${a.body1.padEnd(10)} ${a.type.padEnd(11)} ${a.body2.padEnd(10)}  orb ${a.orb.toFixed(2)}°`);
  }

  console.log("\n" + "─".repeat(60));
  console.log("  Step 3 — repeat call (cache check)");
  console.log("─".repeat(60));

  const t2 = await getOrCreateTransitChart(natal.id, targetDate);
  const cacheHit = t2.id === t1.id;

  console.log(`  first id  : ${t1.id}`);
  console.log(`  second id : ${t2.id}`);
  console.log(`  Cache hit: ${cacheHit ? "YES ✓" : "NO — recomputed!"}`);

  const sunOk = sun !== undefined && sun.sign === "Capricorn" && Math.abs(sun.signDegree - 25) < 2;

  console.log("\n" + "─".repeat(60));
  console.log(`  Sanity check — transiting Sun ~25° Capricorn: ${sunOk ? "PASS ✓" : "FAIL ✗"}`);
  console.log("─".repeat(60));

  if (!cacheHit || !sunOk) process.exit(1);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
