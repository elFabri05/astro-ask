"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { EventsFindResult, RankedEvent, EventWindow } from "@/lib/events/find";
import styles from "./EventFinder.module.css";

const WINDOWS: Array<{ value: EventWindow; label: string }> = [
  { value: "3m",  label: "3 months" },
  { value: "6m",  label: "6 months" },
  { value: "12m", label: "12 months" },
];

const TOPIC_SUGGESTIONS = [
  "My career",
  "A relationship",
  "Money and finances",
  "Health and energy",
];

const KIND_LABELS: Record<RankedEvent["kind"], string> = {
  "transit-natal-aspect": "Transit contact",
  "natal-house-ingress":  "House ingress",
  "lunation":             "Lunation",
  "sky-conjunction":      "Conjunction",
  "station":              "Station",
  "sign-ingress":         "Sign ingress",
};

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

// Minimal renderer for the streamed reading: paragraphs, with **bold** spans
// (the prompt asks for a bold date heading per event).
function renderParagraph(text: string, key: number) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <p key={key}>
      {parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </p>
  );
}

interface Props {
  chartId: string;
}

export function EventFinder({ chartId }: Props) {
  const [topic, setTopic]   = useState("");
  const [window, setWindow] = useState<EventWindow>("6m");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<EventsFindResult | null>(null);
  const [reading, setReading] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<{ message: string; stack?: string } | null>(null);

  // Guards against a stale stream writing into a newer search's reading.
  const searchSeq = useRef(0);

  // In development the API returns the real failure (message + stack, see
  // lib/apiErrors.ts) — pull it out so it lands in the browser, not just the
  // server terminal. Never collapse it back into a generic string.
  async function errorFromResponse(res: Response): Promise<{ message: string; stack?: string }> {
    const body = await res.json().catch(() => null) as
      { error?: unknown; stack?: unknown } | null;
    return {
      message: typeof body?.error === "string" ? body.error : `HTTP ${res.status}`,
      stack:   typeof body?.stack === "string" ? body.stack : undefined,
    };
  }

  async function streamInterpretation(found: EventsFindResult, seq: number) {
    setStreaming(true);
    setReading("");
    try {
      const res = await fetch(`/api/charts/${chartId}/events/interpret`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic:        found.topic,
          topicFactors: found.topicFactors,
          events:       found.events,
        }),
      });
      if (!res.ok || !res.body) {
        const detail = await errorFromResponse(res);
        if (searchSeq.current === seq) {
          setError({ message: `The reading could not be generated: ${detail.message}`, stack: detail.stack });
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (searchSeq.current !== seq) return; // superseded by a newer search
        const chunk = decoder.decode(value, { stream: true });
        setReading(prev => prev + chunk);
      }
    } catch (err) {
      if (searchSeq.current === seq) {
        const message = err instanceof Error ? err.message : String(err);
        setError({ message: `The reading could not be generated: ${message}` });
      }
    } finally {
      if (searchSeq.current === seq) setStreaming(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed || scanning) return;

    const seq = ++searchSeq.current;
    setScanning(true);
    setError(null);
    setResult(null);
    setReading("");

    try {
      const res = await fetch(`/api/charts/${chartId}/events`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ window, topic: trimmed }),
      });
      if (!res.ok) {
        const detail = await errorFromResponse(res);
        if (searchSeq.current === seq) {
          setError({ message: `The scan failed: ${detail.message}`, stack: detail.stack });
          setScanning(false);
        }
        return;
      }
      const found: EventsFindResult = await res.json();
      if (searchSeq.current !== seq) return;

      setResult(found);
      setScanning(false);
      if (found.events.length > 0) void streamInterpretation(found, seq);
    } catch (err) {
      if (searchSeq.current === seq) {
        const message = err instanceof Error ? err.message : String(err);
        setError({ message: `The scan failed: ${message}` });
        setScanning(false);
      }
    }
  }

  const matched = new Set((result?.topicFactors ?? []).map(f => f.toLowerCase()));

  return (
    <div className={styles.finder}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.topicRow}>
          <input
            className={styles.topicInput}
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="What part of life are you asking about?"
            aria-label="Topic"
            maxLength={200}
            disabled={scanning}
          />
          <button
            type="submit"
            className={styles.findBtn}
            disabled={scanning || !topic.trim()}
          >
            {scanning ? "Scanning…" : "Find events"}
          </button>
        </div>

        <div className={styles.optionsRow}>
          <div className={styles.windowGroup} role="radiogroup" aria-label="Time window">
            {WINDOWS.map(w => (
              <button
                key={w.value}
                type="button"
                role="radio"
                aria-checked={window === w.value}
                className={cx(styles.windowBtn, window === w.value && styles.windowBtnActive)}
                onClick={() => setWindow(w.value)}
                disabled={scanning}
              >
                {w.label}
              </button>
            ))}
          </div>

          <div className={styles.chips}>
            {TOPIC_SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                className={styles.chip}
                onClick={() => setTopic(s)}
                disabled={scanning}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </form>

      {error && (
        <div className={styles.error}>
          {error.message}
          {error.stack && <pre className={styles.errorStack}>{error.stack}</pre>}
        </div>
      )}

      {scanning && (
        <div className={styles.scanning}>
          Scanning the sky day by day for significant events…
        </div>
      )}

      {result && (
        <section className={styles.results}>
          <div className={styles.resultsMeta}>
            <span>
              {result.startDate} → {result.endDate}
            </span>
            {result.topicFactors.length > 0 && (
              <span className={styles.factorList}>
                Topic factors:{" "}
                {result.topicFactors.map(f => (
                  <span key={f} className={styles.factorTag}>{f}</span>
                ))}
              </span>
            )}
          </div>

          {result.events.length === 0 ? (
            <p className={styles.empty}>
              No significant events were detected in this window.
            </p>
          ) : (
            <ol className={styles.eventList}>
              {result.events.map((ev, i) => (
                <li key={`${ev.date}-${ev.kind}-${i}`} className={styles.eventCard}>
                  <div className={styles.eventRank}>{i + 1}</div>
                  <div className={styles.eventBody}>
                    <div className={styles.eventHead}>
                      <span className={styles.eventDate}>{fmtDate(ev.date)}</span>
                      <span className={styles.eventKind}>{KIND_LABELS[ev.kind]}</span>
                    </div>
                    <p className={styles.eventDesc}>{ev.description}</p>
                    <div className={styles.eventFactors}>
                      {ev.rawFactors.map(f => (
                        <span
                          key={f}
                          className={cx(
                            styles.eventFactor,
                            matched.has(f.toLowerCase()) && styles.eventFactorMatched
                          )}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link
                    className={styles.openTransit}
                    href={`/chart/${chartId}/transits?date=${ev.date}`}
                  >
                    Open as transit →
                  </Link>
                </li>
              ))}
            </ol>
          )}

          {(reading || streaming) && (
            <div className={styles.reading}>
              {reading.split("\n\n").map((para, i) => renderParagraph(para, i))}
              {streaming && (
                <span className={styles.typing}>
                  <span /><span /><span />
                </span>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
