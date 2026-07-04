// Verifies the event finder against reality and its own contract:
//
//   Step 1 — scanEvents over a fixed historical window (2024-04-01 → 2024-07-01,
//            chosen because it is dense with well-documented sky events) and
//            spot-checks dates against an external ephemeris (timeanddate /
//            NASA / Swiss Ephemeris tables): lunations, Mercury/Pluto/Saturn
//            stations, the Jupiter–Uranus conjunction, Jupiter's Gemini ingress.
//   Step 2 — deterministic ranking: with relationship-flavored factors, the
//            top of the list must lean Venus / 7th-house / Mars.
//   Step 3 — (needs GOOGLE_GENERATIVE_AI_API_KEY) mapTopicToFactors("my career")
//            returns career factors from the vocabulary, and no dates/claims.
//
// Run: npm run verify:events

import { computeNatalChart } from "../lib/ephemeris";
import { scanEvents, type DetectedEvent } from "../lib/events/detect";
import { rankEvents } from "../lib/events/find";
import { FACTOR_VOCABULARY, mapTopicToFactors } from "../lib/events/topic";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗ FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
}

// Find a detected event within `tolDays` of the expected date matching the
// predicate; the tolerance covers daily sampling + linear interpolation.
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
    hit ? `detected ${hit.date}: ${hit.description}` : "not detected"
  );
}

async function main() {
  console.log("─".repeat(64));
  console.log("  Step 1 — scanEvents vs. external ephemeris (2024-04 → 2024-07)");
  console.log("─".repeat(64));

  const natal = computeNatalChart({
    utcDateTime: "1990-06-15T11:30:00Z",
    latitude: -34.6037,   // Buenos Aires
    longitude: -58.3816,
  });

  const t0 = Date.now();
  const events = scanEvents({ natal, startDate: "2024-04-01", endDate: "2024-07-01" });
  console.log(`  scanned 3 months → ${events.length} events in ${Date.now() - t0}ms\n`);

  const isFull = (e: DetectedEvent) => e.kind === "lunation" && e.rawFactors.includes("Full Moon");
  const isNew  = (e: DetectedEvent) => e.kind === "lunation" && e.rawFactors.includes("New Moon");

  // Lunation dates: timeanddate.com moon phase tables (UTC).
  expectEvent(events, "New Moon (solar eclipse)", "2024-04-08", isNew);
  expectEvent(events, "Full Moon", "2024-04-23", isFull);
  expectEvent(events, "New Moon", "2024-05-08", isNew);
  expectEvent(events, "Full Moon", "2024-05-23", isFull);
  expectEvent(events, "New Moon", "2024-06-06", isNew);
  expectEvent(events, "Full Moon", "2024-06-22", isFull);

  // Stations: Swiss Ephemeris / astro.com planetary phenomena (UTC).
  expectEvent(events, "Mercury stations retrograde", "2024-04-01",
    e => e.kind === "station" && e.bodies[0] === "Mercury" && e.motion === "retrograde");
  expectEvent(events, "Mercury stations direct", "2024-04-25",
    e => e.kind === "station" && e.bodies[0] === "Mercury" && e.motion === "direct");
  expectEvent(events, "Pluto stations retrograde", "2024-05-02",
    e => e.kind === "station" && e.bodies[0] === "Pluto" && e.motion === "retrograde");
  expectEvent(events, "Saturn stations retrograde", "2024-06-29",
    e => e.kind === "station" && e.bodies[0] === "Saturn" && e.motion === "retrograde");

  // Sky geometry.
  expectEvent(events, "Jupiter conjunct Uranus (Taurus)", "2024-04-20",
    e => e.kind === "sky-conjunction" &&
         e.bodies.includes("Jupiter") && e.bodies.includes("Uranus"));
  expectEvent(events, "Venus conjunct Jupiter", "2024-05-23",
    e => e.kind === "sky-conjunction" &&
         e.bodies.includes("Venus") && e.bodies.includes("Jupiter"));
  expectEvent(events, "Jupiter enters Gemini", "2024-05-25",
    e => e.kind === "sign-ingress" && e.bodies[0] === "Jupiter");

  // Structural sanity: every event carries a date inside the window and tags.
  check("all events dated within the window",
    events.every(e => e.date >= "2024-03-31" && e.date <= "2024-07-02"));
  check("all events carry rawFactors", events.every(e => e.rawFactors.length > 0));
  check("no Moon-to-natal contact noise",
    events.every(e => !(e.kind === "transit-natal-aspect" && e.bodies[0] === "Moon")));

  console.log();
  console.log("─".repeat(64));
  console.log("  Step 2 — deterministic ranking (relationship factors)");
  console.log("─".repeat(64));

  const relationshipFactors = ["7th house", "Venus", "Mars", "Libra", "5th house"];
  const ranked = rankEvents(events, relationshipFactors);

  for (const e of ranked) {
    console.log(
      `  ${e.date}  score ${e.score.toFixed(2)} (strength ${e.strength.toFixed(2)}, ` +
      `relevance ${e.relevance})  ${e.description}`
    );
  }
  check("returns a short ranked list", ranked.length > 0 && ranked.length <= 5);
  check("ranked strongest-first",
    ranked.every((e, i) => i === 0 || ranked[i - 1].score >= e.score));
  check("top of list leans toward the topic",
    ranked.slice(0, 3).some(e =>
      e.relevance > 0 &&
      e.rawFactors.some(f => relationshipFactors.includes(f))));

  console.log();
  console.log("─".repeat(64));
  console.log("  Step 3 — mapTopicToFactors('my career')  [needs API key]");
  console.log("─".repeat(64));

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.log("  (skipped: GOOGLE_GENERATIVE_AI_API_KEY not set)");
  } else {
    const factors = await mapTopicToFactors("my career");
    console.log(`  factors: ${JSON.stringify(factors)}`);
    check("returns factors", factors.length >= 3);
    check("all factors are from the closed vocabulary",
      factors.every(f => FACTOR_VOCABULARY.includes(f)));
    check("career-relevant (10th house / Saturn / Midheaven / Capricorn)",
      factors.some(f => ["10th house", "Saturn", "Midheaven", "Capricorn"].includes(f)));
    check("no dates or event claims possible",
      factors.every(f => !/\d{4}/.test(f)));
  }

  console.log();
  if (failures > 0) {
    console.error(`✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("✓ all checks passed");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
