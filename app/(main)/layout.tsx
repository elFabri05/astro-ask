import { listBirthCharts } from "@/lib/charts";
import { Sidebar } from "@/components/Sidebar";
import styles from "./layout.module.css";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const charts = await listBirthCharts();

  return (
    <div className={styles.shell}>
      <Sidebar charts={charts} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
