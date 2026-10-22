import { cappedPoints, exclusionReason, RULES, type Progress } from "@/lib/rules";
import type { CmeCategory, CmeCertificate } from "@/lib/types";
import { inHours, t, type Dict, type Locale } from "@/lib/i18n";
import { formatDate, formatNumber, round1 } from "@/lib/format";

/* Pure view-model helpers for the dashboard. No server-only imports, so they can be tested with tsx. */

/** "2028-03-14" -> EN "14 Mar 2028", LV "14.03.2028."; "-" for no date */
export const fmtDate = (iso: string | null | undefined, locale: Locale = "en"): string => formatDate(iso, locale) || "-";

/** Up to one decimal, no trailing ".0", decimal point in every language */
export const fmtNum = (n: number): string => formatNumber(round1(n), 1);
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

/** `d` is the page's dictionary (dictFor), `locale` formats the dates in it */
export function headline(p: Progress, d: Dict, locale: Locale): Headline {
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
      message: d.dashboard.lateMsg(fmtNum(p.remaining)),
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
  /** points that count, after the practical-training cap, so the rows add up to p.total */
  points: number;
  /** points on the certificates, before the cap */
  rawPoints: number;
}

export function categoryBreakdown(p: Progress, locale: Locale = "en"): CategoryRow[] {
  const labels = t(locale).categories;
  const scale = p.practicalRaw > 0 ? p.practicalCounted / p.practicalRaw : 1;
  const sums = new Map<CmeCategory, { points: number; raw: number }>();
  for (const c of p.counted) {
    const s = sums.get(c.category) ?? { points: 0, raw: 0 };
    s.points += cappedPoints(c, scale);
    s.raw += c.points ?? 0;
    sums.set(c.category, s);
  }
  return [...sums.entries()]
    .filter(([, s]) => s.raw > 0)
    .map(([category, s]) => ({ category, label: labels[category] ?? category, points: round1(s.points), rawPoints: round1(s.raw) }))
    .sort((a, b) => b.points - a.points);
}

interface Exclusions {
  outsideWindow: number;
  missingData: number;
  failed: number;
  processing: number;
  duplicates: number;
  total: number;
}

/** Counts per reason, from the same exclusionReason computeProgress uses */
export function exclusions(p: Progress): Exclusions {
  const e: Exclusions = { outsideWindow: 0, missingData: 0, failed: 0, processing: 0, duplicates: 0, total: p.excluded.length };
  const ids = new Set([...p.counted, ...p.excluded].map((c) => c.id));
  const window = { start: p.windowStart, end: p.windowEnd };
  for (const c of p.excluded) {
    const r = exclusionReason(c, ids, window);
    if (r === "failed") e.failed++;
    else if (r === "processing") e.processing++;
    else if (r === "duplicate") e.duplicates++;
    else if (r === "noDate" || r === "noPoints") e.missingData++;
    else e.outsideWindow++;
  }
  return e;
}

export const needsReviewCount = (p: Progress) => p.counted.filter((c) => c.status === "needs_review").length;

export function recent(p: Progress, n = 8): CmeCertificate[] {
  return [...p.counted].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, n);
}
