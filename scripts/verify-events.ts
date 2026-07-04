// Verifies sky-event detection against an external ephemeris, plus the
// deterministic scoring contract. No model calls, no database — safe to run
// anywhere (stage-by-stage diagnosis incl. the LLM stages lives in
// scripts/diagnose-events.ts).
//
//   1. scanEvents over 2024-04-01 → 2024-07-01 (a window dense with
//      well-documented sky events) and spot-check dates against external
//      tables (timeanddate / NASA / astro.com): known new & full moons and a
//      famous planet aspect (Jupiter conjunct Uranus, 2024-04-20/21).
//   2. scoreStrength ranks an outer-planet aspect above a fast-planet one.
//   3. rankEvents returns a short, strongest-first list.
//
// Run: npm run verify:events

import { scanEvents, type DetectedEvent } from "../lib/events/detect";
import { scoreStrength } from "../lib/events/score";
import { rankEvents } from "../lib/events/find";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
}

function expectEvent(
  events: DetectedEvent[],
  label: string,
  expectedDate: string,
  pred: (e: DetectedEvent) => boolean,
  tolDays = 1
): void {
  const hit = events.find(e => pred(e) && daysBetween(e.date, expectedDate) <= tolDays);
  check(
    `${label} ≈ ${expectedDate}`,
    hit !== undefined,
    hit ? `detected ${hit.date}: ${hit.label}` : "not detected"
  );
}

function main() {
  console.log("─".repeat(64));
  console.log("  Step 1 — scanEvents vs. external ephemeris (2024-04 → 2024-07)");
  console.log("─".repeat(64));

  const t0 = Date.now();
  const events = scanEvents({ startDate: "2024-04-01", endDate: "2024-07-01" });
  console.log(`  scanned 3 months → ${events.length} events in ${Date.now() - t0}ms\n`);

  const isPhase = (angle: number) => (e: DetectedEvent) =>
    e.kind === "moon_phase" && e.angle === angle;

  // Lunar phases: timeanddate.com moon phase tables (UTC).
  expectEvent(events, "New Moon (solar eclipse)", "2024-04-08", isPhase(0));
  expectEvent(events, "Full Moon", "2024-04-23", isPhase(180));
  expectEvent(events, "New Moon", "2024-05-08", isPhase(0));
  expectEvent(events, "Full Moon", "2024-05-23", isPhase(180));
  expectEvent(events, "New Moon", "2024-06-06", isPhase(0));
  expectEvent(events, "Full Moon", "2024-06-22", isPhase(180));

  // A famous, externally verifiable aspect: Jupiter–Uranus conjunction in
  // Taurus, exact 2024-04-20/21 (first since 2011).
  expectEvent(events, "Jupiter conjunct Uranus", "2024-04-20",
    e => e.kind === "aspect" && e.angle === 0 &&
         e.bodies.includes("Jupiter") && e.bodies.includes("Uranus"));
  // And a second: Venus conjunct Jupiter, 2024-05-23 in late Taurus.
  expectEvent(events, "Venus conjunct Jupiter", "2024-05-23",
    e => e.kind === "aspect" && e.angle === 0 &&
         e.bodies.includes("Venus") && e.bodies.includes("Jupiter"));

  // Structural sanity for the single-primitive scan.
  const phases = events.filter(e => e.kind === "moon_phase");
  check("~4 moon phases per month", phases.length >= 11 && phases.length <= 14,
    `${phases.length} phases`);
  check("all events dated within the window",
    events.every(e => e.date >= "2024-03-31" && e.date <= "2024-07-02"));
  check("only moon_phase and aspect kinds",
    events.every(e => e.kind === "moon_phase" || e.kind === "aspect"));
  check("no Moon in planet aspects",
    events.every(e => e.kind !== "aspect" || !e.bodies.includes("Moon")));
  check("all events carry planet factors", events.every(e => e.factors.length > 0));

  console.log();
  console.log("─".repeat(64));
  console.log("  Step 2 — strength ordering (outer > fast)");
  console.log("─".repeat(64));

  const outerAspect: DetectedEvent = {
    date: "2024-05-01", kind: "aspect", bodies: ["Saturn", "Uranus"], angle: 90,
    label: "Saturn square Uranus", factors: ["Saturn", "Uranus"],
  };
  const fastAspect: DetectedEvent = {
    date: "2024-05-01", kind: "aspect", bodies: ["Sun", "Mercury"], angle: 0,
    label: "Sun conjunct Mercury", factors: ["Sun", "Mercury"],
  };
  const sOuter = scoreStrength(outerAspect);
  const sFast = scoreStrength(fastAspect);
  check("outer-planet square outranks fast-planet conjunction",
    sOuter > sFast, `${sOuter.toFixed(2)} > ${sFast.toFixed(2)}`);

  console.log();
  console.log("─".repeat(64));
  console.log("  Step 3 — deterministic ranking");
  console.log("─".repeat(64));

  const ranked = rankEvents(events, ["Venus", "Mars"]);
  for (const e of ranked) {
    console.log(
      `  ${e.date}  score ${e.score.toFixed(2)} (strength ${e.strength.toFixed(2)}, ` +
      `relevance ${e.relevance})  ${e.label}`
    );
  }
  check("returns a short ranked list", ranked.length > 0 && ranked.length <= 5);
  check("ranked strongest-first",
    ranked.every((e, i) => i === 0 || ranked[i - 1].score >= e.score));

  console.log();
  if (failures > 0) {
    console.error(`✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("✓ all checks passed");
}

main();
