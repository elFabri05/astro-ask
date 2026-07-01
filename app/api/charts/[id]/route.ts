import { NextRequest, NextResponse } from "next/server";
import { getBirthChart } from "@/lib/charts";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const record = await getBirthChart(params.id);
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(record);
  } catch (err) {
    console.error("[GET /api/charts/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
