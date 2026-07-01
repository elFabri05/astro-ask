// Stub: fetches the stored BirthChart record and renders it as formatted JSON.
// This proves the POST → redirect → persistence round-trip works end-to-end.
// The real chart wheel + interpretation UI is built in a later slice.
import { notFound } from "next/navigation";
import { getBirthChart } from "@/lib/charts";

interface Props {
  params: { id: string };
}

export default async function ChartPage({ params }: Props) {
  const record = await getBirthChart(params.id);
  if (!record) notFound();

  const displayName = record.name ? `${record.name} — ` : "";

  return (
    <main style={{ maxWidth: 760, margin: "2.5rem auto", padding: "0 1rem 4rem" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        {displayName}Natal Chart <span style={{ fontWeight: 400, color: "#6b7280", fontSize: "0.9rem" }}>(stub)</span>
      </h1>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1.5rem" }}>
        timezone: <strong>{record.timezone}</strong> &nbsp;·&nbsp;
        utc: <strong>{record.utcDateTime}</strong>
      </p>
      <pre style={{
        background: "#1e1e2e",
        color: "#cdd6f4",
        padding: "1.5rem",
        borderRadius: 8,
        overflowX: "auto",
        fontSize: "0.8125rem",
        lineHeight: 1.65,
        whiteSpace: "pre",
      }}>
        {JSON.stringify(record, null, 2)}
      </pre>
    </main>
  );
}
