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
  console.log("  Step 2 — getOrCreateTransitChart, date only (2025-01-15)");
  console.log("─".repeat(60));

  const targetDate = "2025-01-15";
  const t1 = await getOrCreateTransitChart(natal.id, { targetDate });

  const sun    = t1.transitData.transitingPositions.find(p => p.body === "Sun");
  const moon   = t1.transitData.transitingPositions.find(p => p.body === "Moon");
  const saturn = t1.transitData.transitingPositions.find(p => p.body === "Saturn");

  console.log(`  transitInstantUtc : ${t1.transitInstantUtc}`);
  console.log(`  latitude/longitude: ${t1.latitude}, ${t1.longitude}`);
  console.log(`  Sun    : ${sun    ? fmt(sun.longitude)    : "—"}  (natal house ${sun?.house})`);
  console.log(`  Moon   : ${moon   ? fmt(moon.longitude)   : "—"}  (natal house ${moon?.house})`);
  console.log(`  Saturn : ${saturn ? fmt(saturn.longitude) : "—"}  (natal house ${saturn?.house})`);

  console.log(`\n  Transit → Natal aspects (${t1.transitData.transitToNatalAspects.length}):`);
  for (const a of t1.transitData.transitToNatalAspects) {
    console.log(`    ${a.body1.padEnd(10)} ${a.type.padEnd(11)} ${a.body2.padEnd(10)}  orb ${a.orb.toFixed(2)}°`);
  }

  const defaultInstantOk = t1.transitInstantUtc === `${targetDate}T12:00:00Z`;
  const defaultLocationOk = t1.latitude === natal.latitude && t1.longitude === natal.longitude;

  console.log("\n" + "─".repeat(60));
  console.log("  Step 3 — repeat call, date only (cache check)");
  console.log("─".repeat(60));

  const t2 = await getOrCreateTransitChart(natal.id, { targetDate });
  const cacheHit = t2.id === t1.id;

  console.log(`  first id  : ${t1.id}`);
  console.log(`  second id : ${t2.id}`);
  console.log(`  Cache hit: ${cacheHit ? "YES ✓" : "NO — recomputed!"}`);

  console.log("\n" + "─".repeat(60));
  console.log("  Step 4 — same date, time + place override (Tokyo, 09:00)");
  console.log("─".repeat(60));

  // 09:00 JST (UTC+9) = 00:00 UTC — 12 hours off the noon-UTC default, so the
  // transiting Moon (~0.5°/hr) should have moved measurably. Planetary
  // longitudes here are geocentric (no SEFLG_TOPOCTR), so it's the shifted
  // UTC instant driving the difference, not Tokyo's coordinates per se.
  const tokyo = { label: "Tokyo, Japan", latitude: 35.6762, longitude: 139.6503 };
  const t3 = await getOrCreateTransitChart(natal.id, {
    targetDate,
    localTime: "09:00",
    place: tokyo,
  });
  const t3Moon = t3.transitData.transitingPositions.find(p => p.body === "Moon");

  console.log(`  id                : ${t3.id}`);
  console.log(`  transitInstantUtc : ${t3.transitInstantUtc}`);
  console.log(`  Moon              : ${t3Moon ? fmt(t3Moon.longitude) : "—"}`);

  const distinctFromDefault = t3.id !== t1.id;
  const moonMoved = t3Moon !== undefined && moon !== undefined && t3Moon.longitude !== moon.longitude;

  console.log("\n" + "─".repeat(60));
  console.log("  Step 5 — revisit same date+time+place (cache check)");
  console.log("─".repeat(60));

  const t4 = await getOrCreateTransitChart(natal.id, {
    targetDate,
    localTime: "09:00",
    place: tokyo,
  });
  const overrideCacheHit = t4.id === t3.id;

  console.log(`  first id  : ${t3.id}`);
  console.log(`  second id : ${t4.id}`);
  console.log(`  Cache hit: ${overrideCacheHit ? "YES ✓" : "NO — recomputed!"}`);

  const sunOk = sun !== undefined && sun.sign === "Capricorn" && Math.abs(sun.signDegree - 25) < 2;

  console.log("\n" + "─".repeat(60));
  console.log(`  Sanity check — transiting Sun ~25° Capricorn         : ${sunOk ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  Default instant == \${date}T12:00:00Z byte-for-byte  : ${defaultInstantOk ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  Default location == natal lat/lng                    : ${defaultLocationOk ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  Date-only cache hit                                  : ${cacheHit ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  Time+place override is a distinct TransitChart       : ${distinctFromDefault ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  Time+place override shifts the transiting Moon       : ${moonMoved ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`  Revisiting the same override reuses the same chart   : ${overrideCacheHit ? "PASS ✓" : "FAIL ✗"}`);
  console.log("─".repeat(60));

  if (!cacheHit || !sunOk || !defaultInstantOk || !defaultLocationOk ||
      !distinctFromDefault || !moonMoved || !overrideCacheHit) {
    process.exit(1);
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
