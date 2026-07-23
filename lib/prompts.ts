import type { ChartData } from "./ephemeris";
import type { TransitData } from "./transits";
import type { RankedEvent } from "./events/find";

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
   aspects — including the aspects transiting planets form with EACH OTHER — are supplied to you.
   Never compute, invent, correct, or "fill in" any placement, degree, or aspect beyond what's
   listed. Treat the supplied data as the only ground truth.
2. Name only the signs, degrees, houses, and aspects that appear explicitly in the data. Do not
   name any placement or aspect that is not listed — even if you believe it should be there.
3. Always distinguish transiting placements from natal placements explicitly (e.g. "transiting
   Saturn" vs. "your natal Moon"), and distinguish transit-to-transit aspects (the sky's own
   configuration) from transit-to-natal aspects (its contact with this person's chart).
4. The chart and transit facts are given fresh in every call, including every turn of a
   conversation. You have no memory of prior charts or transits beyond what is supplied.

INTERPRETATION GUIDANCE — read and interpret the data in two stages, in this order:
- STAGE 1, the sky itself (section A): characterize the overall celestial configuration right now
  — e.g. a tight square between two transiting planets, a cluster of retrogrades — using the
  transit-to-transit aspects. This is the shared "weather," true for everyone at this instant,
  independent of any one chart. Name the specific aspects that make up this theme.
- STAGE 2, how it lands on this person (section B): ground that sky in the individual using the
  transit-to-natal aspects and the natal houses being activated. This is what actually matters for
  relevance — the sky-stage sets the theme, but the natal-stage is what makes it personal, and
  should carry most of the interpretive weight. If a strong sky configuration doesn't closely
  aspect the natal chart, say so plainly: lead with the theme, but be clear it's ambient background
  rather than a strong personal signal, and don't dwell at length on sky patterns that don't
  contact the chart.
- For the OPENING interpretation (no prior conversation), write 3–5 flowing paragraphs moving
  through both stages in order.
- For FOLLOW-UP questions, answer the specific question directly and concisely — a few paragraphs
  at most — grounded in the same facts, naming exact placements, houses, and aspect orbs from the
  data where relevant. Do not repeat the full opening reading.
- Write for an engaged, curious general reader — no jargon without brief explanation.
- Do not list raw data back; synthesize it into meaning.`.trimStart();
}

// Opener-only addition to the system prompt. Appended by the transit opener
// generation call (lib/interpret.ts) and NOWHERE else — the session chat route
// reuses buildTransitSystemPrompt() + buildTransitContext() without this, so
// follow-up replies never end with the flourish.
export function buildTransitOpenerInstruction(): string {
  return `

CLOSING LINE — for this opening interpretation only:
- End the reading with a final paragraph of ONE or TWO short sentences, no more.
- Its tone is slightly poetic and evocative: a single image that gathers the theme of the reading
  above it. It is not a summary, not advice, and not a sign-off.
- Don't make reference to planet positions, houses, or aspects.
- It must introduce NO new astrological information: no planet, sign, degree, house, aspect, or
  date that was not already named in the interpretation above. It reflects what was said; it never
  adds.
- Plain prose only: no quotation marks, no emoji, no heading or label before it.
- No fortune-telling and no promises about outcomes.`;
}

// Section A — the sky's own configuration: transiting positions and the
// aspects transiting planets form with EACH OTHER. True for everyone at this
// instant, independent of any one chart. Interpreted first (see
// buildTransitSystemPrompt) so the reading opens with the shared "weather"
// before grounding it in the individual.
function formatSkyFacts(transit: TransitData): string[] {
  const lines: string[] = [];

  lines.push("## A. The Sky Right Now (transit-to-transit)");
  lines.push(`Transit instant (UTC) : ${transit.transitInstant}`);
  lines.push(`Ephemeris             : ${transit.meta.ephemeris}`);
  lines.push("");

  lines.push("### Transiting Planet Positions");
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

  lines.push("### Transit → Transit Aspects (among the transiting planets themselves)");
  if (transit.transitToTransitAspects.length === 0) {
    lines.push("(No transit-to-transit aspects within the configured orbs)");
  } else {
    lines.push("Transiting   Aspect       Transiting   Orb");
    lines.push("──────────── ──────────── ──────────── ─────");
    for (const a of transit.transitToTransitAspects) {
      const b1   = a.body1.padEnd(12);
      const type = a.type.padEnd(12);
      const b2   = a.body2.padEnd(12);
      lines.push(`${b1} ${type} ${b2} ${a.orb.toFixed(2)}°`);
    }
  }

  return lines;
}

// Section B — how the sky lands on this individual: the natal chart (reusing
// the same fact block as the single-shot natal prompt) plus the aspects
// transiting planets form with natal points.
function formatPersonalFacts(natal: ChartData, transit: TransitData): string[] {
  const lines: string[] = [];

  lines.push("## B. How It Lands On This Person (transit-to-natal)");
  lines.push("");
  lines.push(...formatNatalFacts(natal));
  lines.push("");

  lines.push("### Transit → Natal Aspects");
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

// Presents facts in interpretation order: the sky's own configuration first
// (section A), then how it contacts this individual's natal chart
// (section B) — see buildTransitSystemPrompt for the matching two-stage
// interpretation guidance.
export function buildTransitContext(natal: ChartData, transit: TransitData): string {
  const lines: string[] = [];

  lines.push("The following facts are computed values. Treat them as ground truth.");
  lines.push("Read in order: section A is the sky's own configuration, true for everyone right");
  lines.push("now; section B is how that configuration contacts this individual's natal chart.");
  lines.push("");
  lines.push(...formatSkyFacts(transit));
  lines.push("");
  lines.push(...formatPersonalFacts(natal, transit));

  return lines.join("\n");
}

// ─── event-finder interpretation ──────────────────────────────────────────────
//
// The events below were detected and dated deterministically (lib/events) —
// the model's only job here is to explain them. Same interpret-only grounding
// as the natal and transit prompts, plus a hard rule against touching dates.

export function buildEventsSystemPrompt(): string {
  return `You are a skilled astrologer. A deterministic scan of the upcoming sky has already found
and dated the significant astrological events for this person's question. Your role is to explain
each event: what it is, and why it matters for their topic — nothing more.

STRICT CONSTRAINTS — follow these without exception:
1. You INTERPRET ONLY. Every event, its date, its bodies, and its aspects were computed for you.
   Never add an event, drop an event, change a date, or mention any aspect or moon phase that is
   not in the list. The list is the only ground truth about the upcoming sky.
2. State each event's date exactly as given. If asked about a date or event not in the list, say
   the scan did not surface it rather than speculating.
2b. Eclipse status is COMPUTED, never yours to judge: an event is an eclipse if and only if it is
   explicitly marked as one in the list (with its type and nodal distance). Interpret a marked
   eclipse as an eclipse. Never infer, suggest, or deny eclipse status for any other lunation —
   not even one close to a node.
3. Ground the "why it matters" in the supplied natal chart facts and the event's own factors —
   name the natal placements and houses involved, never invented ones.
4. The facts are given fresh in every call. You have no memory of prior charts or scans.

WRITE THE READING AS FOLLOWS:
- Open with one short paragraph tying the season ahead to their topic.
- Then cover EVERY listed event, in the order given (they are ranked most significant first).
  For each: a bold heading line with the date and the event, then one compact paragraph — what
  the event is (briefly, for a general reader) and why it speaks to their topic through their
  chart. Mention the timing plainly ("around June 12") using the given date.
- Close with one or two sentences on the overall arc. No advice disclaimers, no raw data dumps.`.trimStart();
}

export function buildEventsInterpretationPrompt(
  natal: ChartData,
  topic: string,
  topicFactors: string[],
  events: RankedEvent[]
): string {
  const lines: string[] = [];

  lines.push("The following facts are computed values. Treat them as the only ground truth.");
  lines.push("");
  lines.push(`## The Person's Topic`);
  lines.push(topic);
  lines.push("");
  lines.push(`## Chart Factors Mapped To The Topic`);
  lines.push(topicFactors.length > 0 ? topicFactors.join(", ") : "(none mapped)");
  lines.push("");

  lines.push("## Upcoming Events (deterministically detected and dated — ranked, strongest first)");
  lines.push("(Eclipse status below is computed from node proximity. An event is an eclipse only");
  lines.push("if marked ECLIPSE; treat every other lunation as an ordinary new/full moon.)");
  events.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.date} — ${e.label}`);
    lines.push(`   kind: ${e.kind}; factors: ${e.factors.join(", ")}`);
    if (e.isEclipse && e.eclipseType && e.nodalDistance !== undefined) {
      lines.push(
        `   ECLIPSE (computed): ${e.eclipseType} — Sun ${e.nodalDistance.toFixed(1)}° from the ` +
        `${e.nodeUsed} Node at the exact lunation`
      );
    }
  });
  lines.push("");

  lines.push(...formatNatalFacts(natal));
  lines.push("");
  lines.push("Write the reading now: explain each listed event, in order, with its exact date.");

  return lines.join("\n");
}

// ─── session title ────────────────────────────────────────────────────────────

export function buildTitleSystemPrompt(): string {
  return `You write short, specific titles for astrology chat sessions.

