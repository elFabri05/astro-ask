import type { ChartData } from "@/lib/ephemeris";
import styles from "./PositionsTable.module.css";

interface Props {
  chart: ChartData;
}

const SIGN_ABBR: Record<string, string> = {
  Aries: "Ari", Taurus: "Tau", Gemini: "Gem", Cancer: "Can",
  Leo: "Leo", Virgo: "Vir", Libra: "Lib", Scorpio: "Sco",
  Sagittarius: "Sag", Capricorn: "Cap", Aquarius: "Aqu", Pisces: "Pis",
};

function fmtPosition(signDegree: number, sign: string): string {
  return `${Math.floor(signDegree)}° ${SIGN_ABBR[sign] ?? sign}`;
}

function lonToSignInfo(lon: number): { sign: string; signDegree: number } {
  const SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
  ];
  return { sign: SIGNS[Math.floor(lon / 30)], signDegree: lon % 30 };
}

export function PositionsTable({ chart }: Props) {
  const asc = lonToSignInfo(chart.ascendant);
  const mc  = lonToSignInfo(chart.midheaven);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Body</th>
          <th>Position</th>
          <th>House</th>
          <th>℞</th>
        </tr>
      </thead>
      <tbody>
        {chart.positions.map(p => (
          <tr key={p.body}>
            <td className={styles.body}>{p.body}</td>
            <td>{fmtPosition(p.signDegree, p.sign)}</td>
            <td>{p.house}</td>
            <td className={styles.retro}>{p.retrograde ? "℞" : ""}</td>
          </tr>
        ))}
        <tr className={styles.angleRow}>
          <td className={styles.body}>Ascendant</td>
          <td>{fmtPosition(asc.signDegree, asc.sign)}</td>
          <td>—</td>
          <td></td>
        </tr>
        <tr className={styles.angleRow}>
          <td className={styles.body}>Midheaven</td>
          <td>{fmtPosition(mc.signDegree, mc.sign)}</td>
          <td>—</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  );
}
