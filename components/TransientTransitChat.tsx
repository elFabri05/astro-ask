"use client";

import { useState } from "react";
import type { SessionWithMessages } from "@/lib/sessions";
import type { OpenerFailureReason } from "@/lib/interpret";
import styles from "./ChatSession.module.css";

const SUGGESTIONS = [
  "Career focus",
  "Go deeper on the Moon",
  "What about relationships?",
  "Biggest challenge right now",
];

const FAILURE_MESSAGES: Record<OpenerFailureReason, string> = {
  rate_limited:
    "The interpretation model is rate-limited right now — try again shortly.",
  generation_failed:
    "Couldn't load the opening reading for this transit.",
};

interface Props {
  chartId: string;
  transitChartId: string;
  // null when generation failed (see openerFailure) — never assume present.
  openerText: string | null;
  openerFailure: OpenerFailureReason | null;
  // True while a retry of the opener generation is in flight.
  openerLoading: boolean;
  onRetryOpener: () => void;
  // Fired once the user's first message has promoted this transit into a
  // real Session (opener + that message already persisted, title set) — the
  // parent swaps this component out for a live ChatSession bound to it.
  onPromoted: (session: SessionWithMessages) => void;
}

// The unsaved view shown after date-select but before any message is sent:
// the cached opener reading plus a ready composer, with nothing written to
// the database yet. Deliberately doesn't use useChat — there's no session to
// bind it to until the first send.
//
// The opener bubble has three explicit states: loading (retry in flight),
// ready (text present), failed (text missing → reason-specific fallback with
// Retry). Failed must never look like loading — an infinite spinner would
// hide the generation failure just as effectively as a crash.
export function TransientTransitChat({
  chartId, transitChartId, openerText, openerFailure, openerLoading, onRetryOpener, onPromoted,
}: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const openerState: "loading" | "ready" | "failed" =
    openerLoading ? "loading" : openerText ? "ready" : "failed";

  // Promotion adopts the cached opener as message #1; without one, sending
  // would force a regeneration that likely fails the same way — so the
  // composer stays disabled until the opener is ready.
  const composerDisabled = sending || openerState !== "ready";

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || composerDisabled) return;
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
            {openerState === "loading" ? (
              <span className={styles.typing}>
                <span />
                <span />
                <span />
              </span>
            ) : openerState === "ready" ? (
              openerText!.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))
            ) : (
              <div className={styles.openerFallback}>
                <p>{FAILURE_MESSAGES[openerFailure ?? "generation_failed"]}</p>
                <button type="button" className={styles.retryBtn} onClick={onRetryOpener}>
                  Retry
                </button>
              </div>
            )}
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
              disabled={composerDisabled}
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
            disabled={composerDisabled}
            aria-label="Message"
          />
          <button type="submit" className={styles.sendBtn} disabled={composerDisabled || !input.trim()}>
            {sending ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
