import { notFound } from "next/navigation";
import { getBirthChart } from "@/lib/charts";
import { listSessions, listSessionsForChart, getMessages, createNatalSession } from "@/lib/sessions";
import { ChartWheel } from "@/components/ChartWheel";
import { PositionsTable } from "@/components/PositionsTable";
import { ChatSession } from "@/components/ChatSession";
import { ChartModeToggle } from "@/components/ChartModeToggle";
import { SessionStack } from "@/components/SessionStack";
import styles from "./page.module.css";

interface Props {
  params: { id: string };
  searchParams: { session?: string };
}

export default async function ChartPage({ params, searchParams }: Props) {
  const chart = await getBirthChart(params.id);
  if (!chart) notFound();

  // The natal session: transitChartId = null. One per chart — resolve the
  // existing one (its opener seeded from the cached natal interpretation,
  // per lib/interpret.ts) or create it, exactly like a transit session.
  // ?session= (from the history stack) selects among natal sessions.
  const sessions = await listSessions(params.id, null);
  const summary =
    (searchParams.session && sessions.find(s => s.id === searchParams.session)) || sessions[0];
  const active = summary
    ? { ...summary, messages: await getMessages(summary.id) }
    : await createNatalSession(params.id);

  // Fetched after the natal session may have been created, so a first visit
  // already shows it in the stack.
  const history = await listSessionsForChart(params.id);

  const displayName = chart.name ? `${chart.name} — ` : "";

  return (
    <div className={styles.layout}>
      <main className={styles.page}>
        <div className={styles.topRow}>
          <div>
            <h1 className={styles.heading}>{displayName}Natal Chart</h1>
            <p className={styles.meta}>
              {chart.birthDate} {chart.birthTime} local &nbsp;·&nbsp; {chart.placeLabel}
              &nbsp;·&nbsp; timezone: <strong>{chart.timezone}</strong>
            </p>
          </div>
          <ChartModeToggle chartId={chart.id} active="natal" />
        </div>

        <ChartWheel chart={chart.chartData} />
        <PositionsTable chart={chart.chartData} />

        <ChatSession
          key={active.id}
          sessionId={active.id}
          initialMessages={active.messages.map(m => ({
            id: m.id, role: m.role, content: m.content, createdAt: m.createdAt,
          }))}
        />
      </main>

      <aside className={styles.historyPane}>
        <SessionStack chartId={chart.id} entries={history} activeSessionId={active.id} />
      </aside>
    </div>
  );
}
