import { prisma } from "./db";
import { getBirthChart } from "./charts";
import {
  getOrCreateTransitChart, getTransitChartById,
  ChartNotFoundError, type TransitData,
} from "./transits";
import { getNatalInterpretation, generateNatalInterpretation, getOrCreateTransitOpener } from "./interpret";
import type { ChartData } from "./ephemeris";
import type { ResolvedPlace } from "./geo";

export { ChartNotFoundError };
export class SessionNotFoundError extends Error {}

// ─── types ────────────────────────────────────────────────────────────────────

export interface SessionRecord {
  id:             string;
  chartId:        string;
  transitChartId: string | null;
  title:          string | null;
  createdAt:      Date;
}

export interface SessionSummary extends SessionRecord {
  messageCount: number;
}

export interface MessageRecord {
  id:        string;
  sessionId: string;
  role:      "user" | "assistant";
  content:   string;
  createdAt: Date;
}

export interface SessionWithMessages extends SessionRecord {
  messages: MessageRecord[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toMessageRecord(row: {
  id: string; sessionId: string; role: string; content: string; createdAt: Date;
}): MessageRecord {
  return { ...row, role: row.role as "user" | "assistant" };
}

// Short (~4-6 word) title derived from the first user question. Deterministic
// — no LLM call, so it never adds cost beyond the reply the user asked for.
export function deriveTitle(text: string): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ");
  let title = words.slice(0, 6).join(" ");
  if (words.length > 6) title += "…";
  return title.length > 60 ? `${title.slice(0, 57)}…` : title;
}

// ─── service functions ────────────────────────────────────────────────────────

// Creates a new Session and seeds it with the opening interpretation.
// Seeding rule: if this date (or the natal chart) already has a stored
// opener, reuse it verbatim — no LLM call. "New session" always creates a
// fresh Session row, but never a fresh generation for an explored date.
export async function createSession(input: {
  chartId: string;
  targetDate?: string;
  localTime?: string;
  place?: ResolvedPlace;
}): Promise<SessionWithMessages> {
  const { chartId, targetDate, localTime, place } = input;

  const chart = await getBirthChart(chartId);
  if (!chart) throw new ChartNotFoundError(`Chart not found: ${chartId}`);

  let transitChartId: string | null = null;
  let openerText: string;

  if (targetDate) {
    const transitChart = await getOrCreateTransitChart(chartId, { targetDate, localTime, place });
    transitChartId = transitChart.id;
    openerText = (await getOrCreateTransitOpener(chartId, transitChart.id)).content;
  } else {
    const existing = await getNatalInterpretation(chartId);
    openerText = existing ? existing.content : (await generateNatalInterpretation(chartId)).content;
  }

  const session = await prisma.session.create({
    data: { chartId, transitChartId },
  });

  const opener = await prisma.message.create({
    data: { sessionId: session.id, role: "assistant", content: openerText },
  });

  return { ...session, messages: [toMessageRecord(opener)] };
}

// Sessions for a given (chartId, transitChartId) — pass null for natal
// sessions. Newest first.
export async function listSessions(
  chartId: string,
  transitChartId: string | null
): Promise<SessionSummary[]> {
  const rows = await prisma.session.findMany({
    where:   { chartId, transitChartId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
  return rows.map(({ _count, ...r }) => ({ ...r, messageCount: _count.messages }));
}

export async function getSession(sessionId: string): Promise<SessionRecord | null> {
  return prisma.session.findUnique({ where: { id: sessionId } });
}

export async function getMessages(sessionId: string): Promise<MessageRecord[]> {
  const rows = await prisma.message.findMany({
    where:   { sessionId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toMessageRecord);
}

// Persists the user's turn and, on the session's first user message, derives
// the session title from it.
export async function appendUserMessage(sessionId: string, content: string): Promise<MessageRecord> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new SessionNotFoundError(`Session not found: ${sessionId}`);

  const [message] = await prisma.$transaction([
    prisma.message.create({ data: { sessionId, role: "user", content } }),
    ...(session.title === null
      ? [prisma.session.update({ where: { id: sessionId }, data: { title: deriveTitle(content) } })]
      : []),
  ]);

  return toMessageRecord(message);
}

export async function appendAssistantMessage(sessionId: string, content: string): Promise<MessageRecord> {
  const row = await prisma.message.create({ data: { sessionId, role: "assistant", content } });
  return toMessageRecord(row);
}

// Everything the chat route needs to assemble fresh system context: the
// session's natal chart, and its transit data if this is a transit session.
// Never persisted as Message rows — recomputed from source on every call.
export async function getSessionChartContext(sessionId: string): Promise<{
  session: SessionRecord;
  natal:   ChartData;
  transit: TransitData | null;
}> {
  const session = await getSession(sessionId);
  if (!session) throw new SessionNotFoundError(`Session not found: ${sessionId}`);

  const chart = await getBirthChart(session.chartId);
  if (!chart) throw new ChartNotFoundError(`Chart not found: ${session.chartId}`);

  let transit: TransitData | null = null;
  if (session.transitChartId) {
    const transitChart = await getTransitChartById(session.transitChartId);
    if (!transitChart) throw new Error(`Transit chart not found: ${session.transitChartId}`);
    transit = transitChart.transitData;
  }

  return { session, natal: chart.chartData, transit };
}
