"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BirthChartSummary } from "@/lib/charts";
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
  const [open, setOpen] = useState(false);

  const activeId = pathname.match(/^\/chart\/([^/]+)/)?.[1];

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
              <Link
                key={chart.id}
                href={`/chart/${chart.id}`}
                className={cx(styles.item, chart.id === activeId && styles.itemActive)}
                onClick={() => setOpen(false)}
              >
                {chartLabel(chart)}
              </Link>
            ))
          )}
        </nav>
      </aside>
    </>
  );
}
