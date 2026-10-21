"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { OTHER_SPECIALTY, specialtyByCode, type Specialty } from "@/lib/specialties";
import s from "./profile.module.css";

const norm = (v: string) => v.toLocaleLowerCase("lv").normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Searchable specialty list: type to filter (LV and EN names both match), pick with click, Enter or arrows.
 * The last option, "Other", lets the user type their own specialty in a separate field.
 */
export default function SpecialtyPicker({
  id,
  code,
  list,
  locale,
  labels,
  onChange,
}: {
  id: string;
  code: string | null;
  /** the profession's specialties (lib/specialties.ts specialtiesFor) */
  list: readonly Specialty[];
  locale: Locale;
  labels: { other: string; placeholder: string; noMatch: string };
  onChange: (code: string | null) => void;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const sorted = useMemo(
    () => [...list].sort((a, b) => a[locale].localeCompare(b[locale], locale)),
    [list, locale],
  );
  const options = useMemo(() => {
    const q = norm(query ?? "").trim();
    // names that start with the typed text come first ("kard" -> Kardiologs before Bērnu kardiologs)
    const starts = (sp: (typeof sorted)[number]) => norm(sp.lv).startsWith(q) || norm(sp.en).startsWith(q);
    const hits = q
      ? sorted.filter((sp) => norm(sp.lv).includes(q) || norm(sp.en).includes(q)).sort((a, b) => Number(starts(b)) - Number(starts(a)))
      : sorted;
    return [...hits.map((sp) => ({ code: sp.code, label: sp[locale] })), { code: OTHER_SPECIALTY, label: labels.other }];
  }, [query, sorted, locale, labels.other]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const selectedLabel = code === OTHER_SPECIALTY ? labels.other : specialtyByCode(code)?.[locale] ?? "";

  function pick(c: string | null) {
    onChange(c);
    setQuery(null);
    setOpen(false);
  }

  function openList() {
    const i = options.findIndex((o) => o.code === code);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }

  return (
    <div className={s.combo}>
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={labels.placeholder}
        value={query ?? selectedLabel}
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
          // an emptied field clears the specialty; anything else half-typed falls back to the current choice
          if (query !== null && query.trim() === "") onChange(null);
          setQuery(null);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return openList();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + options.length) % options.length);
          } else if (e.key === "Enter") {
            if (!open) return;
            e.preventDefault();
            const o = options[active];
            if (o) pick(o.code);
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
          {options.length === 1 && <li className={s.comboEmpty}>{labels.noMatch}</li>}
          {options.map((o, i) => (
            <li
              key={o.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.code === code}
              className={`${s.comboOpt} ${i === active ? s.comboActive : ""} ${o.code === OTHER_SPECIALTY ? s.comboOther : ""}`}
              // mousedown, not click: keeps focus in the input so onBlur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.code);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
