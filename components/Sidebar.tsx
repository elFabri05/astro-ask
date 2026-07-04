"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { BirthChartSummary } from "@/lib/charts";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./Sidebar.module.css";

interface Props {
  charts: BirthChartSummary[];
}

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function chartLabel(chart: BirthChartSummary): string {
  return chart.name?.trim() || `${chart.birthDate} · ${chart.placeLabel}`;
}

export function Sidebar({ charts }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen]       = useState(false);
  const [confirmChart, setConfirmChart] = useState<BirthChartSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeId = pathname.match(/^\/chart\/([^/]+)/)?.[1];

  async function handleConfirmedDelete() {
    const chart = confirmChart;
    if (!chart) return;
    setConfirmChart(null);

    setDeletingId(chart.id);
    try {
      const res = await fetch(`/api/charts/${chart.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) return; // leave it in the list, nothing changed

      if (chart.id === activeId) {
        // Land on the most recent remaining chart, or /new if none are left.
        // Don't also call router.refresh() here: it re-validates the
        // CURRENT (now-deleted) route, which 404s and can win the race
        // against the pending push, stranding the user on a dead page.
        const remaining = charts.filter(c => c.id !== chart.id);
        router.push(remaining.length > 0 ? `/chart/${remaining[0].id}` : "/new");
      } else {
        router.refresh(); // still here — just drop the deleted chart from the list
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.hamburger}
        onClick={() => setOpen(true)}
        aria-label="Open chart list"
      >
        <span />
        <span />
        <span />
      </button>

      {open && <div className={styles.scrim} onClick={() => setOpen(false)} />}

      <aside className={cx(styles.sidebar, open && styles.sidebarOpen)}>
        <div className={styles.brand}>Astro Ask</div>

        <Link href="/new" className={styles.newBtn} onClick={() => setOpen(false)}>
          ＋ New chart
        </Link>

        <nav className={styles.list} aria-label="Saved charts">
          {charts.length === 0 ? (
            <p className={styles.empty}>No charts yet — create your first one.</p>
          ) : (
            charts.map(chart => (
              <div key={chart.id} className={styles.itemRow}>
                <Link
                  href={`/chart/${chart.id}`}
                  className={cx(styles.item, chart.id === activeId && styles.itemActive)}
                  onClick={() => setOpen(false)}
                >
                  {chartLabel(chart)}
                </Link>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => setConfirmChart(chart)}
                  disabled={deletingId === chart.id}
                  aria-label={`Delete ${chartLabel(chart)}`}
                  title="Delete chart"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </nav>
      </aside>

      {confirmChart && (
        <ConfirmDialog
          title="Delete chart?"
          message={
            <>
              This permanently removes <strong>“{chartLabel(confirmChart)}”</strong> along with its
              readings and chat history.
            </>
          }
          confirmLabel="Delete"
          onConfirm={handleConfirmedDelete}
          onCancel={() => setConfirmChart(null)}
        />
      )}
    </>
  );
}
