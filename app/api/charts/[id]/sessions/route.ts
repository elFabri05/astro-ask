import { NextRequest, NextResponse } from "next/server";
import { startSessionFromFirstMessage, listSessions, ChartNotFoundError } from "@/lib/sessions";
import { SessionStartInput } from "@/lib/validation";

type Ctx = { params: { id: string } };

// Promotes a transient transit view (opener shown, nothing persisted yet)
// into a real Session, seeded by the user's first message — see
// startSessionFromFirstMessage in lib/sessions.ts. The natal session has no
// transient state and is created directly by its server page instead.
export async function POST(req: NextRequest, { params }: Ctx) {
  const body = await req.json().catch(() => ({}));
  const parsed = SessionStartInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const session = await startSessionFromFirstMessage({
      chartId:          params.id,
      transitChartId:   parsed.data.transitChartId,
      firstUserMessage: parsed.data.message,
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
