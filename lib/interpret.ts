import { generateText, APICallError, RetryError } from "ai";
import { google } from "@ai-sdk/google";
import { prisma } from "./db";
import { getBirthChart } from "./charts";
import { getTransitChartById, ChartNotFoundError, type TransitData } from "./transits";
import {
  buildNatalSystemPrompt, buildNatalUserPrompt,
  buildTransitSystemPrompt, buildTransitContext, buildTransitOpenerInstruction,
  buildTitleSystemPrompt, buildTitleUserPrompt,
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

// ─── failure classification ───────────────────────────────────────────────────

// Gemini quota exhaustion arrives as an HTTP 429 (RESOURCE_EXHAUSTED), usually
// wrapped in a RetryError once the SDK's automatic retries give up. The message
// regex is a fallback for errors that reach us in other shapes.
export function isRateLimitError(err: unknown): boolean {
  if (RetryError.isInstance(err)) return err.errors.some(isRateLimitError);
  if (APICallError.isInstance(err)) return err.statusCode === 429;
  return err instanceof Error && /quota|rate.?limit|resource.?exhausted/i.test(err.message);
}

export type OpenerFailureReason = "rate_limited" | "generation_failed";

export type TransitOpenerResult =
  | { ok: true;  record: InterpretationRecord }
  | { ok: false; reason: OpenerFailureReason };

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

  // Opener-only: the poetic closing-line instruction is appended here and NOT
  // in the session chat route, so follow-up replies stay plain.
  const system = buildTransitSystemPrompt() + buildTransitOpenerInstruction();
  const prompt =
    buildTransitContext(chart.chartData, transitChart.transitData) +
    "\n\nWrite the opening transit interpretation now.";

  const { text } = await generateText({ model: google(MODEL_ID), system, prompt });

  const row = await prisma.interpretation.create({
    data: { chartId, transitChartId, type: "transit", content: text, model: MODEL_ID },
  });

  return toRecord(row);
}

// Non-throwing variant for the read paths that render the transient view (the
// transits page and GET /api/charts/:id/transits): a failed generation must
// degrade to a typed failure the UI can show, never take down the whole
// response. ChartNotFoundError still throws — that's the caller's 404, not an
// opener failure. The throwing getOrCreateTransitOpener stays for session
// promotion, where the opener is expected to already be cached.
export async function resolveTransitOpener(
  chartId: string,
  transitChartId: string
): Promise<TransitOpenerResult> {
  try {
    const record = await getOrCreateTransitOpener(chartId, transitChartId);
    return { ok: true, record };
  } catch (err) {
    if (err instanceof ChartNotFoundError) throw err;
    const reason: OpenerFailureReason = isRateLimitError(err) ? "rate_limited" : "generation_failed";
    console.error(`[transit opener] generation failed (${reason}) for transit ${transitChartId}:`, err);
    return { ok: false, reason };
  }
}

// ─── session title (promotion from transient view) ────────────────────────────
//
// One small LLM call, run once per session at promotion time (see
// startSessionFromFirstMessage in lib/sessions.ts) — not cached, since it only
// ever runs once per Session and the result is stored directly on that row.

export async function generateSessionTitle(input: {
  transitData: TransitData;
  firstUserMessage: string;
}): Promise<string> {
  const { text } = await generateText({
    model:  google(MODEL_ID),
    system: buildTitleSystemPrompt(),
    prompt: buildTitleUserPrompt(input.transitData, input.firstUserMessage),
  });

  const title = text.trim().replace(/^["']|["']$/g, "");
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}
