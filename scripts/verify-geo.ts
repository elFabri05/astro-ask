import { resolvePlace, resolveUtcInstant } from "../lib/geo";

function sep(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function printPlace(label: string, result: Awaited<ReturnType<typeof resolvePlace>>) {
  if (!result) {
    console.log(`  → no match`);
  } else {
    console.log(`  label    : ${result.label}`);
    console.log(`  lat/lng  : ${result.latitude}, ${result.longitude}`);
  }
}

function printInstant(result: ReturnType<typeof resolveUtcInstant>) {
  console.log(`  utcDateTime      : ${result.utcDateTime}`);
  console.log(`  timezone         : ${result.timezone}`);
  console.log(`  utcOffsetMinutes : ${result.utcOffsetMinutes}`);
}

async function main() {
  // ── case 1: unambiguous place ────────────────────────────────────────────
  sep("Case 1 — resolvePlace('Lyon, France')  [expect ~45.75, ~4.85]");
  printPlace("Lyon", await resolvePlace("Lyon, France"));

  // ── case 2: deliberately ambiguous ──────────────────────────────────────
  sep("Case 2 — resolvePlace('Springfield')  [ambiguous; print whatever]");
  printPlace("Springfield", await resolvePlace("Springfield"));

  // ── case 3: nonsense string → null ──────────────────────────────────────
  sep("Case 3 — resolvePlace('asdkfjhqwreoiuqwer')  [expect no match]");
  printPlace("garbage", await resolvePlace("asdkfjhqwreoiuqwer"));

  // ── case 4: NYC winter (EST = UTC-5, offset -300) ───────────────────────
  sep("Case 4 — NYC 2000-01-01 12:00 local  [expect offset -300]");
  printInstant(resolveUtcInstant({
    localDate: "2000-01-01",
    localTime: "12:00",
    latitude:  40.7128,
    longitude: -74.0060,
  }));

  // ── case 5: NYC summer (EDT = UTC-4, offset -240) ───────────────────────
  sep("Case 5 — NYC 2000-07-01 12:00 local  [expect offset -240, historical DST check]");
  printInstant(resolveUtcInstant({
    localDate: "2000-07-01",
    localTime: "12:00",
    latitude:  40.7128,
    longitude: -74.0060,
  }));

  // ── case 6: pre-1970 historical date ────────────────────────────────────
  sep("Case 6 — NYC 1955-03-10 09:00 local  [pre-1966 US DST; eyeball vs reference]");
  printInstant(resolveUtcInstant({
    localDate: "1955-03-10",
    localTime: "09:00",
    latitude:  40.7128,
    longitude: -74.0060,
  }));

  // ── case 7: chained resolvePlace → resolveUtcInstant ────────────────────
  sep("Case 7 — resolvePlace('Reykjavik, Iceland') → resolveUtcInstant  [expect offset 0]");
  const rvk = await resolvePlace("Reykjavik, Iceland");
  if (!rvk) {
    console.log("  resolvePlace → no match (cannot chain)");
  } else {
    console.log(`  resolved place: ${rvk.label}`);
    console.log(`  lat/lng: ${rvk.latitude}, ${rvk.longitude}`);
    printInstant(resolveUtcInstant({
      localDate:  "2000-06-21",
      localTime:  "12:00",
      latitude:   rvk.latitude,
      longitude:  rvk.longitude,
    }));
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log("  Done. Cases 4 vs 5 should show different offsets (-300 vs -240).");
  console.log("  Case 7 should show offset 0 (Iceland has no DST year-round).");
  console.log("─".repeat(60));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
