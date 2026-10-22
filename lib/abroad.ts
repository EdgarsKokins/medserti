/*
 * How many TIP a course abroad will likely give: an estimate for the doctor, not an LĀB decision. Client-safe.
 *
 * Rules (Reg. 391 Annex 4 as worded by No. 487; quotes in Working for Claude/annex4-teaching-abroad.md):
 *  item 3: events abroad count "atbilstoši pasākuma organizatora noteiktajam" (what the organizer sets), no LĀB approval;
 *  footnote 1: if that is not 1 TIP per academic hour, the doctor submits a recalculation;
 *  LĀB FAQ Q2: 1 TIP per academic hour (45 minutes), at most 8 TIP a day; recalculations follow 1 TIP per academic hour.
 * Edgars chose the conservative reading (22 Oct 2026):
 *  - credits stated (ECMEC, CME, ECTS): they count 1:1; with the hours known, a recalculation at 45 minutes could give
 *    more, shown as a note
 *  - no credits: programme hours / 45 minutes, at most 8 TIP a day
 *  - only dates: no number; bring the programme with times
 */

/** Event types; all of them are Annex 4 item 3, the type only changes what proof to bring */
export const ABROAD_KINDS = ["conference", "course", "live_surgery", "workshop"] as const;
export type AbroadKind = (typeof ABROAD_KINDS)[number];

export const ACADEMIC_HOUR_MIN = 45;
export const MAX_TIP_PER_DAY = 8;

export interface AbroadInput {
  /** credits the organizer states (ECMEC, CME credits, ECTS); null when none */
  credits: number | null;
  /** programme hours the doctor attends; null when unknown */
  hours: number | null;
  /** false: clock hours (60 min); true: the certificate already says academic hours (45 min) */
  academic?: boolean;
  /** days the event runs; null when unknown */
  days: number | null;
}

export interface AbroadEstimate {
  /** estimated TIP, or null when only dates are known */
  tip: number | null;
  basis: "credits" | "hours" | "none";
  /** the 8 TIP a day limit cut the hours estimate */
  capped: boolean;
  /** credits stated: what a recalculation at 1 TIP per 45 minutes could give, when that is more */
  recalculatedMax: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 60-minute hours as academic hours (45 minutes) */
export const toAcademicHours = (hours: number, academic = false) => (academic ? hours : (hours * 60) / ACADEMIC_HOUR_MIN);

export function estimateAbroad(x: AbroadInput): AbroadEstimate {
  const days = x.days && x.days > 0 ? x.days : null;
  if (x.credits != null && x.credits > 0) {
    // the recalculation needs the hours; without them we would be guessing what one credit is (ECTS is not an hour)
    const recalculated = x.hours && x.hours > 0 ? round1(Math.min(toAcademicHours(x.hours, x.academic), days ? days * MAX_TIP_PER_DAY : Infinity)) : null;
    return { tip: round1(x.credits), basis: "credits", capped: false, recalculatedMax: recalculated != null && recalculated > x.credits ? recalculated : null };
  }
  if (x.hours && x.hours > 0) {
    const academicHours = toAcademicHours(x.hours, x.academic);
    const cap = days ? days * MAX_TIP_PER_DAY : null;
    const capped = cap != null && academicHours > cap;
    return { tip: round1(capped ? cap : academicHours), basis: "hours", capped, recalculatedMax: null };
  }
  return { tip: null, basis: "none", capped: false, recalculatedMax: null };
}

/** Days from a start and an end date (YYYY-MM-DD), inclusive; null when unknown or odd */
export function daysBetween(start: string | null, end: string | null): number | null {
  if (!start) return null;
  if (!end) return 1;
  const d = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return d >= 1 && d <= 60 ? d : null;
}
