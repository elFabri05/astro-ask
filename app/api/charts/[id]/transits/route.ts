import { NextRequest, NextResponse } from "next/server";
import { getOrCreateTransitChart, ChartNotFoundError } from "@/lib/transits";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date || !isValidCalendarDate(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const record = await getOrCreateTransitChart(params.id, date);
    return NextResponse.json(record);
  } catch (err) {
    if (err instanceof ChartNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[GET transits]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