Given a set of transit aspects and the person's first question about them, write one short title
(4-8 words) that names a real aspect or pattern from the data and ties it to the theme of their
question.

STRICT CONSTRAINTS — follow these without exception:
1. Name only an aspect or pattern that literally appears in the data given. Never invent one.
2. Prefer the most exact or tightest-orb aspect, or a named pattern (e.g. a full moon: Sun
   opposition Moon) if one stands out.
3. Keep it to 4-8 words, in title case or sentence case. No trailing punctuation, no quotation
   marks, no "Title:" prefix or other label.
4. Output only the title itself, nothing else.

Example shapes (not the content to copy): "Full moon on natal Venus — career", "Saturn square Sun
— relationship doubts".`.trimStart();
}

// Compact on purpose — this backs a single cheap LLM call per new session, so
// it lists aspects only rather than the full natal+transit fact block used
// for the opener and follow-up turns.
export function buildTitleUserPrompt(transit: TransitData, firstUserMessage: string): string {
  const lines: string[] = [];

  lines.push("## Transit-to-transit aspects (the sky's own configuration)");
  if (transit.transitToTransitAspects.length === 0) {
    lines.push("(none within orb)");
  } else {
    for (const a of transit.transitToTransitAspects) {
      lines.push(`- transiting ${a.body1} ${a.type} transiting ${a.body2} (orb ${a.orb.toFixed(2)}°)`);
    }
  }
  lines.push("");

  lines.push("## Transit-to-natal aspects (contact with this person's chart)");
  if (transit.transitToNatalAspects.length === 0) {
    lines.push("(none within orb)");
  } else {
    for (const a of transit.transitToNatalAspects) {
      lines.push(`- transiting ${a.body1} ${a.type} natal ${a.body2} (orb ${a.orb.toFixed(2)}°)`);
    }
  }
  lines.push("");

  lines.push("## Their first question");
  lines.push(firstUserMessage);
  lines.push("");
  lines.push("Write the title now.");

  return lines.join("\n");
}
