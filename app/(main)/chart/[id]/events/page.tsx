import { notFound } from "next/navigation";
import { getBirthChart } from "@/lib/charts";
import { ChartModeToggle } from "@/components/ChartModeToggle";
import { EventFinder } from "@/components/EventFinder";
import styles from "./page.module.css";

interface Props {
  params: { id: string };
}

export default async function ChartEventsPage({ params }: Props) {
  const chart = await getBirthChart(params.id);
  if (!chart) notFound();

  const displayName = chart.name ? `${chart.name} — ` : "";

  return (
    <main className={styles.page}>
      <div className={styles.topRow}>
        <div>
          <h1 className={styles.heading}>{displayName}Upcoming Events</h1>
          <p className={styles.meta}>
            Scan the months ahead for the astrological events that matter to a topic.
            Detection and timing are computed from the ephemeris; each result opens
            as a transit.
          </p>
        </div>
        <ChartModeToggle chartId={chart.id} active="events" />
      </div>

      <EventFinder chartId={chart.id} />
    </main>
  );
}
