// Topic handling for the event finder. Exactly one model call lives here:
// mapTopicToFactors turns free text ("my career") into astrological factors
// ("10th house", "Saturn", "Midheaven", ...) drawn from a closed vocabulary.
// The model never sees the chart, the window, or any event — it cannot claim
// dates or placements, only name symbolism. Relevance itself (scoreRelevance)
// is a deterministic overlap between those factors and each event's computed
// rawFactors tags.

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { MODEL_ID } from "../interpret";
import { houseTag, type DetectedEvent } from "./detect";

// ─── factor vocabulary ────────────────────────────────────────────────────────
//
// The closed set both sides speak: detection emits rawFactors from it (plus
// aspect-type and chart-ruler tags scoring uses separately), and the topic
// mapper may only pick from it — anything else the model outputs is dropped.

const BODIES = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto", "True Node", "Chiron",
];
const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const HOUSES = Array.from({ length: 12 }, (_, i) => houseTag(i + 1));
const POINTS = ["Ascendant", "Midheaven"];
const LUNATIONS = ["Full Moon", "New Moon"];

export const FACTOR_VOCABULARY: readonly string[] = [
  ...BODIES, ...SIGNS, ...HOUSES, ...POINTS, ...LUNATIONS,
];

// lowercase → canonical spelling, for tolerant parsing of model output
const CANONICAL = new Map(FACTOR_VOCABULARY.map(f => [f.toLowerCase(), f]));

// ─── the one pre-scan model call ─────────────────────────────────────────────

function buildTopicSystemPrompt(): string {
  return `You are an expert astrologer. Given a life topic, list the astrological factors
traditionally associated with it: relevant houses, planets, signs, and points.

STRICT CONSTRAINTS — follow these without exception:
1. Choose ONLY from this exact vocabulary (case-sensitive spellings):
${FACTOR_VOCABULARY.map(f => `   - ${f}`).join("\n")}
2. Output ONLY a JSON array of 4 to 10 strings, e.g. ["10th house","Saturn","Midheaven"].
   No prose, no markdown fences, no keys, no explanations.
3. Never output dates, events, predictions, or claims about any person's chart —
   you are mapping the SYMBOLISM of the topic, nothing else.

Examples of the shape (not content to copy):
- "career" → ["10th house","Saturn","Midheaven","Capricorn","Sun","6th house"]
- "a relationship" → ["7th house","Venus","Mars","Libra","5th house","Moon"]`.trimStart();
}

// Map a free-text topic to factor tags. Unknown factors from the model are
// silently dropped; if nothing valid survives, the caller ranks by strength
// alone rather than failing the whole scan.
export async function mapTopicToFactors(topic: string): Promise<string[]> {
  const { text } = await generateText({
    model:  google(MODEL_ID),
    system: buildTopicSystemPrompt(),
    prompt: `Topic: ${topic}\n\nOutput the JSON array now.`,
  });

  // Tolerate a fenced or prefixed reply: take the first [...] block.
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const factors = parsed
    .filter((f): f is string => typeof f === "string")
    .map(f => CANONICAL.get(f.trim().toLowerCase()))
    .filter((f): f is string => f !== undefined);

  return [...new Set(factors)];
}

// ─── deterministic relevance ──────────────────────────────────────────────────

// How many of the topic's factors this event's computed tags hit. Plain
// intersection count — every match is one more reason the event speaks to
// the topic, and rankEvents (lib/events/find.ts) turns that into a boost.
export function scoreRelevance(event: DetectedEvent, topicFactors: string[]): number {
  if (topicFactors.length === 0) return 0;
  const tags = new Set(event.rawFactors.map(f => f.toLowerCase()));
  let matches = 0;
  for (const factor of topicFactors) {
    if (tags.has(factor.toLowerCase())) matches++;
  }
  return matches;
}
