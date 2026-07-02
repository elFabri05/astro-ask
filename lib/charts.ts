import { ZodError } from "zod";
import { BirthDataInput, type BirthDataInputType } from "./validation";
import { resolveUtcInstant } from "./geo";
import { computeNatalChart, type ChartData } from "./ephemeris";
import { prisma } from "./db";

// ─── return type ─────────────────────────────────────────────────────────────

export interface BirthChartRecord {
  id:          string;
  name:        string | null;
  birthDate:   string;
  birthTime:   string;
  placeLabel:  string;
  latitude:    number;
  longitude:   number;
  timezone:    string;
  utcDateTime: string;
  chartData:   ChartData;   // parsed; never re-computed on read
  createdAt:   Date;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseChartData(raw: string): ChartData {
  return JSON.parse(raw) as ChartData;
}

function toRecord(row: {
  id: string; name: string | null; birthDate: string; birthTime: string;
  placeLabel: string; latitude: number; longitude: number;
  timezone: string; utcDateTime: string; chartData: string; createdAt: Date;
}): BirthChartRecord {
  return { ...row, chartData: parseChartData(row.chartData) };
}

// ─── service functions ────────────────────────────────────────────────────────

export async function createBirthChart(
  input: BirthDataInputType
): Promise<BirthChartRecord> {
  // 1. validate — throws ZodError with field-level detail on bad input
  const parsed = BirthDataInput.parse(input);

  // 2. local → UTC via resolveUtcInstant (never pass local time to ephemeris)
  const { utcDateTime, timezone } = resolveUtcInstant({
    localDate:  parsed.birthDate,
    localTime:  parsed.birthTime,
    latitude:   parsed.place.latitude,
    longitude:  parsed.place.longitude,
  });

  // 3. compute natal chart from the resolved UTC instant + coordinates
  const chartData = computeNatalChart({
    utcDateTime,
    latitude:  parsed.place.latitude,
    longitude: parsed.place.longitude,
  });

  // 4. persist — chartData frozen as JSON string
  const row = await prisma.birthChart.create({
    data: {
      name:        parsed.name ?? null,
      birthDate:   parsed.birthDate,
      birthTime:   parsed.birthTime,
      placeLabel:  parsed.place.label,
      latitude:    parsed.place.latitude,
      longitude:   parsed.place.longitude,
      timezone,
      utcDateTime,
      chartData:   JSON.stringify(chartData),
    },
  });

  return toRecord(row);
}

export async function getBirthChart(id: string): Promise<BirthChartRecord | null> {
  const row = await prisma.birthChart.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

export interface BirthChartSummary {
  id:         string;
  name:       string | null;
  birthDate:  string;
  placeLabel: string;
  createdAt:  Date;
}

// Lightweight listing for the sidebar — no chartData parse needed.
// Single-user for now: unfiltered. When auth lands, this should take a
// userId and filter by it (e.g. `where: { userId }`).
export async function listBirthCharts(): Promise<BirthChartSummary[]> {
  return prisma.birthChart.findMany({
    select: { id: true, name: true, birthDate: true, placeLabel: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

// Re-export ZodError so route handlers can import it from one place
export { ZodError };
