"use client";

import { useState } from "react";
import type { SessionWithMessages } from "@/lib/sessions";
import styles from "./ChatSession.module.css";

const SUGGESTIONS = [
  "Career focus",
  "Go deeper on the Moon",
  "What about relationships?",
  "Biggest challenge right now",
];

interface Props {
  chartId: string;
  transitChartId: string;
  openerText: string;
  // Fired once the user's first message has promoted this transit into a
  // real Session (opener + that message already persisted, title set) — the
  // parent swaps this component out for a live ChatSession bound to it.
  onPromoted: (session: SessionWithMessages) => void;
}

// The unsaved view shown after date-select but before any message is sent:
// the cached opener reading plus a ready composer, with nothing written to
// the database yet. Deliberately doesn't use useChat — there's no session to
// bind it to until the first send.
export function TransientTransitChat({ chartId, transitChartId, openerText, onPromoted }: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const session: SessionWithMessages = await fetch(`/api/charts/${chartId}/sessions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ transitChartId, message: trimmed }),
      }).then(r => r.json());
      onPromoted(session);
    } finally {
      setSending(false);
    }
  }

  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input;
    setInput("");
    void send(text);
  }

  return (
    <div className={styles.thread}>
      <div className={styles.messages}>
        <div className={styles.assistantRow}>
          <div className={styles.assistantBubble}>
            {openerText.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
        {sending && (
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
      </div>

      <div className={styles.composer}>
        <div className={styles.chips}>
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              className={styles.chip}
              onClick={() => void send(s)}
              disabled={sending}
            >
              {s}
            </button>
          ))}
        </div>
        <form className={styles.composerForm} onSubmit={onFormSubmit}>
          <input
            className={styles.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about this transit…"
            disabled={sending}
            aria-label="Message"
          />
          <button type="submit" className={styles.sendBtn} disabled={sending || !input.trim()}>
            {sending ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
