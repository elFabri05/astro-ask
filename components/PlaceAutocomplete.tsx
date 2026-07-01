"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./PlaceAutocomplete.module.css";

export interface ResolvedPlace {
  label: string;
  latitude: number;
  longitude: number;
}

interface Props {
  value: ResolvedPlace | null;
  onChange: (value: ResolvedPlace | null) => void;
  hasError?: boolean;
}

export function PlaceAutocomplete({ value, onChange, hasError }: Props) {
  const [inputText, setInputText]     = useState(value?.label ?? "");
  const [candidates, setCandidates]   = useState<ResolvedPlace[]>([]);
  const [searching, setSearching]     = useState(false);
  const [open, setOpen]               = useState(false);
  const [noResults, setNoResults]     = useState(false);

  // Refs avoid stale closures; never trigger re-renders
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0); // increments each time a new search starts
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep input text in sync if parent resets value externally
  useEffect(() => {
    if (value) setInputText(value.label);
    else if (!value && inputText === "") { /* already blank */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Close dropdown on click outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function handleInputChange(text: string) {
    setInputText(text);
    setNoResults(false);

    // Core rule: editing text after a selection invalidates the resolved value
    if (value) onChange(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setCandidates([]);
      setOpen(false);
      setSearching(false);
      return;
    }

    debounceRef.current = setTimeout(() => doSearch(text), 300);
  }

  async function doSearch(q: string) {
    const seq = ++searchSeqRef.current;
    setSearching(true);
    try {
      const res  = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as ResolvedPlace[];
      if (searchSeqRef.current !== seq) return; // a newer search superseded this one
      setCandidates(data);
      setNoResults(data.length === 0);
      setOpen(data.length > 0);
    } catch {
      if (searchSeqRef.current !== seq) return;
      setCandidates([]);
    } finally {
      if (searchSeqRef.current === seq) setSearching(false);
    }
  }

  function handleSelect(candidate: ResolvedPlace) {
    // Bump seq so any in-flight search is ignored after selection
    searchSeqRef.current++;
    onChange(candidate);
    setInputText(candidate.label);
    setCandidates([]);
    setOpen(false);
    setNoResults(false);
    setSearching(false);
  }

  const inputCls = [styles.input, hasError ? styles.inputHasError : ""]
    .filter(Boolean).join(" ");

  return (
    <div ref={containerRef} className={styles.container}>
      <input
        className={inputCls}
        type="text"
        value={inputText}
        onChange={e => handleInputChange(e.target.value)}
        onFocus={() => { if (candidates.length > 0) setOpen(true); }}
        onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
        placeholder="Start typing a city or place…"
        aria-autocomplete="list"
        aria-expanded={open}
        autoComplete="off"
      />

      {searching && <p className={styles.status}>Searching…</p>}
      {!searching && noResults && (
        <p className={styles.status}>No matches found.</p>
      )}

      {open && candidates.length > 0 && (
        <ul className={styles.dropdown} role="listbox">
          {candidates.map((c, i) => (
            <li
              key={i}
              className={styles.option}
              role="option"
              // preventDefault keeps focus in the input so the click fires
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(c)}
            >
              {c.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
