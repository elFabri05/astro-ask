// Stage-by-stage diagnostic for the event finder. Runs each stage of the
// pipeline in isolation with logging and timing over a 3-month window from
// today, so whichever stage throws is obvious — with its real message and
// stack — and stage (b) shows what the deterministic compute actually costs.
//
//   a) mapTopicToFactors("my career")   — deterministic table lookup (~0ms)
//   b) sampleLongitudes                 — the daily ephemeris sweep
//   c) scanEvents                       — crossings → dated events
//   d) score + rank                     — the top-5 list
//   e) interpretation prompt / call     — prompt always; model only if
//                                         --interpret is passed (the one
//                                         remaining quota-limited stage)
//
// Run: npm run diagnose:events [-- --interpret]

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { computeNatalChart } from "../lib/ephemeris";
import {
  SKY_BODIES, sampleLongitudes, scanEvents, type DetectedEvent,
} from "../lib/events/detect";
import { rankEvents } from "../lib/events/find";
import { mapTopicToFactors } from "../lib/events/topic";
import { buildEventsSystemPrompt, buildEventsInterpretationPrompt } from "../lib/prompts";
import { MODEL_ID } from "../lib/interpret";

const TOPIC = "my career";

function stage(name: string): void {
  console.log("\n" + "─".repeat(64));
  console.log(`  ${name}`);
  console.log("─".repeat(64));
}

function fail(err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`  ✗ THREW: ${e.message}`);
  if (e.stack) console.error(e.stack.split("\n").slice(1, 8).map(l => `  ${l}`).join("\n"));
}

async function main() {
  const startDate = new Date().toISOString().slice(0, 10);
  const end = new Date(`${startDate}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 3);
  const endDate = end.toISOString().slice(0, 10);
  console.log(`Window: ${startDate} → ${endDate} (3 months), model: ${MODEL_ID}`);

  // ── a) topic mapping ────────────────────────────────────────────────────────
  stage("a) mapTopicToFactors(\"" + TOPIC + "\") — deterministic, no network");
  let topicFactors: string[] = [];
  try {
    const t = Date.now();
    topicFactors = mapTopicToFactors(TOPIC);
    console.log(`  ok in ${Date.now() - t}ms (pure table lookup, no model, no quota) → ${JSON.stringify(topicFactors)}`);
  } catch (err) {
    fail(err);
    process.exit(1); // a pure lookup throwing means the table itself is broken
  }

  // ── b) longitude sampling ───────────────────────────────────────────────────
  stage("b) sampleLongitudes (the daily ephemeris sweep)");
  let sampleMs = 0;
  try {
    const t = Date.now();
    const samples = sampleLongitudes({ bodies: SKY_BODIES, startDate, endDate });
    sampleMs = Date.now() - t;
    console.log(
      `  ok in ${sampleMs}ms → ${samples.length} daily samples × ${SKY_BODIES.length} bodies ` +
      `(${samples.length * SKY_BODIES.length} calc_ut calls)`
    );
  } catch (err) {
    fail(err);
    process.exit(1); // nothing downstream can run without the ephemeris
  }

  // ── c) detection ────────────────────────────────────────────────────────────
  stage("c) scanEvents (crossings → dated events)");
  let events: DetectedEvent[] = [];
  try {
    const t = Date.now();
    events = scanEvents({ startDate, endDate });
    console.log(`  ok in ${Date.now() - t}ms (incl. ~${sampleMs}ms re-sampling) → ${events.length} events:`);
    for (const e of events) {
      console.log(`    ${e.date}  [${e.kind}]  ${e.label}`);
    }
  } catch (err) {
    fail(err);
    process.exit(1);
  }

  // ── d) score + rank ─────────────────────────────────────────────────────────
  stage("d) score + rank (top 5)");
  try {
    const t = Date.now();
    const ranked = rankEvents(events, topicFactors);
    console.log(`  ok in ${Date.now() - t}ms:`);
    for (const e of ranked) {
      console.log(
        `    ${e.date}  score ${e.score.toFixed(2)} ` +
        `(strength ${e.strength.toFixed(2)}, relevance ${e.relevance})  ${e.label}`
      );
    }

    // ── e) interpretation ─────────────────────────────────────────────────────
    stage("e) interpretation");
    const natal = computeNatalChart({
      utcDateTime: "1990-06-15T11:30:00Z",
      latitude: -34.6037,
      longitude: -58.3816,
    });
    const system = buildEventsSystemPrompt();
    const prompt = buildEventsInterpretationPrompt(natal, TOPIC, topicFactors, ranked);
    console.log(`  prompt built: system ${system.length} chars, user ${prompt.length} chars`);

    if (!process.argv.includes("--interpret")) {
      console.log("  model call skipped (pass --interpret to run it; it spends quota)");
    } else if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.log("  model call skipped: GOOGLE_GENERATIVE_AI_API_KEY not set");
    } else {
      const t2 = Date.now();
      const { text } = await generateText({ model: google(MODEL_ID), system, prompt });
      console.log(`  ok in ${Date.now() - t2}ms → ${text.length} chars; first lines:`);
      console.log(text.split("\n").slice(0, 6).map(l => `    ${l}`).join("\n"));
    }
  } catch (err) {
    fail(err);
    process.exit(1);
  }

  console.log("\n✓ diagnosis complete — every stage above reports ok, skipped, or THREW");
}

main().catch(err => {
  fail(err);
  process.exit(1);
});
