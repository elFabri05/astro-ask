/*
 * VERIFICATION STEPS — open /new in the browser after `npm run dev`:
 *
 * 1. Type "Lyon" in the place field → after ~300 ms the candidate list appears.
 *    Click the result → the field fills with the resolved label.
 *
 * 2. After selecting a candidate, edit the text (add/delete a character).
 *    The field becomes invalid again (value = null) and a new search fires.
 *    This proves selection, not typed text, is what makes a place valid.
 *
 * 3. Leave the place as raw unresolved text (or empty) and click Submit.
 *    Inline error appears on the place field; no network POST is made.
 *    The button stays enabled throughout.
 *
 * 4. Name: "London Reference" / Date: 1990-01-15 / Time: 14:30 /
 *    Place: type "London, UK", select the result → Submit.
 *    Redirect to /chart/:id; the JSON stub shows:
 *      timezone    "Europe/London"
 *      utcDateTime "1990-01-15T14:30:00Z"
 *      Sun         ~25° Capricorn
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BirthDataInput } from "@/lib/validation";
import { PlaceAutocomplete, type ResolvedPlace } from "./PlaceAutocomplete";
import styles from "./BirthForm.module.css";

interface Errors {
  name?: string;
  birthDate?: string;
  birthTime?: string;
  place?: string;
  _form?: string;
}

export default function BirthForm() {
  const router = useRouter();

  const [name,      setName]      = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [place,     setPlace]     = useState<ResolvedPlace | null>(null);
  const [errors,    setErrors]    = useState<Errors>({});
  const [busy,      setBusy]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: Errors = {};

    // ── required field checks (human-readable before Zod sees them) ──────────
    if (!birthDate) newErrors.birthDate = "Birth date is required";
    if (!birthTime) newErrors.birthTime = "Birth time is required";
    if (!place)     newErrors.place     = "Select a place from the suggestions list";

    // ── Zod: format + range checks (catches edge cases the date/time inputs
    //    can't prevent, e.g. manual editing, prefilled state) ─────────────────
    const zr = BirthDataInput.safeParse({
      name:      name.trim() || undefined,
      birthDate: birthDate || "invalid",          // force fail if empty
      birthTime: birthTime || "invalid",
      place:     place ?? { label: "dummy", latitude: 0, longitude: 0 },
    });
    if (!zr.success) {
      const fe = zr.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      if (fe.name?.[0]      && !newErrors.name)      newErrors.name      = fe.name[0];
      if (fe.birthDate?.[0] && !newErrors.birthDate) newErrors.birthDate = fe.birthDate[0];
      if (fe.birthTime?.[0] && !newErrors.birthTime) newErrors.birthTime = fe.birthTime[0];
      // place error already set with a friendly message; skip Zod's generic one
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch("/api/charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:      name.trim() || undefined,
          birthDate,
          birthTime,
          place:     place!, // non-null guaranteed by the check above
        }),
      });

      const data = await res.json();

      if (res.status === 201) {
        router.push(`/chart/${data.id}`);
        return;
      }

      if (res.status === 400) {
        const issues = (data.issues ?? {}) as Record<string, string[] | undefined>;
        const serverErrors: Errors = {};
        if (issues.name?.[0])      serverErrors.name      = issues.name[0];
        if (issues.birthDate?.[0]) serverErrors.birthDate = issues.birthDate[0];
        if (issues.birthTime?.[0]) serverErrors.birthTime = issues.birthTime[0];
        if (issues.place?.[0])     serverErrors.place     = issues.place[0];
        if (!Object.keys(serverErrors).length) {
          serverErrors._form = data.error ?? "Submission failed. Please try again.";
        }
        setErrors(serverErrors);
      } else {
        setErrors({ _form: "Something went wrong. Please try again." });
      }
    } catch {
      setErrors({ _form: "Network error. Please check your connection." });
    } finally {
      setBusy(false);
    }
  }

  function ic(...cls: (string | false | undefined)[]) {
    return cls.filter(Boolean).join(" ");
  }

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.heading}>New Natal Chart</h1>
      <p className={styles.sub}>
        Enter birth details — place autocomplete resolves coordinates automatically.
      </p>

      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        {errors._form && <p className={styles.formErr}>{errors._form}</p>}

        {/* Name (optional) */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="name">Name</label>
          <input
            id="name"
            className={ic(styles.input, errors.name && styles.inputErr)}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Optional"
            autoComplete="name"
          />
          {errors.name && <p className={styles.fieldErr}>{errors.name}</p>}
        </div>

        {/* Birth Date */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="birthDate">
            Birth Date <span className={styles.req}>*</span>
          </label>
          <input
            id="birthDate"
            className={ic(styles.input, errors.birthDate && styles.inputErr)}
            type="date"
            value={birthDate}
            onChange={e => setBirthDate(e.target.value)}
          />
          {errors.birthDate && <p className={styles.fieldErr}>{errors.birthDate}</p>}
        </div>

        {/* Birth Time — required, no unknown-time affordance */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="birthTime">
            Birth Time <span className={styles.req}>*</span>
          </label>
          <input
            id="birthTime"
            className={ic(styles.input, errors.birthTime && styles.inputErr)}
            type="time"
            value={birthTime}
            onChange={e => setBirthTime(e.target.value)}
          />
          {errors.birthTime && <p className={styles.fieldErr}>{errors.birthTime}</p>}
        </div>

        {/* Birth Place */}
        <div className={styles.field}>
          <label className={styles.label}>
            Birth Place <span className={styles.req}>*</span>
          </label>
          <PlaceAutocomplete
            value={place}
            onChange={setPlace}
            hasError={!!errors.place}
          />
          {errors.place && <p className={styles.fieldErr}>{errors.place}</p>}
        </div>

        <button type="submit" className={styles.btn} disabled={busy}>
          {busy ? "Calculating…" : "Calculate Chart"}
        </button>
      </form>
    </div>
  );
}
