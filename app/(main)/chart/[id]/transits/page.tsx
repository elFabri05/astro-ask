import { notFound } from "next/navigation";
import { getBirthChart } from "@/lib/charts";
import { getOrCreateTransitChart } from "@/lib/transits";
import { createSession, listSessions, getMessages, type SessionSummary } from "@/lib/sessions";
import { ChartWorkspace } from "@/components/ChartWorkspace";
import { ChartModeToggle } from "@/components/ChartModeToggle";
import styles from "./page.module.css";

interface Props {
  params: { id: string };
  searchParams: { date?: string; session?: string };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function ChartTransitsPage({ params, searchParams }: Props) {
  const chart = await getBirthChart(params.id);
  if (!chart) notFound();

  const targetDate = searchParams.date ?? todayIso();

  // Resolve (not force-create) the transit + session for this date, mirroring
  // the client-side date-change flow: reuse whatever's cached, create only
  // if this date has never been explored on this chart.
  const transitChart = await getOrCreateTransitChart(params.id, targetDate);
  let sessions = await listSessions(params.id, transitChart.id);

  let activeSummary: SessionSummary | undefined =
    (searchParams.session && sessions.find(s => s.id === searchParams.session)) || sessions[0];

  const active = activeSummary
    ? { ...activeSummary, messages: await getMessages(activeSummary.id) }
    : await createSession({ chartId: params.id, targetDate });

  if (!activeSummary) {
    sessions = [{ ...active, messageCount: active.messages.length }, ...sessions];
  }

  return (
    <div>
      <div className={styles.toggleRow}>
        <ChartModeToggle chartId={chart.id} active="transits" />
      </div>
      <ChartWorkspace
        chart={{
          id:         chart.id,
          name:       chart.name,
          birthDate:  chart.birthDate,
          birthTime:  chart.birthTime,
          placeLabel: chart.placeLabel,
          chartData:  chart.chartData,
        }}
        initialDate={targetDate}
        initialSessions={sessions}
        initialActive={active}
      />
    </div>
  );
}
