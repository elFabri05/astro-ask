import { NextRequest, NextResponse } from "next/server";
import { resolvePlace } from "@/lib/geo";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  const result = await resolvePlace(q);
  // resolvePlace returns the best single match; wrap in array so the UI
  // can render a consistent candidate list interface.
  return NextResponse.json(result ? [result] : []);
}
