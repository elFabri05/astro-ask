import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "./db";
import { getBirthChart } from "./charts";
import { buildNatalSystemPrompt, buildNatalUserPrompt } from "./prompts";

// ─── config ───────────────────────────────────────────────────────────────────

// Put the model id in one place so it is trivially swappable.
// Override at runtime via ANTHROPIC_MODEL env var.
const MODEL_ID =
  (process.env.ANTHROPIC_MODEL as string | undefined) ?? "claude-haiku-4-5-20251001";

// ─── return type ─────────────────────────────────────────────────────────────

export interface InterpretationRecord {
  id:        string;
  chartId:   string;
  type:      string;
  content:   string;
  model:     string;
  createdAt: Date;
}

function toRecord(row: {
  id: string; chartId: string; type: string;
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
    model:  anthropic(MODEL_ID as Parameters<typeof anthropic>[0]),
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
