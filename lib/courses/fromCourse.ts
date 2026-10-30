import type { ParsedFields } from "../parse";
import type { ConfidenceField } from "../types";
import type { Course } from "./types";

/** below LOW_CONFIDENCE (lib/parse/confidence.ts), so the review panel marks a filled field for checking */
const FILLED_CONFIDENCE = 0.5;
const CONFIDENCE_FIELDS = new Set<string>(["title", "organizer", "date", "points", "country"] satisfies ConfidenceField[]);

/**
 * A certificate uploaded from a course in the Medserti list ("Pievienot sertifikātu"): the course fills the fields the
 * parser left empty. What the certificate itself says always wins, since it is the document LĀB sees. Filled fields
 * are marked for checking, and the certificate is never confirmed without the user.
 */
export function fillFromCourse(f: ParsedFields, c: Course): { fields: ParsedFields; filled: string[] } {
  const out: ParsedFields = { ...f };
  const filled: string[] = [];
  if (!out.title?.trim() && c.title) {
    out.title = c.title;
    filled.push("title");
  }
  if (!out.organizer?.trim() && c.organizer) {
    out.organizer = c.organizer;
    filled.push("organizer");
  }
  if (!out.date && c.startDate) {
    out.date = c.startDate;
    if (!out.endDate && c.endDate && c.endDate !== c.startDate) out.endDate = c.endDate;
    filled.push("date");
  }
  if (out.points == null && c.tip != null) {
    out.points = c.tip;
    filled.push("points");
  }
  if (!out.approvalId && c.approvalId) {
    out.approvalId = c.approvalId;
    filled.push("approvalId");
  }
  // every source in the list is a Latvian event or a Latvian e-learning portal
  if (!out.country) out.country = "LV";
  if (filled.length)
    out.fieldConfidence = {
      ...out.fieldConfidence,
      ...Object.fromEntries(filled.filter((k) => CONFIDENCE_FIELDS.has(k)).map((k) => [k, FILLED_CONFIDENCE])),
    };
  return { fields: out, filled };
}
