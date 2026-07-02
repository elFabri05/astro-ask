import { notFound } from "next/navigation";
import { getBirthChart } from "@/lib/charts";
import { ChartWheel } from "@/components/ChartWheel";
import { PositionsTable } from "@/components/PositionsTable";
import { NatalReading } from "@/components/NatalReading";
import { ChartModeToggle } from "@/components/ChartModeToggle";
import styles from "./page.module.css";

interface Props {
  params: { id: string };
}

export default async function ChartPage({ params }: Props) {
  const chart = await getBirthChart(params.id);
  if (!chart) notFound();

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
      <NatalReading chartId={chart.id} />
    </main>
  );
}
