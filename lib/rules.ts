import type { CmeCertificate, NurseTopic, Profile } from "./types";
import { findSpecialty, specialtyByCode } from "./specialties";
import { nurseTopicOf } from "./nurse";
import { NURSE_RULES, RULES } from "./rule-constants";
import { round1, todayLv } from "./format";

export { NURSE_RULES, RULES };

type RuleInput = Pick<Profile, "profession" | "certificateExpires"> &
  Partial<Pick<Profile, "specialty" | "specialtyCode">>;

export type RuleBasis = "nurse" | "functionalTransition";

/** Why the rule target differs from point 51, if it does */
export function ruleBasis(p: RuleInput): RuleBasis | null {
  if (p.profession === "nurse") return "nurse";
  if (
    p.profession === "functional_specialist" &&
    !!p.certificateExpires &&
    p.certificateExpires < RULES.functionalTransitionUntil &&
    (specialtyByCode(p.specialtyCode) ?? findSpecialty(p.specialty))?.code !== "fs-physio"
  )
    return "functionalTransition";
  return null;
}

export const REGISTER_URL = "https://registri.vi.gov.lv/";

/** Points the rules require for this profile, ignoring any manual override */
export function ruleRequiredPoints(p: RuleInput): number {
  const basis = ruleBasis(p);
  if (basis === "nurse") return NURSE_RULES.points;
  if (basis === "functionalTransition") return RULES.functionalTransitionPoints;
  // method certificates (point 51: 100 TIP) are not offered: testers did not understand the choice and picked it by
  // mistake. Every certificate counts as a specialty one, including profiles that saved "method" before.
  if (p.profession === "doctor" || p.profession === "dentist" || p.profession === "functional_specialist")
    return RULES.points.doctorTier;
  return RULES.points.otherProfessions;
}

export function addYears(isoDate: string, years: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/**
 * The period certificates count in. The start is never open: with only an expiry date it is 5 years before it
 * (Reg. 391 point 6, Reg. 630 point 33), and with no dates at all it is 5 years before today, since an older
 * certificate cannot count towards any open recertification. The end stays open until a date is known.
 */
export function certificateWindow(
  p: Pick<Profile, "profession" | "certificateIssued" | "certificateExpires">,
  today = todayLv(),
): { start: string; end: string | null } {
  // nurses enter only the date their registration runs to; the term behind it is 5 years (Reg. 630 point 33)
  if (p.profession === "nurse" && p.certificateExpires)
    return { start: addYears(p.certificateExpires, -NURSE_RULES.validityYears), end: p.certificateExpires };
  const end = p.certificateExpires ?? (p.certificateIssued ? addYears(p.certificateIssued, RULES.validityYears) : null);
  const start = p.certificateIssued ?? (end ? addYears(end, -RULES.validityYears) : addYears(today, -RULES.validityYears));
  return { start, end };
}

/** Days from one YYYY-MM-DD to another */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);

/**
 * The Reg. 391 Annex 4 16% cap on practical training (footnote 3, item 10). Points above the cap count nowhere,
 * so each practical certificate counts at `scale` of its points. Reg. 630 (nurses) has no cap.
 */
export function practicalCap(
  certs: Pick<CmeCertificate, "category" | "points">[],
  required: number,
  nurse: boolean,
): { raw: number; counted: number; scale: number } {
  const cap = nurse ? Infinity : required * RULES.practicalCapShare;
  const raw = certs.reduce((a, c) => a + (c.category === "practical_training" ? (c.points ?? 0) : 0), 0);
  const counted = Math.min(raw, cap);
  return { raw, counted, scale: raw > 0 ? counted / raw : 1 };
}

/** Points a certificate counts for after the practical-training cap */
export const cappedPoints = (c: Pick<CmeCertificate, "category" | "points">, scale: number) =>
  (c.points ?? 0) * (c.category === "practical_training" ? scale : 1);

/**
 * Why computeProgress leaves a certificate out, or null when it counts. The certificate list shows the same reason,
 * so the dashboard's "not counted" line and the list never disagree.
 * - duplicate: a repeat of a certificate that is still there is not counted twice
 * - failed / processing: the file could not be read, or is still being read
 * - noDate / noPoints: a key field is missing
 * - beforeWindow / afterWindow: dated outside the certificate window
 */
export type ExclusionReason = "duplicate" | "failed" | "processing" | "noDate" | "noPoints" | "beforeWindow" | "afterWindow";

export function exclusionReason(
  c: Pick<CmeCertificate, "status" | "date" | "points" | "duplicateOf">,
  ids: Set<string>,
  window: { start: string | null; end: string | null },
): ExclusionReason | null {
  if (c.duplicateOf && ids.has(c.duplicateOf)) return "duplicate";
  if (c.status === "failed") return "failed";
  if (c.status === "parsing") return "processing";
  if (!c.date) return "noDate";
  if (c.points == null) return "noPoints";
  if (window.start && c.date < window.start) return "beforeWindow";
  if (window.end && c.date > window.end) return "afterWindow";
  return null;
}

/** True when the date is more than RULES.validityYears before today: it cannot count towards any open recertification */
export function olderThanValidity(date: string, today: string): boolean {
  return date < addYears(today, -RULES.validityYears);
}

export interface Check {
  id: "total" | "specialty" | "emergency_points" | "emergency_practical" | "infection_control" | "patient_safety" | "nursing";
  have: number;
  need: number;
  met: boolean;
}

