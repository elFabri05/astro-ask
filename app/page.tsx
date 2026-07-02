import { redirect } from "next/navigation";
import { listBirthCharts } from "@/lib/charts";

export default async function RootPage() {
  const charts = await listBirthCharts();

  if (charts.length === 0) redirect("/new");
  redirect(`/chart/${charts[0].id}`); // newest first
}
