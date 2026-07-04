import { NextRequest, NextResponse } from "next/server";
import { findSignificantEvents } from "@/lib/events/find";
import { ChartNotFoundError } from "@/lib/transits";
import { internalErrorResponse } from "@/lib/apiErrors";
import { EventsFindInput } from "@/lib/validation";

type Ctx = { params: { id: string } };

// The deterministic half of the event finder: topic-mapping table lookup +
// pure ephemeris scan + ranking — no model calls, so this route can never
// rate-limit. Returns the ranked events as JSON so the client can render
// them immediately and stream the interpretation separately (see
// ./interpret/route.ts, the pipeline's one remaining model call).
export async function POST(req: NextRequest, { params }: Ctx) {
  const body = await req.json().catch(() => null);
  const parsed = EventsFindInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const result = await findSignificantEvents({
      chartId: params.id,
      window:  parsed.data.window,
      topic:   parsed.data.topic,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ChartNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return internalErrorResponse("[POST /api/charts/:id/events]", err);
  }
}
