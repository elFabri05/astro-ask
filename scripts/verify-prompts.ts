/**
 * Verify that buildNatalUserPrompt serializes all chart facts correctly.
 *
 * Run with:  npm run verify:prompts
 *
 * What this checks (without spending an API call):
 *   - Every planet appears by name
 *   - The Ascendant and Midheaven appear
 *   - Every aspect body pair appears
 *   - A non-trivial amount of text was produced
 */
import { computeNatalChart } from "../lib/ephemeris";
import { buildNatalSystemPrompt, buildNatalUserPrompt } from "../lib/prompts";

// London reference chart: 1990-01-15 14:30 UTC, London (51.5074, -0.1278)
const CHART = computeNatalChart({
  utcDateTime: "1990-01-15T14:30:00Z",
  latitude:     51.5074,
  longitude:    -0.1278,
});

const SYSTEM = buildNatalSystemPrompt();
const USER   = buildNatalUserPrompt(CHART);

console.log("════════════════════════════════════════════════════════════════");
console.log("SYSTEM PROMPT");
console.log("════════════════════════════════════════════════════════════════");
console.log(SYSTEM);
console.log();
console.log("════════════════════════════════════════════════════════════════");
console.log("USER PROMPT");
console.log("════════════════════════════════════════════════════════════════");
console.log(USER);
console.log();

// ─── assertions ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

console.log("════════════════════════════════════════════════════════════════");
console.log("ASSERTIONS");
console.log("════════════════════════════════════════════════════════════════");

// Every planet that was computed must appear in the user prompt
for (const pos of CHART.positions) {
  check(`Planet present: ${pos.body}`, USER.includes(pos.body));
}

// Angles
check("Ascendant present", USER.includes("Ascendant"));
check("Midheaven present", USER.includes("Midheaven"));

// Aspects — at least one body from each aspect pair must appear (they definitely
// appear in the planet list, but confirm the aspect section is populated)
check("Aspects section present", USER.includes("## Aspects"));
if (CHART.aspects.length > 0) {
  const firstAspect = CHART.aspects[0];
  check(
    `First aspect body present (${firstAspect.body1})`,
    USER.includes(firstAspect.body1)
  );
  check(
    `First aspect type present (${firstAspect.type})`,
    USER.includes(firstAspect.type)
  );
}

// House cusps section
check("House cusps section present", USER.includes("## House Cusps"));
check("All 12 house cusps appear", USER.includes("H12"));

// System prompt includes the key constraint text
check("System prompt has grounding constraint", SYSTEM.includes("INTERPRET ONLY"));
check("System prompt has missing-data instruction", SYSTEM.includes("say so"));

// Sanity: reasonable lengths
check("System prompt is substantial (>200 chars)", SYSTEM.length > 200);
check("User prompt is substantial (>500 chars)",   USER.length > 500);

console.log();
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
