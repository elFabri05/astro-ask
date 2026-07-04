import { NextRequest, NextResponse } from "next/server";
import { streamText, type CoreMessage } from "ai";
import { google } from "@ai-sdk/google";
import { MODEL_ID } from "@/lib/interpret";
import {
  getSessionChartContext, getMessages, appendUserMessage, appendAssistantMessage,
  SessionNotFoundError, ChartNotFoundError,
} from "@/lib/sessions";
import {
  buildNatalSystemPrompt, buildNatalUserPrompt,
  buildTransitSystemPrompt, buildTransitContext,
} from "@/lib/prompts";

// Conservative cap on conversation turns sent per call — well under any
// current model's context window even with the full facts block attached.
// The facts block itself is never subject to this trim.
const MAX_HISTORY_MESSAGES = 40;

type Ctx = { params: { id: string } };

interface ChatRequestBody {
  message?: { role?: string; content?: string };
  // Set by the client immediately after promoting a transient view into a
  // Session (see startSessionFromFirstMessage): the first user message is
  // already persisted at that point, so this call must only generate and
  // stream the reply to it, not append another copy.
  resume?: boolean;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const sessionId = params.id;

  const body = await req.json().catch(() => null) as ChatRequestBody | null;
  const resume = body?.resume === true;
  const incoming = body?.message;

  // The incoming message is required unless resuming (see ChatRequestBody).
  // Narrowed into a plain string here so the persist call below doesn't need
  // a non-null assertion.
  let userContent: string | null = null;
  if (!resume) {
    if (!incoming || incoming.role !== "user" || typeof incoming.content !== "string" || !incoming.content.trim()) {
      return NextResponse.json({ error: "message.content is required" }, { status: 400 });
    }
    userContent = incoming.content;
  }

  try {
    // Facts are recomputed from source on every call — never read from the
    // Message table, never stale, never omitted on later turns.
    const { natal, transit } = await getSessionChartContext(sessionId);

    // Persist the user's turn before generating, so it's part of the
    // authoritative history even if generation fails downstream. Skipped on
    // resume — that message was already persisted during promotion.
    if (userContent !== null) {
      await appendUserMessage(sessionId, userContent);
    }

    const system = transit
      ? `${buildTransitSystemPrompt()}\n\n${buildTransitContext(natal, transit)}`
      : `${buildNatalSystemPrompt()}\n\n${buildNatalUserPrompt(natal)}`;

    // The stored conversation, oldest first, already includes the message
    // just persisted above. This — not the client's copy — is the source of
    // truth for history; the facts above are never part of it.
    const history = await getMessages(sessionId);

    if (resume && history[history.length - 1]?.role !== "user") {
      return NextResponse.json({ error: "Nothing to resume: no pending user message" }, { status: 400 });
    }

    // As a thread grows, drop the oldest conversation turns before they'd
    // crowd out the system facts block — the facts are never trimmed.
    const trimmed = history.length > MAX_HISTORY_MESSAGES
      ? history.slice(history.length - MAX_HISTORY_MESSAGES)
      : history;

    const messages: CoreMessage[] = trimmed.map(m => ({ role: m.role, content: m.content }));

    const result = streamText({
      model: google(MODEL_ID),
      system,
      messages,
      onFinish: async ({ text }) => {
        await appendAssistantMessage(sessionId, text);
      },
    });

    return result.toDataStreamResponse();
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (err instanceof ChartNotFoundError) {
      return NextResponse.json({ error: "Chart not found" }, { status: 404 });
    }
    console.error("[POST /api/sessions/:id/chat]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
