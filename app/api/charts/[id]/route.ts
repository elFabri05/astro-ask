import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getBirthChart, deleteBirthChart } from "@/lib/charts";

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await deleteBirthChart(params.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[DELETE /api/charts/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
