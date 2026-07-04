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
//   4. mapTopicToFactors is a deterministic lookup: career topics map to
//      career factors, unmatched topics fall back to DEFAULT_FACTORS (never
//      empty), the table only uses vocabulary factors, and repeated rapid
//      calls are instant and identical (no model, no quota).
//
// Run: npm run verify:events

import { scanEvents, type DetectedEvent } from "../lib/events/detect";
import { scoreStrength } from "../lib/events/score";
import { rankEvents } from "../lib/events/find";
import { mapTopicToFactors, FACTOR_VOCABULARY } from "../lib/events/topic";
import { TOPIC_TABLE, DEFAULT_FACTORS } from "../lib/events/topicTable";

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
  console.log("─".repeat(64));
  console.log("  Step 4 — deterministic topic mapping (no model, no quota)");
  console.log("─".repeat(64));

  const career = mapTopicToFactors("my career");
  console.log(`  "my career" → ${JSON.stringify(career)}`);
  check("career topic maps to career factors",
    ["Saturn", "Sun", "Midheaven", "10th house"].every(f => career.includes(f)));

  const iguana = mapTopicToFactors("my pet iguana");
  console.log(`  "my pet iguana" → ${JSON.stringify(iguana)}`);
  check("unmatched topic falls back to DEFAULT_FACTORS (never empty)",
    iguana.length > 0 &&
    iguana.length === DEFAULT_FACTORS.length &&
    DEFAULT_FACTORS.every(f => iguana.includes(f)));

  check("empty topic also falls back, never []",
    mapTopicToFactors("").length > 0);

  check("table only uses factors from the closed vocabulary",
    TOPIC_TABLE.every(e => e.factors.every(f => FACTOR_VOCABULARY.includes(f))) &&
    DEFAULT_FACTORS.every(f => FACTOR_VOCABULARY.includes(f)));

  // The mapping stage can no longer rate-limit: hammer it and require
  // identical, effectively-instant results every time.
  const tMap = Date.now();
  const repeats = Array.from({ length: 1000 }, () => mapTopicToFactors("my career"));
  const mapMs = Date.now() - tMap;
  check("1000 rapid calls: identical results, no network",
    repeats.every(r => JSON.stringify(r) === JSON.stringify(career)),
    `${mapMs}ms total`);

  console.log();
  if (failures > 0) {
    console.error(`✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("✓ all checks passed");
}

main();
