import { z } from "zod";

export const ResolvedPlace = z.object({
  label:     z.string().min(1),
  latitude:  z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const BirthDataInput = z.object({
  name:      z.string().min(1).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/, "must be HH:mm"),
  place:     ResolvedPlace,
});

export type BirthDataInputType = z.infer<typeof BirthDataInput>;

function isValidCalendarDate(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

// Date is required; time and a place override are independently optional.
// Shared by the transits route and the sessions route so both validate the
// same way.
export const TransitTargetInput = z.object({
  targetDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .refine(isValidCalendarDate, "must be a valid calendar date"),
  localTime: z.string().regex(/^\d{2}:\d{2}$/, "must be HH:mm").optional(),
  place:     ResolvedPlace.optional(),
});

export type TransitTargetInputType = z.infer<typeof TransitTargetInput>;

// Promotes a transient transit view into a real Session — see
// startSessionFromFirstMessage in lib/sessions.ts.
export const SessionStartInput = z.object({
  transitChartId: z.string().min(1),
  message:        z.string().min(1),
});

export type SessionStartInputType = z.infer<typeof SessionStartInput>;

// ─── event finder ─────────────────────────────────────────────────────────────

export const EventsFindInput = z.object({
  window: z.enum(["3m", "6m", "12m"]),
  topic:  z.string().trim().min(2).max(200),
});

export type EventsFindInputType = z.infer<typeof EventsFindInput>;

// A ranked event as returned by findSignificantEvents, echoed back by the
// client to the interpretation route. Mirrors RankedEvent (lib/events/find.ts)
// — the interpretation may only ever see events that came out of the scan.
export const RankedEventInput = z.object({
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind:       z.enum([
    "transit-natal-aspect", "natal-house-ingress", "lunation",
    "sky-conjunction", "station", "sign-ingress",
  ]),
  bodies:     z.array(z.string()).min(1),
  natalPoint: z.string().optional(),
  house:      z.number().int().min(1).max(12).optional(),
  aspectType: z.string().optional(),
  motion:     z.enum(["direct", "retrograde"]).optional(),
  description: z.string().min(1),
  rawFactors: z.array(z.string()),
  strength:   z.number(),
  relevance:  z.number(),
  score:      z.number(),
});

export const EventsInterpretInput = z.object({
  topic:        z.string().trim().min(2).max(200),
  topicFactors: z.array(z.string()).max(24),
  events:       z.array(RankedEventInput).min(1).max(10),
});

export type EventsInterpretInputType = z.infer<typeof EventsInterpretInput>;

// Place is all-or-nothing in query params: label + lat + lng together, or
// omitted entirely. Shared by the transits and sessions GET routes, which
// both accept the same optional place override shape.
export function parsePlaceQueryParams(sp: URLSearchParams):
  | { label: string; latitude: number; longitude: number }
  | undefined
  | "invalid"
{
  const label = sp.get("placeLabel");
  const lat   = sp.get("placeLat");
  const lng   = sp.get("placeLng");

  if (!label && !lat && !lng) return undefined;
  if (!label || lat === null || lng === null) return "invalid";

  const latitude  = Number(lat);
  const longitude = Number(lng);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return "invalid";

  return { label, latitude, longitude };
}
