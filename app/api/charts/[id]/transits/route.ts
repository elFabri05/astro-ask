import { NextRequest, NextResponse } from "next/server";
import { getOrCreateTransitChart, getTransitChartById, ChartNotFoundError } from "@/lib/transits";
import { resolveTransitOpener, type TransitOpenerResult } from "@/lib/interpret";
import { TransitTargetInput, parsePlaceQueryParams } from "@/lib/validation";

type Ctx = { params: { id: string } };

// The transit resolved fine either way; a failed opener generation degrades to
// opener: null + a typed reason so the client can show a specific fallback
// (rate-limited vs. generic failure) instead of crashing on undefined.
function withOpener<T>(record: T, opener: TransitOpenerResult) {
  return opener.ok
    ? { ...record, opener: opener.record.content, openerFailure: null }
    : { ...record, opener: null, openerFailure: opener.reason };
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const sp = req.nextUrl.searchParams;

  // ?transitChartId= — exact lookup of an already-computed TransitChart, used
  // by the history stack to restore a past session's context byte-for-byte
  // instead of re-resolving it from date+time+place.
  const transitChartId = sp.get("transitChartId");
  if (transitChartId) {
    try {
      const record = await getTransitChartById(transitChartId);
      if (!record || record.chartId !== params.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const opener = await resolveTransitOpener(params.id, record.id);
      return NextResponse.json(withOpener(record, opener));
    } catch (err) {
      console.error("[GET transits]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  const targetDate = sp.get("date");
  if (!targetDate) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const place = parsePlaceQueryParams(sp);
  if (place === "invalid") {
    return NextResponse.json(
      { error: "place requires placeLabel, placeLat, and placeLng together" },
      { status: 400 }
    );
  }

  const parsed = TransitTargetInput.safeParse({
    targetDate,
    localTime: sp.get("time") ?? undefined,
    place,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const record = await getOrCreateTransitChart(params.id, parsed.data);
    // The opener is fetched alongside the transit itself so date-select can
    // render the transient reading in one round trip — see the transits page.
    const opener = await resolveTransitOpener(params.id, record.id);
    return NextResponse.json(withOpener(record, opener));
  } catch (err) {
    if (err instanceof ChartNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[GET transits]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
