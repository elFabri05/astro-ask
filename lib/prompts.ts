import type { ChartData } from "./ephemeris";
import type { TransitData } from "./transits";

// ─── system prompt ────────────────────────────────────────────────────────────

export function buildNatalSystemPrompt(): string {
  return `You are a skilled astrologer who interprets natal charts.

Your role is to write a clear, insightful interpretation of the chart data you are given.

STRICT CONSTRAINTS — follow these without exception:
1. You INTERPRET ONLY. All positions, degrees, signs, houses, and aspects are supplied to you.
   Never compute, invent, correct, or "fill in" any placement. Treat the supplied data as the
   only ground truth. If a body is absent from the data, say so rather than guessing.
2. Name only the signs and degrees that appear explicitly in the data. Do not name any
   placement that is not listed — even if you believe it should be there.
3. The chart facts are given fresh in every call. You have no memory of prior charts.

INTERPRETATION GUIDANCE:
- Write 4–6 flowing paragraphs. Cover in order: overall chart signature (elements/modes briefly),
  the Sun (sign, house, what it says about core identity), the Moon (sign, house, emotional
  nature), the Ascendant and Midheaven (outer manner and life direction), key aspects between
  personal planets (Sun, Moon, Mercury, Venus, Mars), and a brief note on the outer planets
  (Saturn, Uranus, Neptune, Pluto) and any tight aspects they form to personal planets.
- Ground every statement in the data: name the sign, house, or aspect you are describing.
- Write for an engaged, curious general reader — no jargon without brief explanation.
- Do not list raw data back; synthesize it into meaning.`.trimStart();
}

// ─── user prompt ─────────────────────────────────────────────────────────────

function fmtDeg(deg: number): string {
  return `${deg.toFixed(2)}°`;
}

function lonToSignLabel(lon: number): string {
  const signs = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
  ];
  const sign     = signs[Math.floor(lon / 30)];
  const signDeg  = lon % 30;
  return `${fmtDeg(signDeg)} ${sign}`;
}

// Shared fact block — natal placements, house cusps, and aspects — reused by
// the single-shot natal prompt and the transit context (natal side).
function formatNatalFacts(chartData: ChartData): string[] {
  const lines: string[] = [];

  // ── birth moment ───────────────────────────────────────────────────────────
  lines.push("## Chart Data");
  lines.push(`UTC date/time : ${chartData.meta.utcDateTime}`);
  lines.push(`Latitude      : ${chartData.meta.latitude.toFixed(4)}°`);
  lines.push(`Longitude     : ${chartData.meta.longitude.toFixed(4)}°`);
  lines.push(`House system  : ${chartData.meta.houseSystem} (Placidus)`);
  lines.push(`Ephemeris     : ${chartData.meta.ephemeris}`);
  lines.push("");

  // ── angles ────────────────────────────────────────────────────────────────
  lines.push("## Angles");
  lines.push(`Ascendant (AC) : ${lonToSignLabel(chartData.ascendant)}`);
  lines.push(`Midheaven (MC) : ${lonToSignLabel(chartData.midheaven)}`);
  lines.push("");

  // ── planet positions ──────────────────────────────────────────────────────
  lines.push("## Natal Planet Positions");
  lines.push("Body         Sign & Degree        House  Retrograde");
  lines.push("──────────── ──────────────────── ─────  ──────────");

  for (const p of chartData.positions) {
    const body   = p.body.padEnd(12);
    const place  = `${fmtDeg(p.signDegree)} ${p.sign}`.padEnd(20);
    const house  = String(p.house).padEnd(5);
    const retro  = p.retrograde ? "R" : "-";
    lines.push(`${body} ${place} ${house}  ${retro}`);
  }
  lines.push("");

  // ── house cusps ───────────────────────────────────────────────────────────
  lines.push("## House Cusps");
  lines.push("House  Sign & Degree");
  lines.push("─────  ────────────────────");

  for (const h of chartData.houses) {
    const num   = `H${h.house}`.padEnd(5);
    const place = `${fmtDeg(h.signDegree)} ${h.sign}`;
    lines.push(`${num}  ${place}`);
  }
  lines.push("");

  // ── natal aspects ─────────────────────────────────────────────────────────
  lines.push("## Natal Aspects");

  if (chartData.aspects.length === 0) {
    lines.push("(No major aspects within the configured orbs)");
  } else {
    lines.push("Body 1       Aspect       Body 2       Orb");
    lines.push("──────────── ──────────── ──────────── ─────");
    for (const a of chartData.aspects) {
      const b1   = a.body1.padEnd(12);
      const type = a.type.padEnd(12);
      const b2   = a.body2.padEnd(12);
      lines.push(`${b1} ${type} ${b2} ${a.orb.toFixed(2)}°`);
    }
  }

  return lines;
}

