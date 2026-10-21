import { RULES, type Progress } from "@/lib/rules";
import type { CmeCategory, CmeCertificate } from "@/lib/types";
import { formatDate, formatNumber, inHours, t, type Dict, type Locale } from "@/lib/i18n";

/* Pure view-model helpers for the dashboard. No server-only imports, so they can be tested with tsx. */

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "2028-03-14" -> EN "14 Mar 2028", LV "14.03.2028." */
export function fmtDate(iso: string | null | undefined, locale: Locale = "en"): string {
  if (!iso) return "-";
  return formatDate(iso.slice(0, 10), locale);
}

/** Up to one decimal, no trailing ".0"; LV uses a decimal comma */
export function fmtNum(n: number, locale: Locale = "en"): string {
  return formatNumber(round1(n), locale, 1);
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const dayMs = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");

export const certTitle = (c: CmeCertificate) => c.title?.trim() || c.fileName;

export type Tone = "ok" | "warn" | "bad" | "neutral";

export interface Headline {
  tone: Tone;
  pct: number;
  /** status line under the bar, null when nothing to add */
  message: string | null;
}

/** Lowercase only the first letter, so "(TIP)" stays intact */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The dictionary for this profile: nurses see academic hours where others see TIP */
export const dictFor = (locale: Locale, hours = false): Dict => (hours ? inHours(t(locale)) : t(locale));

export function headline(p: Progress, locale: Locale = "en", hours = false): Headline {
  const d = dictFor(locale, hours);
  const pct = p.required > 0 ? Math.min(100, Math.floor((p.total / p.required) * 100)) : 0;
  const unmet = p.checks.filter((c) => !c.met && c.id !== "total").map((c) => lowerFirst(d.checks[c.id]));

  if (p.daysLeft != null && p.daysLeft < 0) {
    const ago = -p.daysLeft;
    return {
      tone: "bad",
      pct,
      message: d.dashboard.expiredMsg(fmtDate(p.windowEnd, locale), ago),
    };
  }
  if (p.remaining === 0) {
    return unmet.length
      ? { tone: "warn", pct, message: d.dashboard.unmetMsg(unmet.join(", ")) }
      : { tone: "ok", pct, message: d.dashboard.allMetMsg };
  }
  if (p.daysLeft != null && p.daysLeft < 180) {
    return {
      tone: "warn",
      pct,
      message: d.dashboard.lateMsg(fmtNum(p.remaining, locale)),
    };
  }
  return { tone: "neutral", pct, message: null };
}

export interface ChartPoint {
  date: string;
  /** cumulative total after this date, with the practical-training cap applied */
  cumulative: number;
  items: { title: string; points: number }[];
}

/** One point per distinct date, cumulative after all certificates on that date */
export function cumulativeSeries(p: Progress, hours = false): ChartPoint[] {
  // the 16% practical cap is Reg. 391; nurses (Reg. 630) have none
  const cap = hours ? Infinity : p.required * RULES.practicalCapShare;
  const sorted = [...p.counted].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const out: ChartPoint[] = [];
  let nonPractical = 0;
  let practical = 0;
  for (const c of sorted) {
    const pts = c.points ?? 0;
    if (c.category === "practical_training") practical += pts;
    else nonPractical += pts;
    const cumulative = round1(nonPractical + Math.min(practical, cap));
    const last = out[out.length - 1];
    if (last && last.date === c.date) {
      last.cumulative = cumulative;
      last.items.push({ title: certTitle(c), points: pts });
    } else {
      out.push({ date: c.date!, cumulative, items: [{ title: certTitle(c), points: pts }] });
    }
  }
  return out;
}

export interface CategoryRow {
  category: CmeCategory;
  label: string;
  points: number;
}

export function categoryBreakdown(p: Progress, locale: Locale = "en"): CategoryRow[] {
  const labels = t(locale).categories;
  const sums = new Map<CmeCategory, number>();
  for (const c of p.counted) sums.set(c.category, (sums.get(c.category) ?? 0) + (c.points ?? 0));
  return [...sums.entries()]
    .filter(([, pts]) => pts > 0)
    .map(([category, pts]) => ({ category, label: labels[category] ?? category, points: round1(pts) }))
    .sort((a, b) => b.points - a.points);
}

export interface Exclusions {
  outsideWindow: number;
  missingData: number;
  failed: number;
  processing: number;
  total: number;
}

export function exclusions(p: Progress): Exclusions {
  const e: Exclusions = { outsideWindow: 0, missingData: 0, failed: 0, processing: 0, total: p.excluded.length };
  for (const c of p.excluded) {
    if (c.status === "failed") e.failed++;
    else if (c.status === "parsing") e.processing++;
    else if (!c.date || c.points == null) e.missingData++;
    else e.outsideWindow++;
  }
  return e;
}

export const needsReviewCount = (p: Progress) => p.counted.filter((c) => c.status === "needs_review").length;

export function recent(p: Progress, n = 8): CmeCertificate[] {
  return [...p.counted].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, n);
}

/** Points you would have by today if collecting evenly across the window */
export function onTrackToday(p: Progress, today: Date): number | null {
  if (!p.windowStart || !p.windowEnd) return null;
  const span = dayMs(p.windowEnd) - dayMs(p.windowStart);
  if (span <= 0) return null;
  const share = Math.min(1, Math.max(0, (today.getTime() - dayMs(p.windowStart)) / span));
  return round1(p.required * share);
}
