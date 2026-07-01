import type { Metadata } from "next";
import BirthForm from "@/components/BirthForm";

export const metadata: Metadata = {
  title: "New Natal Chart — Astro Ask",
};

export default function NewChartPage() {
  return <BirthForm />;
}
