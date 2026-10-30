import type { Locale } from "./locale";

/* Date and number formatting for every language. No dependencies: safe for client components and scripts. */

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** YYYY-MM-DD (a time after it is ignored) -> LV "27.11.2026.", RU "27.11.2026", EN "27 Nov 2026"; "" for no date */
/** "01.03.2023. - 01.03.2028.", or only the start when the end is not known yet */
export function formatPeriod(start: string, end: string | null, locale: Locale): string {
  return end ? `${formatDate(start, locale)} - ${formatDate(end, locale)}` : formatDate(start, locale);
}

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  if (locale === "lv") return `${d}.${mo}.${y}.`;
  if (locale === "ru") return `${d}.${mo}.${y}`;
  return `${d} ${MONTHS_EN[Number(mo) - 1] ?? mo} ${y}`;
}

/** Decimal point in every language (1.3 TIP), no thousands separator; "" for no number */
export function formatNumber(n: number | null | undefined, maxDigits = 2): string {
  if (n == null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDigits, useGrouping: false }).format(n);
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Today's date in Latvia (YYYY-MM-DD). The server runs on UTC, which is a day behind after midnight in Riga. */
export function todayLv(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
