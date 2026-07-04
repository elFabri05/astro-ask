// Topic handling for the event finder — fully deterministic. mapTopicToFactors
// turns free text ("my career") into astrological factors ("Saturn",
// "10th house", ...) by keyword lookup against the association table in
// lib/events/topicTable.ts: no model, no network, no quota, no async. The
// only model call left in the whole pipeline is the interpretation itself.
// Relevance (scoreRelevance) is a deterministic overlap between those factors
// and each event's computed factors tags.

import { TOPIC_TABLE, DEFAULT_FACTORS } from "./topicTable";
import type { DetectedEvent } from "./detect";

// ─── factor vocabulary ────────────────────────────────────────────────────────
//
// The closed set both sides speak: detection emits event factors from it and
// the topic table may only use factors from it (verified in
// scripts/verify-events.ts). In sky-only mode detected events carry planet
// names only, so the house/sign/point factors never match anything; they are
// kept for when natal contacts return (fixed-longitude series over the same
// crossing primitive), and matching them costs nothing meanwhile.

const BODIES = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto",
];
const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const ORDINALS = [
  "1st", "2nd", "3rd", "4th", "5th", "6th",
  "7th", "8th", "9th", "10th", "11th", "12th",
];
const HOUSES = ORDINALS.map(o => `${o} house`);
const POINTS = ["Ascendant", "Midheaven"];
const LUNATIONS = ["Full Moon", "New Moon"];

export const FACTOR_VOCABULARY: readonly string[] = [
  ...BODIES, ...SIGNS, ...HOUSES, ...POINTS, ...LUNATIONS,
];

// ─── deterministic topic mapping ──────────────────────────────────────────────

// Stem-tolerant prefix match between a topic token and a table keyword:
// "promoted" matches keyword "promotion"? No — but "promotions" does, and
// token "studying" matches keyword "study". The length guards keep short
// fragments ("ma", "lo") from matching half the table.
function tokenMatchesKeyword(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  if (keyword.length >= 3 && token.startsWith(keyword)) return true;
  if (token.length >= 4 && keyword.startsWith(token)) return true;
  return false;
}

// Map a free-text topic to factor tags — synchronous and deterministic.
// Union of the factors of every matched table entry; a topic that matches
// nothing falls back to DEFAULT_FACTORS, never [] (an empty set would make
// every event score zero relevance and the ranking meaningless).
export function mapTopicToFactors(topic: string): string[] {
  const tokens = topic.toLowerCase().split(/[^a-z]+/).filter(Boolean);

  const matched = new Set<string>();
  for (const entry of TOPIC_TABLE) {
    const hit = entry.keywords.some(keyword =>
      tokens.some(token => tokenMatchesKeyword(token, keyword))
    );
    if (hit) for (const factor of entry.factors) matched.add(factor);
  }

  if (matched.size === 0) {
    // SEAM: this is the single place a smarter fallback for unmatched topics
    // (a model call, an embedding lookup) would slot in later. Deliberately
    // NOT implemented — the broad default keeps the scan deterministic and
    // quota-free, returning the strongest events topic-unfiltered.
    return [...DEFAULT_FACTORS];
  }

  return [...matched];
}

// ─── deterministic relevance ──────────────────────────────────────────────────

// How many of the topic's factors this event's computed factors hit. Plain
// intersection count — every match is one more reason the event speaks to
// the topic, and rankEvents (lib/events/find.ts) turns that into a boost.
export function scoreRelevance(event: DetectedEvent, topicFactors: string[]): number {
  if (topicFactors.length === 0) return 0;
  const tags = new Set(event.factors.map(f => f.toLowerCase()));
  let matches = 0;
  for (const factor of topicFactors) {
    if (tags.has(factor.toLowerCase())) matches++;
  }
  return matches;
}
