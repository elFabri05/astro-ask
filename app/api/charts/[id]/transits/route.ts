import { NextRequest, NextResponse } from "next/server";
import { getOrCreateTransitChart, ChartNotFoundError } from "@/lib/transits";
import { TransitTargetInput, parsePlaceQueryParams } from "@/lib/validation";

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const sp = req.nextUrl.searchParams;
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
    return NextResponse.json(record);
  } catch (err) {
    if (err instanceof ChartNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[GET transits]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
