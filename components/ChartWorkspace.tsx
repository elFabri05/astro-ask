"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ChartData } from "@/lib/ephemeris";
import type { SessionSummary, SessionWithMessages, MessageRecord } from "@/lib/sessions";
import { CompactChartWheel } from "./CompactChartWheel";
import { ChatSession } from "./ChatSession";
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

interface Props {
  chart:           ChartInfo;
  initialDate:     string;
  initialSessions: SessionSummary[];
  initialActive:   SessionWithMessages;
}

export function ChartWorkspace({ chart, initialDate, initialSessions, initialActive }: Props) {
  const router   = useRouter();
  const pathname = usePathname();

  const [date, setDate]           = useState(initialDate);
  const [sessions, setSessions]   = useState<SessionSummary[]>(initialSessions);
  const [active, setActive]       = useState<SessionWithMessages>(initialActive);
  const [dateLoading, setDateLoading] = useState(false);
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

  function updateUrl(nextDate: string, sessionId: string) {
    router.replace(`${pathname}?date=${nextDate}&session=${sessionId}`, { scroll: false });
  }

  async function handleDateChange(newDate: string) {
    if (!newDate || newDate === date) return;
    setSwitcherOpen(false);
    setDateLoading(true);
    try {
      const list: SessionSummary[] = await fetch(
        `/api/charts/${chart.id}/sessions?date=${newDate}`
      ).then(r => r.json());

      let nextActive: SessionWithMessages;
      let nextList: SessionSummary[];

      if (list.length === 0) {
        const created: SessionWithMessages = await fetch(`/api/charts/${chart.id}/sessions`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ targetDate: newDate }),
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
      setDate(newDate);
      updateUrl(newDate, nextActive.id);
    } finally {
      setDateLoading(false);
    }
  }

  async function handleNewSession() {
    setSwitcherBusy(true);
    try {
      const created: SessionWithMessages = await fetch(`/api/charts/${chart.id}/sessions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ targetDate: date }),
      }).then(r => r.json());

      messagesCache.current.set(created.id, created.messages);
      setSessions(prev => [{ ...created, messageCount: created.messages.length }, ...prev]);
      setActive(created);
      setSwitcherOpen(false);
      updateUrl(date, created.id);
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
    updateUrl(date, id);
  }

  async function refreshSessionTitle() {
    const list: SessionSummary[] = await fetch(
      `/api/charts/${chart.id}/sessions?date=${date}`
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
                {" · "}<span className={styles.activeDate}>{date}</span>
              </p>
            </div>
          </div>

          <div className={styles.controls}>
            <label className={styles.dateField}>
              <span className={styles.dateLabel}>Transits for</span>
              <input
                type="date"
                className={styles.dateInput}
                value={date}
                onChange={e => handleDateChange(e.target.value)}
              />
            </label>

            <div className={styles.switcherWrap}>
              <button
                type="button"
                className={styles.switcherBtn}
                onClick={() => setSwitcherOpen(o => !o)}
                disabled={dateLoading}
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
        {dateLoading ? (
          <div className={styles.loading}>Computing transits for {date}…</div>
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
