import { NextRequest, NextResponse } from "next/server";
import { getSession, getMessages } from "@/lib/sessions";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await getSession(params.id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const messages = await getMessages(params.id);
    return NextResponse.json(messages);
  } catch (err) {
    console.error("[GET /api/sessions/:id/messages]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
