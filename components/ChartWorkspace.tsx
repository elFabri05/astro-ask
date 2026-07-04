"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ChartData } from "@/lib/ephemeris";
import type {
  SessionSummary, SessionWithMessages, MessageRecord, ChartSessionEntry,
} from "@/lib/sessions";
import { CompactChartWheel } from "./CompactChartWheel";
import { ChatSession } from "./ChatSession";
import { TransientTransitChat } from "./TransientTransitChat";
import { SessionStack, type SessionStackEntry } from "./SessionStack";
import { PlaceAutocomplete, type ResolvedPlace } from "./PlaceAutocomplete";
import styles from "./ChartWorkspace.module.css";

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

function signLabel(lon: number): string {
  return `${(lon % 30).toFixed(0)}° ${SIGNS[Math.floor(lon / 30)]}`;
}

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

interface ChartInfo {
  id:         string;
  name:       string | null;
  birthDate:  string;
  birthTime:  string;
  placeLabel: string;
  chartData:  ChartData;
}

// The resolved TransitChart currently loaded — the unit sessions group by.
// localTime/placeLabel are null when defaulted (noon UTC, natal location).
// opener is the cached transient reading, computed eagerly on date-select
// independent of whether any Session exists yet for this combination.
interface TransitContext {
  id:         string;
  targetDate: string;
  localTime:  string | null;
  timezone:   string | null;
  placeLabel: string | null;
  latitude:   number;
  longitude:  number;
  opener:     string;
}

interface Props {
  chart:           ChartInfo;
  initialTransit:  TransitContext;
  initialSessions: SessionSummary[];
  // null = no Session exists yet for initialTransit; the workspace renders
  // the transient (unsaved) view until the user's first message.
  initialActive:   SessionWithMessages | null;
  // Every session on the chart across all transit dates (plus natal) — the
  // Conversations stack. Broader than initialSessions, which is per-transit.
  initialHistory:  ChartSessionEntry[];
}

// Distinguishes two different transits on the same calendar date — e.g.
// "2026-07-03" vs. "2026-07-03 · 21:00 UTC+9 · Tokyo, Japan".
function transitLabel(t: TransitContext): string {
  let label: string = t.targetDate;
  if (t.localTime) label += ` · ${t.localTime}${t.timezone ? ` (${t.timezone})` : ""}`;
  if (t.placeLabel) label += ` · ${t.placeLabel}`;
  return label;
}

