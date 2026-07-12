import { notFound } from "next/navigation";
import { getBirthChart } from "@/lib/charts";
import { getOrCreateTransitChart, getTransitChartById, type TransitChartRecord } from "@/lib/transits";
import { resolveTransitOpener } from "@/lib/interpret";
import {
  listSessions, listSessionsForChart, getSession, getMessages, type SessionSummary,
} from "@/lib/sessions";
import { ChartWorkspace } from "@/components/ChartWorkspace";
import { ChartModeToggle } from "@/components/ChartModeToggle";
import styles from "./page.module.css";

interface Props {
  params: { id: string };
  searchParams: {
    date?: string;
    session?: string;
    time?: string;
    placeLabel?: string;
    placeLat?: string;
    placeLng?: string;
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function ChartTransitsPage({ params, searchParams }: Props) {
  const chart = await getBirthChart(params.id);
  if (!chart) notFound();

  const targetDate = searchParams.date ?? todayIso();
  const place =
    searchParams.placeLabel && searchParams.placeLat && searchParams.placeLng
      ? {
          label:     searchParams.placeLabel,
          latitude:  Number(searchParams.placeLat),
          longitude: Number(searchParams.placeLng),
        }
      : undefined;

  // Arriving via the history stack (?session=): restore that session's exact
  // TransitChart by id, never re-resolved from date+time+place — the thread
  // must reopen against the transit it was held on.
  let transitChart: TransitChartRecord | null = null;
  if (searchParams.session) {
    const requested = await getSession(searchParams.session);
    if (requested && requested.chartId === params.id && requested.transitChartId) {
      transitChart = await getTransitChartById(requested.transitChartId);
    }
  }

  // Otherwise resolve (not force-create) the transit for this combination,
  // mirroring the client-side apply flow: reuse whatever's cached, compute
  // only if this exact date+time+place has never been explored on this
  // chart. The opener is cached the same way, independent of any Session.
  if (!transitChart) {
    transitChart = await getOrCreateTransitChart(params.id, {
      targetDate,
      localTime: searchParams.time,
      place,
    });
  }
  // Non-throwing: a failed generation (e.g. Gemini quota) must not 500 the
  // page — the workspace renders a retryable fallback for the opener instead.
  const opener = await resolveTransitOpener(params.id, transitChart.id);
  const sessions = await listSessions(params.id, transitChart.id);
  const history = await listSessionsForChart(params.id);

  const activeSummary: SessionSummary | undefined =
    (searchParams.session && sessions.find(s => s.id === searchParams.session)) || sessions[0];

  // No Session is created here — if none exists yet for this transit
  // combination, the workspace renders a transient (unsaved) view seeded
  // from the opener above until the user sends their first message.
  const active = activeSummary
    ? { ...activeSummary, messages: await getMessages(activeSummary.id) }
    : null;

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
        initialTransit={{
          id:         transitChart.id,
          targetDate: transitChart.targetDate,
          localTime:  transitChart.localTime,
          timezone:   transitChart.timezone,
          placeLabel: transitChart.placeLabel,
          latitude:   transitChart.latitude,
          longitude:     transitChart.longitude,
          opener:        opener.ok ? opener.record.content : null,
          openerFailure: opener.ok ? null : opener.reason,
        }}
        initialSessions={sessions}
        initialActive={active}
        initialHistory={history}
      />
    </div>
  );
}
