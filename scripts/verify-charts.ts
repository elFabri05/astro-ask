import { createBirthChart, getBirthChart } from "../lib/charts";
import type { ChartData } from "../lib/ephemeris";

const SIGNS = [
  "Aries","Taurus","Gemini","Cancer","Leo","Virgo",
  "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces",
];
function fmt(lon: number) {
  return `${(lon % 30).toFixed(2)}° ${SIGNS[Math.floor(lon / 30)]}`;
}

function printChart(label: string, cd: ChartData) {
  const sun  = cd.positions.find(p => p.body === "Sun");
  const moon = cd.positions.find(p => p.body === "Moon");
  console.log(`  Sun       : ${sun  ? fmt(sun.longitude)  : "—"}`);
  console.log(`  Moon      : ${moon ? fmt(moon.longitude) : "—"}`);
  console.log(`  Ascendant : ${fmt(cd.ascendant)}`);
}

async function main() {
  console.log("─".repeat(60));
  console.log("  Step 1 — createBirthChart (London reference)");
  console.log("─".repeat(60));

  const record = await createBirthChart({
    name:      "London Reference",
    birthDate: "1990-01-15",
    birthTime: "14:30",
    place: {
      label:     "London, UK",
      latitude:  51.5074,
      longitude: -0.1278,
    },
  });

  console.log(`  id          : ${record.id}`);
  console.log(`  timezone    : ${record.timezone}`);
  console.log(`  utcDateTime : ${record.utcDateTime}`);
  printChart("write", record.chartData);

  console.log("\n" + "─".repeat(60));
  console.log("  Step 2 — getBirthChart (round-trip read)");
  console.log("─".repeat(60));

  const fetched = await getBirthChart(record.id);
  if (!fetched) {
    console.error("  ERROR: record not found after write");
    process.exit(1);
  }

  const match = fetched.utcDateTime === record.utcDateTime
    && JSON.stringify(fetched.chartData) === JSON.stringify(record.chartData);

  console.log(`  id          : ${fetched.id}`);
  console.log(`  timezone    : ${fetched.timezone}`);
  console.log(`  utcDateTime : ${fetched.utcDateTime}`);
  printChart("read", fetched.chartData);
  console.log(`\n  Round-trip match: ${match ? "YES ✓" : "NO — mismatch detected"}`);

  if (!match) process.exit(1);

  console.log("\n" + "─".repeat(60));
  console.log("  Expectations:");
  console.log("    timezone    = Europe/London");
  console.log("    utcDateTime = 1990-01-15T14:30:00Z  (Jan in London = GMT)");
  console.log("    Sun         = ~25° Capricorn");
  console.log("─".repeat(60));
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
