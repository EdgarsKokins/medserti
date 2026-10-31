"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { fold } from "@/lib/text";
import { specialtiesFor, specialtyByCode } from "@/lib/specialties";
import type { Profession } from "@/lib/types";
import s from "./profile.module.css";

/** At most this many specialty matches under the professions, so "ārsts" or "log" never floods the list */
const MAX_SPECIALTY_HITS = 8;

interface Option {
  profession: Profession;
  /** picked through a specialty ("neirologs" -> doctor): it goes into the profile too */
  specialty: string | null;
  label: string;
  sub?: string;
}

/**
 * Sign-up profession: type to filter, pick with click, Enter or arrows (Kārlis' test, October 2026: he started typing
 * and the select did not react). A specialty name finds its profession: "neiro" offers Ārsts · Neirologs.
 * Sends `profession` and, when picked through a specialty, `specialtyCode` as hidden fields.
 */
export default function ProfessionPicker({
  id,
  professions,
  names,
  locale,
  labels,
  invalid,
  describedBy,
  onPick,
}: {
  id: string;
  professions: readonly Profession[];
  names: Record<Profession, string>;
  locale: Locale;
  labels: { placeholder: string; noMatch: string };
  invalid?: boolean;
  describedBy?: string;
  onPick: () => void;
}) {
  const listId = useId();
  const [value, setValue] = useState<Option | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo<Option[]>(() => {
    const q = fold(query ?? "").trim();
    const all = professions.map((p) => ({ profession: p, specialty: null, label: names[p] }));
    if (!q) return all;
    const has = (text: string) => fold(text).includes(q);
    const starts = (text: string) => fold(text).startsWith(q);
    const own = all.filter((o) => has(o.label)).sort((a, b) => Number(starts(b.label)) - Number(starts(a.label)));
    const viaSpecialty = professions
      .flatMap((p) => specialtiesFor(p).map((sp) => ({ p, sp })))
      .filter(({ sp }) => has(sp.lv) || has(sp.en) || has(sp[locale]))
      .sort((a, b) => Number(starts(b.sp[locale])) - Number(starts(a.sp[locale])))
      .slice(0, MAX_SPECIALTY_HITS)
      .map(({ p, sp }) => ({ profession: p, specialty: sp.code, label: sp[locale], sub: names[p] }));
    return [...own, ...viaSpecialty];
  }, [query, professions, names, locale]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const shown = value ? (value.specialty ? `${names[value.profession]} · ${specialtyByCode(value.specialty)?.[locale] ?? ""}` : names[value.profession]) : "";

  function pick(o: Option) {
    setValue(o);
    setQuery(null);
    setOpen(false);
    onPick();
  }

  function openList() {
    const i = value ? options.findIndex((o) => o.profession === value.profession && o.specialty === value.specialty) : -1;
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }

  return (
    <div className={s.combo}>
      <input type="hidden" name="profession" value={value?.profession ?? ""} />
      {value?.specialty && <input type="hidden" name="specialtyCode" value={value.specialty} />}
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={labels.placeholder}
        value={query ?? shown}
        onFocus={(e) => {
          e.currentTarget.select();
          openList();
        }}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => {
          // typed in full and left: one match, or a profession named exactly, is taken; anything else keeps the last choice
          const q = fold(query ?? "").trim();
          const exact = options.find((o) => fold(o.label) === q);
          if (q && (exact || options.length === 1)) pick(exact ?? options[0]);
          setQuery(null);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return openList();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + options.length) % Math.max(1, options.length));
          } else if (e.key === "Enter") {
            if (!open) return;
            e.preventDefault();
            const o = options[active];
            if (o) pick(o);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setQuery(null);
            setOpen(false);
          }
        }}
      />
      <span className={s.comboChevron} aria-hidden>
        <svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {open && (
        <ul id={listId} role="listbox" className={s.comboList}>
          {options.length === 0 && <li className={s.comboEmpty}>{labels.noMatch}</li>}
          {options.map((o, i) => (
            <li
              key={`${o.profession}-${o.specialty ?? ""}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={!!value && o.profession === value.profession && o.specialty === value.specialty}
              className={`${s.comboOpt} ${i === active ? s.comboActive : ""}`}
              // mousedown, not click: keeps focus in the input so onBlur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}
              {o.sub && <span className={s.comboSub}> · {o.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
