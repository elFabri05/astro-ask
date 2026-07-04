import { notFound } from "next/navigation";
import { getBirthChart } from "@/lib/charts";
import { getOrCreateTransitChart } from "@/lib/transits";
import { getOrCreateTransitOpener } from "@/lib/interpret";
import { listSessions, getMessages, type SessionSummary } from "@/lib/sessions";
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

  // Resolve (not force-create) the transit for this combination, mirroring
  // the client-side apply flow: reuse whatever's cached, compute only if this
  // exact date+time+place has never been explored on this chart. The opener
  // is cached the same way, independent of any Session.
  const transitChart = await getOrCreateTransitChart(params.id, {
    targetDate,
    localTime: searchParams.time,
    place,
  });
  const opener = await getOrCreateTransitOpener(params.id, transitChart.id);
  const sessions = await listSessions(params.id, transitChart.id);

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
          longitude:  transitChart.longitude,
          opener:     opener.content,
        }}
        initialSessions={sessions}
        initialActive={active}
      />
    </div>
  );
}
