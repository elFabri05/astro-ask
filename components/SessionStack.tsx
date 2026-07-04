"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./SessionStack.module.css";

// Serialized ChartSessionEntry (see lib/sessions.ts) — dates arrive as Date
// from RSC props or as ISO strings from fetch; both are normalized here.
export interface SessionStackEntry {
  id:        string;
  title:     string | null;
  createdAt: string | Date;
  kind:      "natal" | "transit";
  transitContext?: {
    transitChartId: string;
    targetDate:     string;
    localTime?:     string;
    placeLabel?:    string;
  };
  lastMessageAt: string | Date;
  messageCount:  number;
}

interface Props {
  chartId: string;
  entries: SessionStackEntry[];
  activeSessionId: string | null;
  // Views that can swap context in place (the transit workspace) override
  // this; the default navigates to the entry's home view with ?session=.
  onSelect?: (entry: SessionStackEntry) => void;
  // Called once a session has been deleted server-side, so the owning view
  // can drop it from its own state; the default refreshes the route instead.
  onDeleted?: (entry: SessionStackEntry) => void;
  busy?: boolean;
}

// Where a session lives: natal sessions open in the natal view's chat,
// transit sessions in the transits workspace, which restores the exact
// TransitChart from the session id server-side.
export function sessionHref(chartId: string, entry: SessionStackEntry): string {
  return entry.kind === "natal"
    ? `/chart/${chartId}?session=${entry.id}`
    : `/chart/${chartId}/transits?session=${entry.id}`;
}

function contextLabel(entry: SessionStackEntry): string {
  if (entry.kind === "natal") return "Birth chart";
  const t = entry.transitContext;
  if (!t) return "Transit";
  let label = t.targetDate;
  if (t.localTime) label += ` · ${t.localTime}`;
  if (t.placeLabel) label += ` · ${t.placeLabel}`;
  return label;
}

function timeAgo(value: string | Date): string {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

// The cross-date history for a chart: every conversation, newest activity
// first, each card self-describing (title + natal/transit context + activity
// meta). Clicking a card reopens that conversation in its own context.
export function SessionStack({ chartId, entries, activeSessionId, onSelect, onDeleted, busy }: Props) {
  const router = useRouter();
  const [confirmEntry, setConfirmEntry] = useState<SessionStackEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleClick(entry: SessionStackEntry) {
    if (entry.id === activeSessionId) return;
    if (onSelect) onSelect(entry);
    else router.push(sessionHref(chartId, entry));
  }

  // Same confirm→delete→reroute pattern as chart-delete in the Sidebar,
  // confirmed via the in-app ConfirmDialog. Only the Session and its messages
  // go; the transit and its cached reading are shared with sibling sessions
  // and survive.
  async function handleConfirmedDelete() {
    const entry = confirmEntry;
    if (!entry) return;
    setConfirmEntry(null);

    setDeletingId(entry.id);
    try {
      const res = await fetch(`/api/sessions/${entry.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) return; // leave the row, nothing changed

      if (onDeleted) onDeleted(entry);
      else router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <nav className={styles.panel} aria-label="Conversation history">
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Conversations</h2>
        {entries.length > 0 && <span className={styles.panelCount}>{entries.length}</span>}
      </div>

      {entries.length === 0 ? (
        <p className={styles.empty}>
          No conversations yet. Ask a question about this chart and it will be saved here.
        </p>
      ) : (
        <ol className={styles.list}>
          {entries.map(entry => {
            const isActive = entry.id === activeSessionId;
            const isDeleting = entry.id === deletingId;
            return (
              <li key={entry.id} className={styles.item}>
                <button
                  type="button"
                  className={cx(styles.card, isActive && styles.cardActive)}
                  onClick={() => handleClick(entry)}
                  disabled={busy || isDeleting}
                  aria-current={isActive || undefined}
                >
                  <span className={cx(styles.node, isActive && styles.nodeActive)} aria-hidden />
                  <span className={styles.context}>
                    <span
                      className={cx(
                        styles.kindTag,
                        entry.kind === "natal" ? styles.kindNatal : styles.kindTransit
                      )}
                    >
                      {entry.kind}
                    </span>
                    <span className={styles.contextText}>{contextLabel(entry)}</span>
                  </span>
                  <span className={styles.title}>{entry.title ?? "New conversation"}</span>
                  <span className={styles.meta} suppressHydrationWarning>
                    {entry.messageCount} message{entry.messageCount === 1 ? "" : "s"}
                    {" · "}{timeAgo(entry.lastMessageAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => setConfirmEntry(entry)}
                  disabled={busy || isDeleting}
                  aria-label={`Delete conversation "${entry.title ?? "New conversation"}"`}
                  title="Delete conversation"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {confirmEntry && (
        <ConfirmDialog
          title="Delete conversation?"
          message={
            <>
              This permanently removes <strong>“{confirmEntry.title ?? "New conversation"}”</strong>{" "}
              and its {confirmEntry.messageCount} message{confirmEntry.messageCount === 1 ? "" : "s"}.
            </>
          }
          confirmLabel="Delete"
          onConfirm={handleConfirmedDelete}
          onCancel={() => setConfirmEntry(null)}
        />
      )}
    </nav>
  );
}
