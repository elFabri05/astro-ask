import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { prisma } from "./db";
import { getBirthChart } from "./charts";
import { getTransitChartById, ChartNotFoundError } from "./transits";
import {
  buildNatalSystemPrompt, buildNatalUserPrompt,
  buildTransitSystemPrompt, buildTransitContext,
} from "./prompts";

// ─── config ───────────────────────────────────────────────────────────────────

// Put the model id in one place so it is trivially swappable. Shared by the
// streaming chat route (app/api/sessions/[id]/chat) so the whole app talks
// to exactly one model. Override at runtime via GOOGLE_MODEL env var.
export const MODEL_ID =
  (process.env.GOOGLE_MODEL as string | undefined) ?? "gemini-3.5-flash";

// ─── return type ─────────────────────────────────────────────────────────────

export interface InterpretationRecord {
  id:             string;
  chartId:        string;
  transitChartId: string | null;
  type:           string;
  content:        string;
  model:          string;
  createdAt:      Date;
}

function toRecord(row: {
  id: string; chartId: string; transitChartId: string | null; type: string;
  content: string; model: string; createdAt: Date;
}): InterpretationRecord {
  return row;
}

// ─── service functions ────────────────────────────────────────────────────────

export async function generateNatalInterpretation(
  chartId: string,
  options?: { force?: boolean }
): Promise<InterpretationRecord> {
  // Cache: return existing unless force is set
  if (!options?.force) {
    const existing = await prisma.interpretation.findFirst({
      where: { chartId, type: "natal" },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return toRecord(existing);
  }

  const chart = await getBirthChart(chartId);
  if (!chart) throw new Error(`Chart not found: ${chartId}`);

  const system = buildNatalSystemPrompt();
  const prompt = buildNatalUserPrompt(chart.chartData);

  const { text } = await generateText({
    model:  google(MODEL_ID),
    system,
    prompt,
  });

  // On force-regenerate, drop the old row first so there is always exactly one
  // per (chartId, type).
  if (options?.force) {
    await prisma.interpretation.deleteMany({ where: { chartId, type: "natal" } });
  }

  const row = await prisma.interpretation.create({
    data: { chartId, type: "natal", content: text, model: MODEL_ID },
  });

  return toRecord(row);
}

export async function getNatalInterpretation(
  chartId: string
): Promise<InterpretationRecord | null> {
  const row = await prisma.interpretation.findFirst({
    where:   { chartId, type: "natal" },
    orderBy: { createdAt: "desc" },
  });
  return row ? toRecord(row) : null;
}

// ─── transit opener (cost optimization for sessions) ──────────────────────────
//
// A "New session" over an already-explored (chartId, targetDate) must reuse
// this text as its seed message rather than trigger a fresh LLM call. Cached
// per transitChartId — every session over the same date shares one opener,
// but each session's later conversation turns are independent.

export async function getOrCreateTransitOpener(
  chartId: string,
  transitChartId: string
): Promise<InterpretationRecord> {
  const existing = await prisma.interpretation.findFirst({
    where:   { transitChartId, type: "transit" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return toRecord(existing);

  const [chart, transitChart] = await Promise.all([
    getBirthChart(chartId),
    getTransitChartById(transitChartId),
  ]);
  if (!chart) throw new ChartNotFoundError(`Chart not found: ${chartId}`);
  if (!transitChart) throw new Error(`Transit chart not found: ${transitChartId}`);

  const system = buildTransitSystemPrompt();
  const prompt =
    buildTransitContext(chart.chartData, transitChart.transitData) +
    "\n\nWrite the opening transit interpretation now.";

  const { text } = await generateText({ model: google(MODEL_ID), system, prompt });

  const row = await prisma.interpretation.create({
    data: { chartId, transitChartId, type: "transit", content: text, model: MODEL_ID },
  });

  return toRecord(row);
}
