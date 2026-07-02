import { notFound } from "next/navigation";
import { getBirthChart } from "@/lib/charts";
import { listSessions, getMessages, createSession } from "@/lib/sessions";
import { ChartWheel } from "@/components/ChartWheel";
import { PositionsTable } from "@/components/PositionsTable";
import { ChatSession } from "@/components/ChatSession";
import { ChartModeToggle } from "@/components/ChartModeToggle";
import styles from "./page.module.css";

interface Props {
  params: { id: string };
}

export default async function ChartPage({ params }: Props) {
  const chart = await getBirthChart(params.id);
  if (!chart) notFound();

  // The natal session: transitChartId = null. One per chart — resolve the
  // existing one (its opener seeded from the cached natal interpretation,
  // per lib/interpret.ts) or create it, exactly like a transit session.
  const sessions = await listSessions(params.id, null);
  const active = sessions[0]
    ? { ...sessions[0], messages: await getMessages(sessions[0].id) }
    : await createSession({ chartId: params.id });

  const displayName = chart.name ? `${chart.name} — ` : "";

  return (
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
  );
}