export function ChartWorkspace({
  chart, initialTransit, initialSessions, initialActive, initialHistory,
}: Props) {
  const router   = useRouter();
  const pathname = usePathname();

  // Pending form inputs — only take effect on submit, so typing into the
  // place autocomplete doesn't refetch on every keystroke.
  const [formDate, setFormDate]   = useState(initialTransit.targetDate);
  const [formTime, setFormTime]   = useState(initialTransit.localTime ?? "");
  const [formPlace, setFormPlace] = useState<ResolvedPlace | null>(
    initialTransit.placeLabel
      ? { label: initialTransit.placeLabel, latitude: initialTransit.latitude, longitude: initialTransit.longitude }
      : null
  );

  const [transit, setTransit]     = useState<TransitContext>(initialTransit);
  const [sessions, setSessions]   = useState<SessionSummary[]>(initialSessions);
  const [active, setActive]       = useState<SessionWithMessages | null>(initialActive);
  const [history, setHistory]     = useState<ChartSessionEntry[]>(initialHistory);
  const [applying, setApplying]   = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [switcherBusy, setSwitcherBusy] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const messagesCache = useRef<Map<string, MessageRecord[]>>(
    new Map(initialActive ? [[initialActive.id, initialActive.messages]] : [])
  );

  useEffect(() => {
    function onScroll() {
      setCollapsed(window.scrollY > 28);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function updateUrl(nextTransit: TransitContext, sessionId: string | null) {
    const qs = new URLSearchParams({ date: nextTransit.targetDate });
    if (sessionId) qs.set("session", sessionId);
    if (nextTransit.localTime) qs.set("time", nextTransit.localTime);
    if (nextTransit.placeLabel) {
      qs.set("placeLabel", nextTransit.placeLabel);
      qs.set("placeLat", String(nextTransit.latitude));
      qs.set("placeLng", String(nextTransit.longitude));
    }
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  }

  function isSameTarget(): boolean {
    return (
      formDate === transit.targetDate &&
      (formTime || null) === transit.localTime &&
      (formPlace?.label ?? null) === transit.placeLabel
    );
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!formDate || isSameTarget()) return;
    setSwitcherOpen(false);
    setApplying(true);
    try {
      const qs = new URLSearchParams({ date: formDate });
      if (formTime) qs.set("time", formTime);
      if (formPlace) {
        qs.set("placeLabel", formPlace.label);
        qs.set("placeLat", String(formPlace.latitude));
        qs.set("placeLng", String(formPlace.longitude));
      }

      // Resolve (and compute, if never explored before) the TransitChart +
      // its opener for this exact date+time+place — sessions group by the
      // TransitChart's id, not the date. No Session is created here.
      const nextTransit: TransitContext = await fetch(
        `/api/charts/${chart.id}/transits?${qs.toString()}`
      ).then(r => r.json());

      const list: SessionSummary[] = await fetch(
        `/api/charts/${chart.id}/sessions?transitChartId=${nextTransit.id}`
      ).then(r => r.json());

      let nextActive: SessionWithMessages | null;

      if (list.length === 0) {
        // No Session for this transit yet — render the transient view.
        nextActive = null;
      } else {
        const newest = list[0];
        const messages: MessageRecord[] = await fetch(
          `/api/sessions/${newest.id}/messages`
        ).then(r => r.json());
        nextActive = { ...newest, messages };
      }

      if (nextActive) messagesCache.current.set(nextActive.id, nextActive.messages);
      setSessions(list);
      setActive(nextActive);
      setTransit(nextTransit);
      updateUrl(nextTransit, nextActive?.id ?? null);
    } finally {
      setApplying(false);
    }
  }

  // "New session" on an already-explored transit never creates a Session
  // directly — it just resets to a fresh transient view (same cached
  // opener), which persists on its own first message like any other.
  function handleNewSession() {
    setSwitcherOpen(false);
    setActive(null);
    updateUrl(transit, null);
  }

  // Called by TransientTransitChat once the user's first message has
  // promoted the transit into a real Session.
  function handlePromoted(session: SessionWithMessages) {
    messagesCache.current.set(session.id, session.messages);
    setSessions(prev => [{ ...session, messageCount: session.messages.length }, ...prev]);
    setHistory(prev => [
      {
        id:        session.id,
        title:     session.title,
        createdAt: session.createdAt,
        kind:      "transit",
        transitContext: {
          transitChartId: transit.id,
          targetDate:     transit.targetDate,
          ...(transit.localTime  && { localTime:  transit.localTime }),
          ...(transit.placeLabel && { placeLabel: transit.placeLabel }),
        },
        lastMessageAt: session.createdAt,
        messageCount:  session.messages.length,
      },
      ...prev,
    ]);
    setActive(session);
    updateUrl(transit, session.id);
  }

  async function handleSelectSession(id: string) {
    setSwitcherOpen(false);
    if (id === active?.id) return;
    const summary = sessions.find(s => s.id === id);
    if (!summary) return;

    let messages = messagesCache.current.get(id);
    if (!messages) {
      setSwitcherBusy(true);
      messages = await fetch(`/api/sessions/${id}/messages`).then(r => r.json());
      messagesCache.current.set(id, messages!);
      setSwitcherBusy(false);
    }

    setActive({ ...summary, messages: messages! });
    updateUrl(transit, id);
  }

  // A click in the Conversations stack. Natal sessions live on the natal
  // page; sessions of the loaded transit swap in place; sessions of another
  // transit restore that exact TransitChart by id (never re-resolved from
  // date+time+place) along with its session list, then open the thread.
  async function handleStackSelect(entry: SessionStackEntry) {
    if (entry.id === active?.id) return;

    if (entry.kind === "natal") {
      router.push(`/chart/${chart.id}?session=${entry.id}`);
      return;
    }

    const targetTransitId = entry.transitContext?.transitChartId;
    if (!targetTransitId) return;

    if (targetTransitId === transit.id) {
      void handleSelectSession(entry.id);
      return;
    }

    setSwitcherOpen(false);
    setRestoring(true);
    try {
      const cached = messagesCache.current.get(entry.id);
      const [nextTransit, list, messages] = await Promise.all([
        fetch(`/api/charts/${chart.id}/transits?transitChartId=${targetTransitId}`)
          .then(r => r.json()) as Promise<TransitContext>,
        fetch(`/api/charts/${chart.id}/sessions?transitChartId=${targetTransitId}`)
          .then(r => r.json()) as Promise<SessionSummary[]>,
        cached ?? (fetch(`/api/sessions/${entry.id}/messages`)
          .then(r => r.json()) as Promise<MessageRecord[]>),
      ]);

      const summary = list.find(s => s.id === entry.id);
      if (!summary) return;

      messagesCache.current.set(entry.id, messages);
      setTransit(nextTransit);
      setSessions(list);
      setActive({ ...summary, messages });
      // Keep the header form in step with the restored transit.
      setFormDate(nextTransit.targetDate);
      setFormTime(nextTransit.localTime ?? "");
      setFormPlace(nextTransit.placeLabel
        ? { label: nextTransit.placeLabel, latitude: nextTransit.latitude, longitude: nextTransit.longitude }
        : null);
      updateUrl(nextTransit, entry.id);
    } finally {
      setRestoring(false);
    }
  }

  // A session was deleted from the stack (already gone server-side). Drop it
  // from local state; if it was the open thread, fall back to the transient
  // opening-reading view for the loaded transit — the same state as "date
  // selected, no message sent yet". Never auto-open another session.
  function handleDeleted(entry: SessionStackEntry) {
    messagesCache.current.delete(entry.id);
    setHistory(prev => prev.filter(e => e.id !== entry.id));
    setSessions(prev => prev.filter(s => s.id !== entry.id));
    if (entry.id === active?.id) {
      setActive(null);
      updateUrl(transit, null);
    }
  }

  const sun  = chart.chartData.positions.find(p => p.body === "Sun");
  const moon = chart.chartData.positions.find(p => p.body === "Moon");

  return (
    <div className={styles.page}>
      <header className={cx(styles.header, collapsed && styles.collapsed)}>
        <div className={styles.headerInner}>
          <div className={styles.identity}>
            <CompactChartWheel
              positions={chart.chartData.positions}
              houses={chart.chartData.houses}
              ascendant={chart.chartData.ascendant}
              size={collapsed ? 40 : 128}
              compact={collapsed}
            />
            <div className={styles.identityText}>
              <h1 className={styles.name}>{chart.name ?? "Natal Chart"}</h1>
              {!collapsed && (
                <p className={styles.birthMeta}>
                  {chart.birthDate} {chart.birthTime} · {chart.placeLabel}
                </p>
              )}
              <p className={styles.quickFacts}>
                {sun && <>Sun {signLabel(sun.longitude)}</>}
                {moon && <> · Moon {signLabel(moon.longitude)}</>}
                {" · "}Asc {signLabel(chart.chartData.ascendant)}
                {" · "}<span className={styles.activeDate}>{transitLabel(transit)}</span>
              </p>
            </div>
          </div>

          <div className={styles.controls}>
            <form className={styles.transitForm} onSubmit={handleApply}>
              <label className={styles.dateField}>
                <span className={styles.dateLabel}>Date</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  required
                />
              </label>

              <label className={styles.dateField}>
                <span className={styles.dateLabel}>Time (optional)</span>
                <input
                  type="time"
                  className={styles.dateInput}
                  value={formTime}
                  onChange={e => setFormTime(e.target.value)}
                />
                <span className={styles.fieldHint}>Defaults to 12:00 UTC</span>
              </label>

              <div className={styles.placeField}>
                <span className={styles.dateLabel}>Place (optional)</span>
                <PlaceAutocomplete value={formPlace} onChange={setFormPlace} />
                <span className={styles.fieldHint}>Defaults to {chart.placeLabel}</span>
              </div>

              <button type="submit" className={styles.applyBtn} disabled={applying || isSameTarget()}>
                {applying ? "Updating…" : "Update"}
              </button>
            </form>

            <div className={styles.switcherWrap}>
              <button
                type="button"
                className={styles.switcherBtn}
                onClick={() => setSwitcherOpen(o => !o)}
                disabled={applying}
              >
                {active?.title ?? "New session"} <span className={styles.chevron}>▾</span>
              </button>

              {switcherOpen && (
                <div className={styles.switcherMenu}>
                  {sessions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={cx(styles.switcherItem, s.id === active?.id && styles.switcherItemActive)}
                      onClick={() => handleSelectSession(s.id)}
                      disabled={switcherBusy}
                    >
                      <span className={styles.switcherTitle}>{s.title ?? "New session"}</span>
                      <span className={styles.switcherMeta}>
                        {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {" · "}{s.messageCount} msg{s.messageCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.newSessionBtn}
                    onClick={handleNewSession}
                    disabled={switcherBusy || !active}
                  >
                    + New session
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.threadCol}>
          {applying ? (
            <div className={styles.loading}>Computing transits for {formDate}…</div>
          ) : restoring ? (
            <div className={styles.loading}>Opening conversation…</div>
          ) : active ? (
            <ChatSession
              key={active.id}
              sessionId={active.id}
              initialMessages={active.messages.map(m => ({
                id: m.id, role: m.role, content: m.content, createdAt: m.createdAt,
              }))}
              resumeOnMount={active.messages.length === 2}
            />
          ) : (
            <TransientTransitChat
              key={transit.id}
              chartId={chart.id}
              transitChartId={transit.id}
              openerText={transit.opener}
              onPromoted={handlePromoted}
            />
          )}
        </div>

        <aside className={styles.historyCol}>
          <SessionStack
            chartId={chart.id}
            entries={history}
            activeSessionId={active?.id ?? null}
            onSelect={handleStackSelect}
            onDeleted={handleDeleted}
            busy={applying || restoring}
          />
        </aside>
      </main>
    </div>
  );
}
