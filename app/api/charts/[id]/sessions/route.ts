import { NextRequest, NextResponse } from "next/server";
import { createSession, listSessions, ChartNotFoundError } from "@/lib/sessions";
import { TransitTargetInput } from "@/lib/validation";

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  const body = await req.json().catch(() => ({})) as {
    targetDate?: string;
    localTime?: string;
    place?: { label: string; latitude: number; longitude: number };
  };

  if (body.targetDate !== undefined || body.localTime !== undefined || body.place !== undefined) {
    const parsed = TransitTargetInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
  }

  try {
    const session = await createSession({
      chartId: params.id,
      targetDate: body.targetDate,
      localTime:  body.localTime,
      place:      body.place,
    });
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    if (err instanceof ChartNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[POST /api/charts/:id/sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Lists sessions for a specific, already-resolved TransitChart (the client
// resolves date+time+place to a transitChartId via /api/charts/:id/transits
// first). Omitting transitChartId lists the natal session.
export async function GET(req: NextRequest, { params }: Ctx) {
  const transitChartId = req.nextUrl.searchParams.get("transitChartId");

  try {
    const sessions = await listSessions(params.id, transitChartId);
    return NextResponse.json(sessions);
  } catch (err) {
    console.error("[GET /api/charts/:id/sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
