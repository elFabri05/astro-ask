import NodeGeocoder from "node-geocoder";
// geo-tz/dist/find-all uses the comprehensive dataset (one IANA ID per country),
// which is accurate pre-1970 and returns distinct identifiers like
// "Atlantic/Reykjavik" instead of merging UTC+0 zones into "Africa/Abidjan".
import { find } from "geo-tz/dist/find-all";
import { DateTime } from "luxon";

// ─── interfaces ───────────────────────────────────────────────────────────────

export interface ResolvedPlace {
  label: string;
  latitude: number;
  longitude: number;
}

export interface ResolvedUtcInstant {
  utcDateTime: string;       // ISO 8601 UTC, e.g. "1990-01-15T14:30:00Z"
  timezone: string;          // IANA zone name, e.g. "America/New_York"
  utcOffsetMinutes: number;  // offset AT that date/time, not today's offset
}

// ─── geocoder singleton ───────────────────────────────────────────────────────

const geocoder = NodeGeocoder({
  provider: "openstreetmap",
  language: "en",
  // email required by Nominatim usage policy; swap for a real contact address in prod
  email: "astro-ask-spike@example.com",
});

// ─── resolvePlace ─────────────────────────────────────────────────────────────

export async function resolvePlace(query: string): Promise<ResolvedPlace | null> {
  let results: NodeGeocoder.Entry[];
  try {
    results = await geocoder.geocode(query);
  } catch {
    // network failure, provider error — treat as no match for this spike
    return null;
  }

  if (!results || results.length === 0) return null;

  const first = results[0];
  const lat = first.latitude;
  const lng = first.longitude;

  if (lat == null || lng == null) return null;

  return {
    label: first.formattedAddress ?? query,
    latitude: lat,
    longitude: lng,
  };
}

// ─── resolveUtcInstant ────────────────────────────────────────────────────────

export function resolveUtcInstant(input: {
  localDate: string;  // "YYYY-MM-DD"
  localTime: string;  // "HH:mm"
  latitude: number;
  longitude: number;
}): ResolvedUtcInstant {
  const { localDate, localTime, latitude, longitude } = input;

  // geo-tz offline reverse lookup → IANA timezone name.
  // find-all returns distinct identifiers per country (e.g. "Atlantic/Reykjavik"
  // rather than the merged "Africa/Abidjan"), accurate for historical dates.
  const zones = find(latitude, longitude);
  if (!zones || zones.length === 0) {
    throw new Error(
      `No timezone found for lat=${latitude}, lng=${longitude}. ` +
        "This can happen over open ocean with no land timezone boundary."
    );
  }
  const timezone = zones[0];

  // Parse local date/time components
  const [year, month, day]   = localDate.split("-").map(Number);
  const [hour, minute]       = localTime.split(":").map(Number);

  // luxon resolves the correct UTC offset for this specific historical instant,
  // including pre-1970 DST rules via the host's Intl/ICU timezone database.
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0 },
    { zone: timezone }
  );

  if (!dt.isValid) {
    throw new Error(
      `Cannot parse "${localDate} ${localTime}" in zone "${timezone}": ${dt.invalidExplanation}`
    );
  }

  return {
    utcDateTime: dt.toUTC().toISO({ suppressMilliseconds: true })!,
    timezone,
    utcOffsetMinutes: dt.offset,
  };
}
