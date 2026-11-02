"use client";

import { useState } from "react";
import type { Locale } from "@/lib/locale";
import { monthEnd } from "@/lib/rules";
import s from "./profile.module.css";

/**
 * "Valid until" as month and year: practitioners know when the certificate runs out, rarely the day
 * (Ineta Ūdra's and Ralfs Gauja's tests, November 2026). The value is the month's last day, YYYY-MM-DD.
 * `id` goes on the month select, so a validation error can focus it.
 */
export default function MonthYearInput({
  id,
  value,
  onChange,
  onBlur,
  locale,
  labels,
  invalid,
  describedBy,
}: {
  id: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  onBlur?: () => void;
  locale: Locale;
  labels: { month: string; year: string };
  invalid?: boolean;
  describedBy?: string;
}) {
  // one half picked, the other not yet: kept here until both are set
  const [draft, setDraft] = useState<{ y: string; m: string }>({ y: value?.slice(0, 4) ?? "", m: value?.slice(5, 7) ?? "" });
  const shown = value ? { y: value.slice(0, 4), m: value.slice(5, 7) } : draft;
  const thisYear = new Date().getFullYear();
  // a certificate runs 5 years; a year back covers one that just ended (the form explains that case)
  const years = Array.from({ length: 8 }, (_, i) => String(thisYear - 1 + i));
  if (shown.y && !years.includes(shown.y)) years.unshift(shown.y);
  const monthName = new Intl.DateTimeFormat(locale === "lv" ? "lv-LV" : locale === "ru" ? "ru-RU" : "en-GB", { month: "long", timeZone: "UTC" });

  const pick = (next: { y: string; m: string }) => {
    setDraft(next);
    onChange(next.y && next.m ? monthEnd(`${next.y}-${next.m}`) : null);
  };

  return (
    <div className={s.monthYear} role="group" aria-describedby={describedBy}>
      <select
        id={id}
        aria-label={labels.month}
        value={shown.m}
        onChange={(e) => pick({ ...shown, m: e.target.value })}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
      >
        <option value="" disabled>{labels.month}</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
          <option key={m} value={m}>{monthName.format(new Date(Date.UTC(2000, Number(m) - 1, 1)))}</option>
        ))}
      </select>
      <select
        id={`${id}-year`}
        aria-label={labels.year}
        value={shown.y}
        onChange={(e) => pick({ ...shown, y: e.target.value })}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
      >
        <option value="" disabled>{labels.year}</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
