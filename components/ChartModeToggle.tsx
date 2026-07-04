import Link from "next/link";
import styles from "./ChartModeToggle.module.css";

interface Props {
  chartId: string;
  active: "natal" | "transits" | "events";
}

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function ChartModeToggle({ chartId, active }: Props) {
  return (
    <div className={styles.toggle} role="tablist" aria-label="Chart mode">
      <Link
        href={`/chart/${chartId}`}
        role="tab"
        aria-selected={active === "natal"}
        className={cx(styles.item, active === "natal" && styles.itemActive)}
      >
        Natal
      </Link>
      <Link
        href={`/chart/${chartId}/transits`}
        role="tab"
        aria-selected={active === "transits"}
        className={cx(styles.item, active === "transits" && styles.itemActive)}
      >
        Transits
      </Link>
      <Link
        href={`/chart/${chartId}/events`}
        role="tab"
        aria-selected={active === "events"}
        className={cx(styles.item, active === "events" && styles.itemActive)}
      >
        Events
      </Link>
    </div>
  );
}
