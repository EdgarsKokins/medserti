import type { CmeCertificate, ConfidenceField } from "../types";

/** A parsed field with lower confidence is named in a "lowConfidence" note and marked in the review panel */
export const LOW_CONFIDENCE = 0.7;
/** Every key field must reach this for a certificate to be confirmed without the user */
export const AUTO_CONFIRM_CONFIDENCE = 0.9;
/** With no certificate window in the profile, a date this many years back is still plausible */
const PLAUSIBLE_YEARS = 5;

/** Should the review panel mark this field? Only while unconfirmed and still holding the parsed value. */
export function isUnsure(cert: Pick<CmeCertificate, "status" | "fieldConfidence">, field: ConfidenceField): boolean {
  const c = cert.fieldConfidence?.[field];
  return cert.status !== "confirmed" && c != null && c < LOW_CONFIDENCE;
}

export type AutoConfirmBlock =
  | "ocr" // photos and scanned PDFs: OCR can misread a digit
  | "missing" // a key field is empty
  | "unsure" // a key field is below AUTO_CONFIRM_CONFIDENCE
  | "pointsNotPrinted" // derived from hours, ECTS 1:1, summed or a course total
  | "future"
  | "outsideWindow"
  | "duplicate";

export interface AutoConfirmInput {
  source: "text" | "ocr" | "none";
  pointsKind: string | null;
  fields: Pick<CmeCertificate, "title" | "organizer" | "date" | "points" | "fieldConfidence">;
  /** the user's certificate window from lib/rules certificateWindow; nulls when not set */
  window: { start: string | null; end: string | null };
  /** the user's other certificates, to catch the same certificate uploaded twice */
  existing: Pick<CmeCertificate, "id" | "title" | "organizer" | "date" | "fileHash">[];
  fileHash: string | null;
  /** YYYY-MM-DD */
  today: string;
}

const KEY_FIELDS = ["date", "points", "title", "organizer"] as const;
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Confirm a certificate without the user only when nothing about it is a guess.
 * Returns every reason it cannot; an empty list means confirm.
 * ECTS does not qualify: we count ECTS 1:1 as TIP, but certificates print "16 ECTS" for a two-day course,
 * so the number is the organizer's label, not a fixed conversion the user can rely on.
 */
export function autoConfirmBlocks(x: AutoConfirmInput): AutoConfirmBlock[] {
  const out: AutoConfirmBlock[] = [];
  const f = x.fields;
  if (x.source !== "text") out.push("ocr");
  if (!f.title || !f.organizer || !f.date || f.points == null) out.push("missing");
  if (KEY_FIELDS.some((k) => (f.fieldConfidence?.[k] ?? 0) < AUTO_CONFIRM_CONFIDENCE)) out.push("unsure");
  if (x.pointsKind !== "printed") out.push("pointsNotPrinted");
  if (f.date) {
    if (f.date > x.today) out.push("future");
    const { start, end } = x.window;
    const earliest = start ?? `${Number(x.today.slice(0, 4)) - PLAUSIBLE_YEARS}${x.today.slice(4)}`;
    if (f.date < earliest || (end && f.date > end)) out.push("outsideWindow");
  }
  const same = x.existing.some(
    (c) =>
      (x.fileHash && c.fileHash === x.fileHash) ||
      (c.date === f.date && norm(c.title) === norm(f.title) && norm(c.organizer) === norm(f.organizer)),
  );
  if (same) out.push("duplicate");
  return out;
}
