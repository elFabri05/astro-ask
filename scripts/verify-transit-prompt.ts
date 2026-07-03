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
const firstAspect = transit.transitToNatalAspects[0];

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
    firstAspect
      ? `First transit-to-natal aspect present (${firstAspect.body1} ${firstAspect.type} ${firstAspect.body2})`
      : "No transit-to-natal aspects to check (skipped)",
    firstAspect ? context.includes(firstAspect.body1) && context.includes(firstAspect.body2) : true,
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
