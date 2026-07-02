"use client";

import { useEffect, useState } from "react";
import styles from "./NatalReading.module.css";

interface InterpretationRecord {
  id:        string;
  chartId:   string;
  type:      string;
  content:   string;
  model:     string;
  createdAt: string;
}

interface Props {
  chartId: string;
}

export function NatalReading({ chartId }: Props) {
  const [record, setRecord]   = useState<InterpretationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/charts/${chartId}/interpretation`)
      .then(res => (res.status === 204 ? null : res.json()))
      .then(data => { if (!cancelled) setRecord(data); })
      .catch(() => { if (!cancelled) setError("Could not load the reading."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chartId]);

  async function generate(force: boolean) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/charts/${chartId}/interpretation`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setRecord(data);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Natal Reading</h2>
        {record && (
          <button
            className={styles.regenBtn}
            onClick={() => generate(true)}
            disabled={busy}
          >
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p className={styles.loading}>Loading…</p>
      ) : record ? (
        <div className={styles.content}>
          {record.content.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          <p className={styles.meta}>
            Model: {record.model} &nbsp;·&nbsp;{" "}
            {new Date(record.createdAt).toLocaleString()}
          </p>
        </div>
      ) : (
        <div className={styles.empty}>
          <p>No reading yet.</p>
          <button
            className={styles.generateBtn}
            onClick={() => generate(false)}
            disabled={busy}
          >
            {busy ? "Generating…" : "Generate reading"}
          </button>
        </div>
      )}
    </section>
  );
}
