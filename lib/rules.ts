import type { CmeCertificate, Profile } from "./types";

/**
 * Recertification rules from Cabinet Regulation No. 391 "Ārstniecības personu sertifikācijas kārtība"
 * (18 June 2024, consolidated text as of 01 May 2026, likumi.lv/ta/id/352922).
 */
export const RULES = {
  sourceUrl: "https://likumi.lv/ta/id/352922",
  /** point 6: certificate issued for five years */
  validityYears: 5,
  /** point 51: 250 TIP doctors/dentists/functional specialists, 150 other professions, 100 methods */
  points: { doctorTier: 250, otherProfessions: 150, method: 100 },
  /** point 51: at least 60% from activity related to the certified specialty */
  specialtyShare: 0.6,
  /** point 51: at least 8 TIP from emergency medical care training, incl. at least 4 practical hours */
  emergencyMinPoints: 8,
  emergencyMinPracticalHours: 4,
  /** Annex 4 footnote 4 (marked on item 10, practical training): max 16% of required points */
  practicalCapShare: 0.16,
} as const;

export const REGISTER_URL = "https://registri.vi.gov.lv/";

/** Points the rules require for this profile, ignoring any manual override */
export function ruleRequiredPoints(p: Pick<Profile, "profession" | "certificationKind">): number {
  if (p.certificationKind === "method") return RULES.points.method;
  if (p.profession === "doctor" || p.profession === "dentist" || p.profession === "functional_specialist")
    return RULES.points.doctorTier;
  return RULES.points.otherProfessions;
}

export function requiredPoints(p: Profile): number {
  if (p.requiredPointsOverride && p.requiredPointsOverride > 0) return p.requiredPointsOverride;
  return ruleRequiredPoints(p);
}

export function addYears(isoDate: string, years: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function certificateWindow(p: Profile): { start: string | null; end: string | null } {
  const start = p.certificateIssued;
  const end = p.certificateExpires ?? (start ? addYears(start, RULES.validityYears) : null);
  return { start, end };
}

export interface Check {
  id: "total" | "specialty" | "emergency_points" | "emergency_practical";
  have: number;
  need: number;
  met: boolean;
}

export interface Progress {
  required: number;
  windowStart: string | null;
  windowEnd: string | null;
  /** certificates counted: confirmed or needs_review, dated inside the window (or all, if no window set) */
  counted: CmeCertificate[];
  /** certificates outside the window or without date/points */
  excluded: CmeCertificate[];
  /** total after the practical-training cap */
  total: number;
  specialty: number;
  emergencyPoints: number;
  emergencyPracticalHours: number;
  practicalRaw: number;
  practicalCounted: number;
  remaining: number;
  /** whole days until windowEnd, null if unknown */
  daysLeft: number | null;
  /** points per month needed to finish on time, null if unknown or done */
  perMonthNeeded: number | null;
  checks: Check[];
  allMet: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeProgress(profile: Profile, certs: CmeCertificate[], today = new Date()): Progress {
  const required = requiredPoints(profile);
  const { start, end } = certificateWindow(profile);

  const counted: CmeCertificate[] = [];
  const excluded: CmeCertificate[] = [];
  const ids = new Set(certs.map((c) => c.id));
  for (const c of certs) {
    // a repeat of a certificate that is still there is not counted twice
    const repeat = !!c.duplicateOf && ids.has(c.duplicateOf);
    const usable = !repeat && (c.status === "confirmed" || c.status === "needs_review") && c.points != null && c.date;
    const inWindow = c.date && (!start || c.date >= start) && (!end || c.date <= end);
    (usable && inWindow ? counted : excluded).push(c);
  }

  const practicalCap = required * RULES.practicalCapShare;
  let practicalRaw = 0;
  let nonPractical = 0;
  for (const c of counted) {
    if (c.category === "practical_training") practicalRaw += c.points ?? 0;
    else nonPractical += c.points ?? 0;
  }
  const practicalCounted = Math.min(practicalRaw, practicalCap);
  // Practical training above the 16% cap does not count anywhere, so scale those points down
  const practicalScale = practicalRaw > 0 ? practicalCounted / practicalRaw : 1;

  let specialty = 0;
  let emergencyPoints = 0;
  let emergencyPracticalHours = 0;
  for (const c of counted) {
    const pts = (c.points ?? 0) * (c.category === "practical_training" ? practicalScale : 1);
    if (c.inSpecialty) specialty += pts;
    if (c.emergencyCare) {
      emergencyPoints += pts;
      emergencyPracticalHours += c.practicalHours ?? 0;
    }
  }
  const total = round1(nonPractical + practicalCounted);
  const remaining = Math.max(0, round1(required - total));

  let daysLeft: number | null = null;
  let perMonthNeeded: number | null = null;
  if (end) {
    const ms = new Date(end + "T00:00:00Z").getTime() - today.getTime();
    daysLeft = Math.ceil(ms / 86_400_000);
    if (remaining > 0) perMonthNeeded = daysLeft > 0 ? round1(remaining / Math.max(daysLeft / 30.44, 1)) : remaining;
  }

  const specialtyNeed = Math.ceil(required * RULES.specialtyShare);
  const checks: Check[] = [
    { id: "total", have: total, need: required, met: total >= required },
    {
      id: "specialty",
      have: round1(specialty),
      need: specialtyNeed,
      met: specialty >= specialtyNeed,
    },
    {
      id: "emergency_points",
      have: round1(emergencyPoints),
      need: RULES.emergencyMinPoints,
      met: emergencyPoints >= RULES.emergencyMinPoints,
    },
    {
      id: "emergency_practical",
      have: round1(emergencyPracticalHours),
      need: RULES.emergencyMinPracticalHours,
      met: emergencyPracticalHours >= RULES.emergencyMinPracticalHours,
    },
  ];

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
    practicalRaw: round1(practicalRaw),
    practicalCounted: round1(practicalCounted),
    remaining,
    daysLeft,
    perMonthNeeded,
    checks,
    allMet: checks.every((c) => c.met),
  };
}
