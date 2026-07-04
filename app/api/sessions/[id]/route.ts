import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { deleteSession } from "@/lib/sessions";

type Ctx = { params: { id: string } };

// Deletes one conversation: the Session row and its Messages (DB cascade).
// Deliberately leaves the TransitChart and cached interpretations alone —
// they're shared with other sessions on the same transit.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    await deleteSession(params.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[DELETE /api/sessions/:id]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
