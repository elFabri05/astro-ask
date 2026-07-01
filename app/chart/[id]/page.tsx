import { notFound } from "next/navigation";
import { getBirthChart } from "@/lib/charts";
import { getNatalInterpretation } from "@/lib/interpret";
import { InterpretationSection } from "@/components/InterpretationSection";

interface Props {
  params: { id: string };
}

export default async function ChartPage({ params }: Props) {
  const [record, interpretation] = await Promise.all([
    getBirthChart(params.id),
    getNatalInterpretation(params.id),
  ]);

  if (!record) notFound();

  const displayName = record.name ? `${record.name} — ` : "";

  return (
    <main style={{ maxWidth: 760, margin: "2.5rem auto", padding: "0 1rem 5rem" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        {displayName}Natal Chart
      </h1>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1.5rem" }}>
        {record.birthDate} {record.birthTime} local &nbsp;·&nbsp;{" "}
        {record.placeLabel} &nbsp;·&nbsp; timezone:{" "}
        <strong>{record.timezone}</strong>
      </p>

      {/* raw data — helpful during development, easy to remove later */}
      <details style={{ marginBottom: "1rem" }}>
        <summary style={{
          cursor: "pointer", fontSize: "0.875rem", color: "#6b7280",
          userSelect: "none", marginBottom: "0.5rem",
        }}>
          Chart data (JSON)
        </summary>
        <pre style={{
          background: "#1e1e2e", color: "#cdd6f4",
          padding: "1.25rem", borderRadius: 8, overflowX: "auto",
          fontSize: "0.8125rem", lineHeight: 1.65, whiteSpace: "pre",
        }}>
          {JSON.stringify(record.chartData, null, 2)}
        </pre>
      </details>

      {/* interpretation section — client component, handles Generate/Regenerate */}
      <InterpretationSection
        chartId={record.id}
        initial={interpretation}
      />
    </main>
  );
}
