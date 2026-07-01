"use client";

import { useState } from "react";
import type { InterpretationRecord } from "@/lib/interpret";
import styles from "./InterpretationSection.module.css";

interface Props {
  chartId: string;
  initial: InterpretationRecord | null;
}

export function InterpretationSection({ chartId, initial }: Props) {
  const [record, setRecord] = useState<InterpretationRecord | null>(initial);
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function generate(force: boolean) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/charts/${chartId}/interpretation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setRecord(data as InterpretationRecord);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Natal Interpretation</h2>
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

      {record ? (
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
          <p>No interpretation yet.</p>
          <button
            className={styles.generateBtn}
            onClick={() => generate(false)}
            disabled={busy}
          >
            {busy ? "Generating…" : "Generate interpretation"}
          </button>
        </div>
      )}
    </section>
  );
}