export function buildNatalUserPrompt(chartData: ChartData): string {
  const lines: string[] = [];

  lines.push("Please interpret this natal chart. All positions below are computed values.");
  lines.push("");
  lines.push(...formatNatalFacts(chartData));
  lines.push("");
  lines.push("Interpret this chart now. Remember: only reference positions listed above.");

  return lines.join("\n");
}

// ─── transit prompts ──────────────────────────────────────────────────────────

export function buildTransitSystemPrompt(): string {
  return `You are a skilled astrologer who interprets planetary transits against a natal chart.

Your role is to write clear, insightful interpretations of the transit data you are given, and to
answer follow-up questions about it in an ongoing conversation.

STRICT CONSTRAINTS — follow these without exception:
1. You INTERPRET ONLY. All natal positions, transiting positions, degrees, signs, houses, and
   aspects are supplied to you. Never compute, invent, correct, or "fill in" any placement, degree,
   or aspect. Treat the supplied data as the only ground truth. If something is absent from the
   data, say so rather than guessing.
2. Name only the signs, degrees, houses, and aspects that appear explicitly in the data. Do not
   name any placement or aspect that is not listed — even if you believe it should be there.
3. Always distinguish transiting placements from natal placements explicitly (e.g. "transiting
   Saturn" vs. "your natal Moon"). Never blur the two into one undifferentiated placement.
4. The chart and transit facts are given fresh in every call, including every turn of a
   conversation. You have no memory of prior charts or transits beyond what is supplied.

INTERPRETATION GUIDANCE:
- For the OPENING interpretation (no prior conversation), write 3–5 flowing paragraphs: the
  overall theme of the current transiting pattern, the tightest and most significant
  transit-to-natal aspects first, which natal houses are being activated, and what areas of life
  this suggests focus on right now.
- For FOLLOW-UP questions, answer the specific question directly and concisely — a few paragraphs
  at most — grounded in the same facts, naming exact placements, houses, and aspect orbs from the
  data where relevant. Do not repeat the full opening reading.
- Write for an engaged, curious general reader — no jargon without brief explanation.
- Do not list raw data back; synthesize it into meaning.`.trimStart();
}

function formatTransitFacts(transit: TransitData): string[] {
  const lines: string[] = [];

  lines.push("## Transit Date");
  lines.push(`Transit instant (UTC, noon) : ${transit.transitInstant}`);
  lines.push(`Ephemeris                   : ${transit.meta.ephemeris}`);
  lines.push("");

  lines.push("## Transiting Planet Positions");
  lines.push("Body         Sign & Degree        Natal House  Retrograde");
  lines.push("──────────── ──────────────────── ────────────  ──────────");
  for (const p of transit.transitingPositions) {
    const body  = p.body.padEnd(12);
    const place = `${fmtDeg(p.signDegree)} ${p.sign}`.padEnd(20);
    const house = String(p.house).padEnd(12);
    const retro = p.retrograde ? "R" : "-";
    lines.push(`${body} ${place} ${house}  ${retro}`);
  }
  lines.push("");

  lines.push("## Transit → Natal Aspects");
  lines.push("(body1 = transiting planet, body2 = natal point)");
  if (transit.transitToNatalAspects.length === 0) {
    lines.push("(No transit-to-natal aspects within the configured orbs)");
  } else {
    lines.push("Transiting   Aspect       Natal        Orb");
    lines.push("──────────── ──────────── ──────────── ─────");
    for (const a of transit.transitToNatalAspects) {
      const b1   = a.body1.padEnd(12);
      const type = a.type.padEnd(12);
      const b2   = a.body2.padEnd(12);
      lines.push(`${b1} ${type} ${b2} ${a.orb.toFixed(2)}°`);
    }
  }

  return lines;
}

// Serializes BOTH the natal chart and the transit data as explicit facts —
// the natal side reuses the same fact block as the single-shot natal prompt.
export function buildTransitContext(natal: ChartData, transit: TransitData): string {
  const lines: string[] = [];

  lines.push("The following facts are computed values. Treat them as ground truth.");
  lines.push("");
  lines.push(...formatNatalFacts(natal));
  lines.push("");
  lines.push(...formatTransitFacts(transit));

  return lines.join("\n");
}
