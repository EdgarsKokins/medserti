/*
 * Field rules for the export forms. Browser-only: nothing here is sent anywhere.
 * "bad" is what shows red while typing (a wrong character); "incomplete" only blocks the download.
 */

export const MAX = {
  name: 50,
  personalCode: 12, // "XXXXXX-XXXXX"
  practitionerId: 10,
  address: 150,
  phone: 16,
  email: 100,
  commission: 120,
  workplace: 200,
  position: 100,
  country: 60,
  note: 500,
} as const;

/** Language doc upload limit: one scan or PDF */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.edoc,.asice";

export type Problem = "required" | "letters" | "digits" | "personalCode" | "practitionerId" | "phone" | "email" | "tooLong";

/** letters (any alphabet), spaces, hyphens, apostrophes and dots: "Anna-Marija", "O'Brien", "J. Bērziņš" */
const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Personal code as the user types: digits only, dash added after the 6th digit */
export function formatPersonalCode(raw: string): string {
  // keep letters so they can be flagged; only re-format a clean digit string
  if (/[^\d\s-]/.test(raw)) return raw.slice(0, MAX.personalCode);
  const d = raw.replace(/\D/g, "").slice(0, 11);
  return d.length > 6 ? `${d.slice(0, 6)}-${d.slice(6)}` : d;
}

/** Problem shown live while typing: wrong characters only */
export function liveProblem(kind: "name" | "personalCode" | "practitionerId" | "phone", v: string): Problem | null {
  if (!v) return null;
  switch (kind) {
    case "name":
      return NAME_RE.test(v.trim() || "a") ? null : "letters";
    case "personalCode":
      return /[^\d\s-]/.test(v) ? "digits" : null;
    case "practitionerId":
      return /\D/.test(v.trim()) ? "digits" : null;
    case "phone":
      return /^\+?[\d\s]*$/.test(v) ? null : "digits";
  }
}

/** Full check before the download */
export function finalProblem(kind: "name" | "personalCode" | "practitionerId" | "phone" | "email" | "text", v: string, required: boolean, max: number): Problem | null {
  const x = v.trim();
  if (!x) return required ? "required" : null;
  if (x.length > max) return "tooLong";
  if (kind !== "email" && kind !== "text") {
    const live = liveProblem(kind, x);
    if (live) return live;
  }
  switch (kind) {
    case "personalCode":
      return /^\d{6}-?\d{5}$/.test(x) ? null : "personalCode";
    case "practitionerId":
      // a digit string; VI does not publish the length, LĀB members' IDs are usually 6-7 digits
      return /^\d{4,10}$/.test(x) ? null : "practitionerId";
    case "phone":
      return /^\d{8,15}$/.test(x.replace(/[\s+]/g, "")) ? null : "phone";
    case "email":
      return EMAIL_RE.test(x) ? null : "email";
    default:
      return null;
  }
}

