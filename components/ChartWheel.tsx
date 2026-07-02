"use client";

import { useEffect, useId, useRef } from "react";
import type { ChartData } from "@/lib/ephemeris";
import { toAstroChartData, toAstroChartAspects } from "@/lib/chartAdapter";
import styles from "./ChartWheel.module.css";

interface Props {
  chart: ChartData;
}

const SIZE = 480;

export function ChartWheel({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // astrochart looks up its root by DOM id (document.getElementById), so the
  // id must be a valid, unique HTML id — sanitize React's useId() output.
  const elementId = `chart-wheel-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    // astrochart's bundle references `self` at module-eval time (browser
    // global), which throws during Next.js SSR. A dynamic import here only
    // ever runs client-side (effects never run during SSR), so the module
    // is never evaluated on the server.
    import("@astrodraw/astrochart").then(({ Chart }) => {
      if (cancelled || !containerRef.current) return;

      // astrochart appends a fresh <svg> into the root element on every
      // radix() call — clear whatever we drew last time first.
      container.innerHTML = "";

      const astroChart = new Chart(elementId, SIZE, SIZE);
      const radix = astroChart.radix(toAstroChartData(chart));
      // Pass OUR computed aspects (chart.aspects) so the library draws exactly
      // those lines instead of recomputing aspects with its own default orbs.
      radix.aspects(toAstroChartAspects(chart));

      // The library sets fixed pixel width/height; let it scale down on
      // narrower screens via the viewBox it already sets.
      const svg = container.querySelector("svg");
      if (svg) {
        svg.style.width = "100%";
        svg.style.height = "auto";
      }
    });

    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [chart, elementId]);

  return <div id={elementId} ref={containerRef} className={styles.wheel} />;
}
