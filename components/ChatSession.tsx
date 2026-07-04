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
  // True when this session was just promoted from a transient view: message
  // #1 (opener) and #2 (the user's first message) are already persisted, and
  // this mount must fetch/stream the reply to #2 without re-sending #2 as a
  // new message — see the "resume" branch of experimental_prepareRequestBody.
  resumeOnMount?: boolean;
}

export function ChatSession({ sessionId, initialMessages, resumeOnMount }: Props) {
  const hasAskedBefore = initialMessages.some(m => m.role === "user");
  const pendingResume = useRef(resumeOnMount ?? false);

  const { messages, input, handleInputChange, handleSubmit, append, status, reload } = useChat({
    api: `/api/sessions/${sessionId}/chat`,
    id: sessionId,
    initialMessages,
    experimental_prepareRequestBody: ({ messages }) => {
      if (pendingResume.current) {
        pendingResume.current = false;
        return { resume: true };
      }
      return { message: messages[messages.length - 1] };
    },
  });

  useEffect(() => {
    if (resumeOnMount) void reload();
    // Only ever fires once, right after mount — resumeOnMount is fixed for
    // the lifetime of this component instance (a new promoted session
    // remounts ChatSession via a fresh `key`, see ChartWorkspace).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
