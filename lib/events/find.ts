// Orchestration for the event finder: resolve the window, run the one
// topic-mapping model call, scan the window deterministically, rank, and
// return the top few events with their computed dates and scores. No
// interpretation happens here — the ranked result is handed to the
// interpretation route as ground truth.

import { getBirthChart } from "../charts";
import { ChartNotFoundError } from "../transits";
import { scanEvents, type DetectedEvent } from "./detect";
import { scoreStrength } from "./score";
import { mapTopicToFactors, scoreRelevance } from "./topic";

export type EventWindow = "3m" | "6m" | "12m";

const WINDOW_MONTHS: Record<EventWindow, number> = { "3m": 3, "6m": 6, "12m": 12 };

// How many events survive the ranking, and how much each matched topic
// factor amplifies strength: one match ×1.75, two ×2.5, ... — relevance
// boosts strongly, but a very strong off-topic event (a Pluto station, an
// eclipse-grade lunation) can still make the list.
const TOP_N = 5;
const RELEVANCE_GAIN = 0.75;

export interface RankedEvent extends DetectedEvent {
  strength: number;
  relevance: number;
  score: number;
}

export interface EventsFindResult {
  chartId: string;
  topic: string;
  window: EventWindow;
  startDate: string;
  endDate: string;
  topicFactors: string[];
  events: RankedEvent[];   // ranked, strongest first; dates are computed facts
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsUtc(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Deterministic ranking, exported separately so it can be exercised without
// a database or a model call (see scripts/verify-events.ts).
export function rankEvents(
  events: DetectedEvent[],
  topicFactors: string[],
  topN: number = TOP_N
): RankedEvent[] {
  return events
    .map(event => {
      const strength = scoreStrength(event);
      const relevance = scoreRelevance(event, topicFactors);
      return { ...event, strength, relevance, score: strength * (1 + RELEVANCE_GAIN * relevance) };
    })
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
    .slice(0, topN);
}

export async function findSignificantEvents(input: {
  chartId: string;
  window: EventWindow;
  topic: string;
}): Promise<EventsFindResult> {
  const { chartId, window, topic } = input;

  // Sky-only detection needs no chart data, but the route is chart-scoped and
  // the interpretation grounds events in this chart — so a missing chart must
  // still 404 here rather than downstream.
  const chart = await getBirthChart(chartId);
  if (!chart) throw new ChartNotFoundError(`Chart not found: ${chartId}`);

  const startDate = todayUtc();
  const endDate = addMonthsUtc(startDate, WINDOW_MONTHS[window]);

  // Kick off the model call first; the scan is synchronous CPU work, so the
  // network round trip overlaps with it instead of following it.
  const factorsPromise = mapTopicToFactors(topic);
  const detected = scanEvents({ startDate, endDate });
  const topicFactors = await factorsPromise;

  return {
    chartId,
    topic,
    window,
    startDate,
    endDate,
    topicFactors,
    events: rankEvents(detected, topicFactors),
  };
}
