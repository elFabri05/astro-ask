import { NextRequest, NextResponse } from "next/server";
import {
  generateNatalInterpretation,
  getNatalInterpretation,
} from "@/lib/interpret";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const record = await getNatalInterpretation(params.id);
    if (!record) return new NextResponse(null, { status: 204 });
    return NextResponse.json(record);
  } catch (err) {
    console.error("[GET interpretation]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const body  = await req.json().catch(() => ({})) as { force?: boolean };
    const force = body?.force === true;
    const record = await generateNatalInterpretation(params.id, { force });
    return NextResponse.json(record);
  } catch (err) {
    console.error("[POST interpretation]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
