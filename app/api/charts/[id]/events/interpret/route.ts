import { NextRequest, NextResponse } from "next/server";
import { internalErrorResponse } from "@/lib/apiErrors";
import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { MODEL_ID } from "@/lib/interpret";
import { getBirthChart } from "@/lib/charts";
import { buildEventsSystemPrompt, buildEventsInterpretationPrompt } from "@/lib/prompts";
import { EventsInterpretInput } from "@/lib/validation";

type Ctx = { params: { id: string } };

// The interpretation half of the event finder: takes the ranked events the
// scan returned (echoed back by the client, validated to the same shape) and
// streams a reading that explains ONLY those events — the prompt forbids
// adding events or altering their computed dates. Plain text stream, read
// incrementally by the EventFinder component.
export async function POST(req: NextRequest, { params }: Ctx) {
  const body = await req.json().catch(() => null);
  const parsed = EventsInterpretInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const chart = await getBirthChart(params.id);
  if (!chart) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = streamText({
      model:  google(MODEL_ID),
      system: buildEventsSystemPrompt(),
      prompt: buildEventsInterpretationPrompt(
        chart.chartData,
        parsed.data.topic,
        parsed.data.topicFactors,
        parsed.data.events
      ),
    });
    return result.toTextStreamResponse();
  } catch (err) {
    return internalErrorResponse("[POST /api/charts/:id/events/interpret]", err);
  }
}