export interface Progress {
  required: number;
  windowStart: string;
  windowEnd: string | null;
  /** certificates counted: confirmed or needs_review, dated inside the window */
  counted: CmeCertificate[];
  /** certificates outside the window or without date/points */
  excluded: CmeCertificate[];
  /** total after the practical-training cap, rounded to 0.1 for display; the checks use the unrounded sum */
  total: number;
  specialty: number;
  emergencyPoints: number;
  emergencyPracticalHours: number;
  practicalRaw: number;
  practicalCounted: number;
  /** nurses: hours per Reg. 630 point 26.3 topic; zeros for everyone else */
  topicHours: Record<NurseTopic, number>;
  remaining: number;
  /** whole days until windowEnd, null if unknown */
  daysLeft: number | null;
  /** points per month needed to finish on time, null if unknown or done */
  perMonthNeeded: number | null;
  checks: Check[];
  allMet: boolean;
}

/** For display: round to 0.1, but never up to the target while short of it, so 249.96 of 250 shows 249.9, not 250 */
const shown = (have: number, need: number) => (have < need ? Math.min(round1(have), Math.floor(have * 10 + 1e-9) / 10) : round1(have));

/** `today` is the moment the progress is for; the date used is Riga's (todayLv), on the server and in the browser */
export function computeProgress(profile: Profile, certs: CmeCertificate[], today = new Date()): Progress {
  const required = ruleRequiredPoints(profile);
  const todayIso = todayLv(today);
  const { start, end } = certificateWindow(profile, todayIso);

  const counted: CmeCertificate[] = [];
  const excluded: CmeCertificate[] = [];
  const ids = new Set(certs.map((c) => c.id));
  for (const c of certs) (exclusionReason(c, ids, { start, end }) ? excluded : counted).push(c);

  const nurse = profile.profession === "nurse";
  // the 16% cap is Reg. 391 Annex 4; Reg. 630 Annex 6 has no cap on practical training
  const cap = practicalCap(counted, required, nurse);
  let nonPractical = 0;
  for (const c of counted) if (c.category !== "practical_training") nonPractical += c.points ?? 0;

  let specialty = 0;
  let emergencyPoints = 0;
  let emergencyPracticalHours = 0;
  const topicHours: Record<NurseTopic, number> = { emergency: 0, infection_control: 0, patient_safety: 0, nursing: 0, other: 0 };
  for (const c of counted) {
    const pts = cappedPoints(c, cap.scale);
    if (c.inSpecialty) specialty += pts;
    if (nurse) {
      // one topic per certificate, so an hour never counts toward two point 26.3 minimums
      topicHours[nurseTopicOf(c)] += pts;
      continue;
    }
    if (c.emergencyCare) {
      emergencyPoints += pts;
      emergencyPracticalHours += c.practicalHours ?? 0;
    }
  }
  if (nurse) emergencyPoints = topicHours.emergency;
  // "met" compares the unrounded sum: 249.96 of 250 is not met, even though it shows as 250
  const totalRaw = nonPractical + cap.counted;
  const total = shown(totalRaw, required);
  // follows the shown total, so total + remaining = required and 0 left only when met
  const remaining = totalRaw < required ? round1(required - total) : 0;

  let daysLeft: number | null = null;
  let perMonthNeeded: number | null = null;
  if (end) {
    daysLeft = daysBetween(todayIso, end);
    // at least 0.1, so a shortfall never shows as "0 TIP a month"
    if (remaining > 0) perMonthNeeded = daysLeft > 0 ? Math.max(0.1, round1(remaining / Math.max(daysLeft / 30.44, 1))) : remaining;
  }

  const specialtyNeed = Math.ceil(required * RULES.specialtyShare);
  // the 60% share and the practical hours come from Reg. 391 point 51; Reg. 630 asks nurses for neither,
  // and sets topic minimums only for re-registration from 01 Jan 2027 (point 26.3)
  const nurse2027 = nurse && !!end && end >= NURSE_RULES.emergencyFrom;
  const nurseTopics: Check["id"][] = ["emergency_points", "infection_control", "patient_safety", "nursing"];
  const skips: Check["id"][] = nurse
    ? ["specialty", "emergency_practical", ...(nurse2027 ? [] : nurseTopics)]
    : ["infection_control", "patient_safety", "nursing"];
  const emergencyNeed = nurse ? NURSE_RULES.emergencyMinHours : RULES.emergencyMinPoints;
  // every check compares the unrounded sum; only `have` is rounded, for display
  const check = (id: Check["id"], have: number, need: number): Check => ({ id, have: shown(have, need), need, met: have >= need });
  const checks: Check[] = [
    check("total", totalRaw, required),
    check("specialty", specialty, specialtyNeed),
    check("emergency_points", emergencyPoints, emergencyNeed),
    check("emergency_practical", emergencyPracticalHours, RULES.emergencyMinPracticalHours),
    check("infection_control", topicHours.infection_control, NURSE_RULES.infectionControlMinHours),
    check("patient_safety", topicHours.patient_safety, NURSE_RULES.patientSafetyMinHours),
    check("nursing", topicHours.nursing, NURSE_RULES.nursingMinHours),
  ].filter((c) => !skips.includes(c.id));

  return {
    required,
    windowStart: start,
    windowEnd: end,
    counted,
    excluded,
    total,
    specialty: round1(specialty),
    emergencyPoints: round1(emergencyPoints),
    emergencyPracticalHours: round1(emergencyPracticalHours),
    practicalRaw: round1(cap.raw),
    practicalCounted: round1(cap.counted),
    topicHours: Object.fromEntries(Object.entries(topicHours).map(([k, v]) => [k, round1(v)])) as Record<NurseTopic, number>,
    remaining,
    daysLeft,
    perMonthNeeded,
    checks,
    allMet: checks.every((c) => c.met),
  };
}
