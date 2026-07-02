import { NextRequest, NextResponse } from "next/server";
import { createSession, listSessions, ChartNotFoundError } from "@/lib/sessions";
import { findTransitChart } from "@/lib/transits";

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const body = await req.json().catch(() => ({})) as { targetDate?: string };

  try {
    const session = await createSession({ chartId: params.id, targetDate: body.targetDate });
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    if (err instanceof ChartNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[POST /api/charts/:id/sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const date = req.nextUrl.searchParams.get("date");

  try {
    // Read-only: a date with no computed TransitChart yet has no sessions.
    let transitChartId: string | null = null;
    if (date) {
      const transitChart = await findTransitChart(params.id, date);
      if (!transitChart) return NextResponse.json([]);
      transitChartId = transitChart.id;
    }

    const sessions = await listSessions(params.id, transitChartId);
    return NextResponse.json(sessions);
  } catch (err) {
    console.error("[GET /api/charts/:id/sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
