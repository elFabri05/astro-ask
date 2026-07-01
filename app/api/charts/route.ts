import { NextRequest, NextResponse } from "next/server";
import { createBirthChart, ZodError } from "@/lib/charts";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const record = await createBirthChart(body as Parameters<typeof createBirthChart>[0]);
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", issues: err.flatten().fieldErrors },
        { status: 400 }
      );
    }
    console.error("[POST /api/charts]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
