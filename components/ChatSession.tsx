"use client";

import { useEffect, useRef } from "react";
import { useChat, type Message } from "@ai-sdk/react";
import styles from "./ChatSession.module.css";

const SUGGESTIONS = [
  "Career focus",
  "Go deeper on the Moon",
  "What about relationships?",
  "Biggest challenge right now",
];

interface Props {
  sessionId: string;
  initialMessages: Message[];
  // Fired once the FIRST exchange's assistant reply finishes streaming — by
  // then the server has long since persisted the user message and derived
  // the session title, so a refetch triggered here never races the write.
  onFirstExchangeComplete?: () => void;
}

export function ChatSession({ sessionId, initialMessages, onFirstExchangeComplete }: Props) {
  const hasAskedBefore = initialMessages.some(m => m.role === "user");
  const firstExchangeNotified = useRef(hasAskedBefore);

  const { messages, input, handleInputChange, handleSubmit, append, status } = useChat({
    api: `/api/sessions/${sessionId}/chat`,
    id: sessionId,
    initialMessages,
    experimental_prepareRequestBody: ({ messages }) => ({
      message: messages[messages.length - 1],
    }),
    onFinish: () => {
      if (!firstExchangeNotified.current) {
        firstExchangeNotified.current = true;
        onFirstExchangeComplete?.();
      }
    },
  });

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    handleSubmit(e);
  }

  function onSuggestion(text: string) {
    if (busy) return;
    append({ role: "user", content: text });
  }

  const showSuggestions = !hasAskedBefore && !messages.some(m => m.role === "user");

  return (
    <div className={styles.thread}>
      <div className={styles.messages}>
        {messages.map(m => (
          <div
            key={m.id}
            className={m.role === "user" ? styles.userRow : styles.assistantRow}
          >
            <div className={m.role === "user" ? styles.userBubble : styles.assistantBubble}>
              {m.content.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        ))}
        {status === "submitted" && (
          <div className={styles.assistantRow}>
            <div className={styles.assistantBubble}>
              <span className={styles.typing}>
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={styles.composer}>
        {showSuggestions && (
          <div className={styles.chips}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                className={styles.chip}
                onClick={() => onSuggestion(s)}
                disabled={busy}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form className={styles.composerForm} onSubmit={onFormSubmit}>
          <input
            className={styles.input}
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about this transit…"
            disabled={busy}
            aria-label="Message"
          />
          <button type="submit" className={styles.sendBtn} disabled={busy || !input.trim()}>
            {busy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
