// Grounding check, no API call: builds sample natal + transit data via the
// existing (already-verified) compute functions, then prints
// buildTransitContext's output. Confirms both the natal placements and the
// transit-to-natal aspect list appear as explicit facts the model can quote.

import { computeNatalChart } from "../lib/ephemeris";
import { computeTransitData } from "../lib/transits";
import { buildTransitSystemPrompt, buildTransitContext } from "../lib/prompts";

const natal = computeNatalChart({
  utcDateTime: "1990-01-15T14:30:00Z",
  latitude:    51.5074,
  longitude:   -0.1278,
});

const transit = computeTransitData({
  natal,
  targetDate: "2025-01-15",
  transitInstantUtc: "2025-01-15T12:00:00Z",
});

console.log("─".repeat(60));
console.log("  buildTransitSystemPrompt()");
console.log("─".repeat(60));
console.log(buildTransitSystemPrompt());

console.log("\n" + "─".repeat(60));
console.log("  buildTransitContext(natal, transit)");
console.log("─".repeat(60));
const context = buildTransitContext(natal, transit);
console.log(context);

// ── grounding checks ───────────────────────────────────────────────────────

const natalSun = natal.positions.find(p => p.body === "Sun")!;
const transitSaturn = transit.transitingPositions.find(p => p.body === "Saturn")!;
const firstNatalAspect = transit.transitToNatalAspects[0];
const firstSkyAspect = transit.transitToTransitAspects[0];

const sectionAIndex = context.indexOf("## A. The Sky Right Now");
const sectionBIndex = context.indexOf("## B. How It Lands On This Person");

const systemPrompt = buildTransitSystemPrompt();

const checks: Array<[string, boolean]> = [
  [
    `Natal Sun sign present (${natalSun.sign})`,
    context.includes(natalSun.sign) && context.includes("Natal Planet Positions"),
  ],
  [
    `Transiting Saturn sign present (${transitSaturn.sign})`,
    context.includes("Transiting Planet Positions") && context.includes(transitSaturn.sign),
  ],
  [
    "Transit → Natal Aspects section present",
    context.includes("Transit → Natal Aspects"),
  ],
  [
    "Transit → Transit Aspects section present",
    context.includes("Transit → Transit Aspects"),
  ],
  [
    "Section A (sky) appears before Section B (personal) — interpretation order",
    sectionAIndex !== -1 && sectionBIndex !== -1 && sectionAIndex < sectionBIndex,
  ],
  [
    firstNatalAspect
      ? `First transit-to-natal aspect present (${firstNatalAspect.body1} ${firstNatalAspect.type} ${firstNatalAspect.body2})`
      : "No transit-to-natal aspects to check (skipped)",
    firstNatalAspect
      ? context.includes(firstNatalAspect.body1) && context.includes(firstNatalAspect.body2)
      : true,
  ],
  [
    firstSkyAspect
      ? `First transit-to-transit aspect present (${firstSkyAspect.body1} ${firstSkyAspect.type} ${firstSkyAspect.body2})`
      : "No transit-to-transit aspects to check (skipped)",
    firstSkyAspect
      ? context.includes(firstSkyAspect.body1) && context.includes(firstSkyAspect.body2)
      : true,
  ],
  [
    "System prompt instructs the two-stage sky-then-natal order",
    systemPrompt.includes("STAGE 1") && systemPrompt.includes("STAGE 2"),
  ],
  [
    "System prompt no longer tells the model to flag absent data",
    !systemPrompt.toLowerCase().includes("say so rather than guessing"),
  ],
];

console.log("\n" + "─".repeat(60));
console.log("  Grounding checks");
console.log("─".repeat(60));

let allPass = true;
for (const [label, pass] of checks) {
  console.log(`  ${pass ? "PASS ✓" : "FAIL ✗"}  ${label}`);
  if (!pass) allPass = false;
}

console.log("─".repeat(60));
if (!allPass) process.exit(1);
