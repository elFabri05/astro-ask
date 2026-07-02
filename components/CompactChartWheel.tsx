// Pure SVG rendering — no state, no "use client" needed. Reused at large size
// in the expanded header and small size in the collapsed strip.

const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

const PLANET_GLYPHS: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
  "True Node": "☊", Chiron: "⚷",
};

export interface CompactChartWheelPosition {
  body: string;
  longitude: number;
}

export interface CompactChartWheelHouse {
  house: number;
  longitude: number;
}

interface Props {
  positions: CompactChartWheelPosition[];
  houses: CompactChartWheelHouse[];
  ascendant: number;
  size?: number;
  compact?: boolean;
}

// Ascendant sits at 9 o'clock; the zodiac advances counter-clockwise from it —
// the traditional chart-wheel orientation.
function pointOn(lon: number, ascendant: number, radius: number, cx: number, cy: number) {
  const delta = (((lon - ascendant) % 360) + 360) % 360;
  const theta = ((180 + delta) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(theta), y: cy - radius * Math.sin(theta) };
}

export function CompactChartWheel({ positions, houses, ascendant, size = 200, compact = false }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - (compact ? 2 : 20);
  const rTick  = rOuter - (compact ? 3 : 10);
  const rPlanet = rOuter * 0.72;
  const rHouseNum = rOuter * 0.9;

  const sortedHouses = [...houses].sort((a, b) => a.house - b.house);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Chart wheel"
    >
      <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="var(--border)" strokeWidth={compact ? 1 : 1.5} />
      {!compact && (
        <circle cx={cx} cy={cy} r={rPlanet * 1.18} fill="none" stroke="var(--border)" strokeWidth={1} opacity={0.6} />
      )}

      {/* zodiac sign ticks, every 30° from the Ascendant's frame */}
      {!compact && Array.from({ length: 12 }).map((_, i) => {
        const lon = i * 30;
        const tickOuter = pointOn(lon, 0, rOuter, cx, cy);
        const tickInner = pointOn(lon, 0, rTick, cx, cy);
        const glyphPos  = pointOn(lon + 15, 0, rOuter + 11, cx, cy);
        return (
          <g key={`sign-${i}`}>
            <line
              x1={tickOuter.x} y1={tickOuter.y} x2={tickInner.x} y2={tickInner.y}
              stroke="var(--border)" strokeWidth={1}
            />
            <text
              x={glyphPos.x} y={glyphPos.y}
              textAnchor="middle" dominantBaseline="central"
              fontSize={10} fill="var(--text-muted)"
            >
              {SIGN_GLYPHS[i]}
            </text>
          </g>
        );
      })}

      {/* house cusps, radiating from center */}
      {sortedHouses.map(h => {
        const outer = pointOn(h.longitude, ascendant, rOuter, cx, cy);
        const isAngle = h.house === 1 || h.house === 10;
        return (
          <line
            key={`cusp-${h.house}`}
            x1={cx} y1={cy} x2={outer.x} y2={outer.y}
            stroke={isAngle ? "var(--accent)" : "var(--border)"}
            strokeWidth={isAngle ? 1.5 : 0.75}
            opacity={isAngle ? 0.9 : 0.5}
          />
        );
      })}

      {!compact && sortedHouses.map(h => {
        const nextLon = sortedHouses[h.house % 12].longitude;
        const mid = pointOn(h.longitude + (((nextLon - h.longitude) % 360 + 360) % 360) / 2, ascendant, rHouseNum, cx, cy);
        return (
          <text
            key={`hn-${h.house}`}
            x={mid.x} y={mid.y}
            textAnchor="middle" dominantBaseline="central"
            fontSize={8} fill="var(--text-muted)" opacity={0.7}
          >
            {h.house}
          </text>
        );
      })}

      {/* planets */}
      {positions.map(p => {
        const pos = pointOn(p.longitude, ascendant, rPlanet, cx, cy);
        return (
          <text
            key={p.body}
            x={pos.x} y={pos.y}
            textAnchor="middle" dominantBaseline="central"
            fontSize={compact ? 9 : 13}
            fill="var(--text)"
          >
            {PLANET_GLYPHS[p.body] ?? p.body[0]}
          </text>
        );
      })}
    </svg>
  );
}
