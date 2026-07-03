"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ChartData } from "@/lib/ephemeris";
import type { SessionSummary, SessionWithMessages, MessageRecord } from "@/lib/sessions";
import { CompactChartWheel } from "./CompactChartWheel";
import { ChatSession } from "./ChatSession";
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
interface TransitContext {
  id:         string;
  targetDate: string;
  localTime:  string | null;
  timezone:   string | null;
  placeLabel: string | null;
  latitude:   number;
  longitude:  number;
}

interface Props {
  chart:           ChartInfo;
  initialTransit:  TransitContext;
  initialSessions: SessionSummary[];
  initialActive:   SessionWithMessages;
}

// Distinguishes two different transits on the same calendar date — e.g.
// "2026-07-03" vs. "2026-07-03 · 21:00 UTC+9 · Tokyo, Japan".
function transitLabel(t: TransitContext): string {
  let label: string = t.targetDate;
  if (t.localTime) label += ` · ${t.localTime}${t.timezone ? ` (${t.timezone})` : ""}`;
  if (t.placeLabel) label += ` · ${t.placeLabel}`;
  return label;
}

export function ChartWorkspace({ chart, initialTransit, initialSessions, initialActive }: Props) {
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
  const [active, setActive]       = useState<SessionWithMessages>(initialActive);
  const [applying, setApplying]   = useState(false);
  const [switcherBusy, setSwitcherBusy] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const messagesCache = useRef<Map<string, MessageRecord[]>>(
    new Map([[initialActive.id, initialActive.messages]])
  );

  useEffect(() => {
    function onScroll() {
      setCollapsed(window.scrollY > 28);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function updateUrl(nextTransit: TransitContext, sessionId: string) {
    const qs = new URLSearchParams({ date: nextTransit.targetDate, session: sessionId });
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

      // Resolve (and create, if never explored before) the TransitChart for
      // this exact date+time+place — sessions group by its id, not the date.
      const nextTransit: TransitContext = await fetch(
        `/api/charts/${chart.id}/transits?${qs.toString()}`
      ).then(r => r.json());

      const list: SessionSummary[] = await fetch(
        `/api/charts/${chart.id}/sessions?transitChartId=${nextTransit.id}`
      ).then(r => r.json());

      let nextActive: SessionWithMessages;
      let nextList: SessionSummary[];

      if (list.length === 0) {
        const created: SessionWithMessages = await fetch(`/api/charts/${chart.id}/sessions`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            targetDate: formDate,
            localTime:  formTime || undefined,
            place:      formPlace ?? undefined,
          }),
        }).then(r => r.json());
        nextActive = created;
        nextList = [{ ...created, messageCount: created.messages.length }];
      } else {
        const newest = list[0];
        const messages: MessageRecord[] = await fetch(
          `/api/sessions/${newest.id}/messages`
        ).then(r => r.json());
        nextActive = { ...newest, messages };
        nextList = list;
      }

      messagesCache.current.set(nextActive.id, nextActive.messages);
      setSessions(nextList);
      setActive(nextActive);
      setTransit(nextTransit);
      updateUrl(nextTransit, nextActive.id);
    } finally {
      setApplying(false);
    }
  }

  async function handleNewSession() {
    setSwitcherBusy(true);
    try {
      const created: SessionWithMessages = await fetch(`/api/charts/${chart.id}/sessions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          targetDate: transit.targetDate,
          localTime:  transit.localTime ?? undefined,
          place:      transit.placeLabel
            ? { label: transit.placeLabel, latitude: transit.latitude, longitude: transit.longitude }
            : undefined,
        }),
      }).then(r => r.json());

      messagesCache.current.set(created.id, created.messages);
      setSessions(prev => [{ ...created, messageCount: created.messages.length }, ...prev]);
      setActive(created);
      setSwitcherOpen(false);
      updateUrl(transit, created.id);
    } finally {
      setSwitcherBusy(false);
    }
  }

  async function handleSelectSession(id: string) {
    setSwitcherOpen(false);
    if (id === active.id) return;
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

  async function refreshSessionTitle() {
    const list: SessionSummary[] = await fetch(
      `/api/charts/${chart.id}/sessions?transitChartId=${transit.id}`
    ).then(r => r.json());
    setSessions(list);

    // The switcher's toggle label reads active.title directly — patch it too,
    // not just the dropdown list, or it stays stuck on "New session".
    const updated = list.find(s => s.id === active.id);
    if (updated) setActive(prev => ({ ...prev, title: updated.title }));
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
                {active.title ?? "New session"} <span className={styles.chevron}>▾</span>
              </button>

              {switcherOpen && (
                <div className={styles.switcherMenu}>
                  {sessions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={cx(styles.switcherItem, s.id === active.id && styles.switcherItemActive)}
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
                    disabled={switcherBusy}
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
        {applying ? (
          <div className={styles.loading}>Computing transits for {formDate}…</div>
        ) : (
          <ChatSession
            key={active.id}
            sessionId={active.id}
            initialMessages={active.messages.map(m => ({
              id: m.id, role: m.role, content: m.content, createdAt: m.createdAt,
            }))}
            onFirstExchangeComplete={() => { void refreshSessionTitle(); }}
          />
        )}
      </main>
    </div>
  );
}
