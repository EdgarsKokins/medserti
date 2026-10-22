import type { CmeCertificate } from "@/lib/types";
import { olderThanValidity } from "@/lib/rules";

/** Fields the review panel checks, in the order they appear (the first invalid one gets focus) */
export const CHECKED_FIELDS = ["title", "date", "endDate", "points", "academicHours", "practicalHours"] as const;
export type CheckedField = (typeof CHECKED_FIELDS)[number];
type FieldErrorKey = "titleMissing" | "dateMissing" | "dateFuture" | "endFuture" | "endBeforeStart" | "pointsMissing" | "number";

type Values = Pick<CmeCertificate, "title" | "date" | "endDate" | "points" | "academicHours" | "practicalHours">;

/** "Missing" errors block only a confirm; a draft may still be incomplete. Every other error blocks any save. */
export const MISSING: ReadonlySet<FieldErrorKey> = new Set(["titleMissing", "dateMissing", "pointsMissing"]);

/** The same limits the PATCH route applies (app/api/certificates/[id]/route.ts) */
const badNumber = (n: number | null) => n != null && (!Number.isFinite(n) || n < 0 || n > 1000);

/** What is wrong with each field; `today` is YYYY-MM-DD in Latvia */
export function fieldErrors(f: Values, today: string): Partial<Record<CheckedField, FieldErrorKey>> {
  const out: Partial<Record<CheckedField, FieldErrorKey>> = {};
  if (!f.title.trim()) out.title = "titleMissing";
  if (!f.date) out.date = "dateMissing";
  else if (f.date > today) out.date = "dateFuture";
  if (f.endDate && f.endDate > today) out.endDate = "endFuture";
  else if (f.date && f.endDate && f.endDate < f.date) out.endDate = "endBeforeStart";
  if (f.points == null) out.points = "pointsMissing";
  else if (badNumber(f.points)) out.points = "number";
  if (badNumber(f.academicHours)) out.academicHours = "number";
  if (badNumber(f.practicalHours)) out.practicalHours = "number";
  return out;
}

type DateNotice = { kind: "older5" } | { kind: "beforePeriod" | "afterPeriod"; date: string };

/**
 * A warning under the date when the certificate cannot count: outside the user's certificate window (the same test as
 * lib/rules exclusionReason, so the panel and the dashboard agree), worded as "older than 5 years" when it is (Reg. 391
 * point 6: a certificate runs five years). With no window in the profile, the 5 years alone. Saving is still allowed.
 */
export function dateNotice(date: string | null, window: { start: string | null; end: string | null }, today: string): DateNotice | null {
  if (!date || date > today) return null;
  const old = olderThanValidity(date, today);
  if (window.start && date < window.start) return old ? { kind: "older5" } : { kind: "beforePeriod", date: window.start };
  if (window.end && date > window.end) return { kind: "afterPeriod", date: window.end };
  if (!window.start && old) return { kind: "older5" };
  return null;
}
