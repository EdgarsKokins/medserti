import type { CmeCertificate, ConfidenceField, ParseNote } from "../types";
import type { CertificateKind } from "./isCertificate";
import { foldKey } from "../text";

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
  | "duplicate"
  | "notCertificate"; // the "is this a certificate?" check said no text, or not a certificate

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
  /** the "is this a certificate?" verdict (lib/parse/isCertificate.ts); undefined when it was not judged */
  content?: CertificateKind;
}

const KEY_FIELDS = ["date", "points", "title", "organizer"] as const;

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
  if (x.content && x.content !== "certificate") out.push("notCertificate");
  if (!f.title || !f.organizer || !f.date || f.points == null) out.push("missing");
  if (KEY_FIELDS.some((k) => (f.fieldConfidence?.[k] ?? 0) < AUTO_CONFIRM_CONFIDENCE)) out.push("unsure");
  if (x.pointsKind !== "printed") out.push("pointsNotPrinted");
  out.push(...dateBlocks(f.date, x.window, x.today));
  if (findDuplicate(x.existing, f, x.fileHash)) out.push("duplicate");
  return out;
}

/** A date in the future, or outside the certificate window (the last PLAUSIBLE_YEARS years when none is set) */
function dateBlocks(date: string | null, window: { start: string | null; end: string | null }, today: string): AutoConfirmBlock[] {
  if (!date) return [];
  const out: AutoConfirmBlock[] = [];
  if (date > today) out.push("future");
  const earliest = window.start ?? `${Number(today.slice(0, 4)) - PLAUSIBLE_YEARS}${today.slice(4)}`;
  if (date < earliest || (window.end && date > window.end)) out.push("outsideWindow");
  return out;
}

/**
 * The earlier certificate this upload repeats, or null: the identical file,
 * or the same date, title and organizer (the same certificate scanned twice).
 */
export function findDuplicate(
  existing: Pick<CmeCertificate, "id" | "title" | "organizer" | "date" | "fileHash">[],
  f: Pick<CmeCertificate, "title" | "organizer" | "date">,
  fileHash: string | null,
): string | null {
  const hit = existing.find(
    (c) =>
      (fileHash && c.fileHash === fileHash) ||
      (!!f.date && !!f.title && c.date === f.date && foldKey(c.title) === foldKey(f.title) && foldKey(c.organizer) === foldKey(f.organizer)),
  );
  return hit?.id ?? null;
}

/**
 * The "Apstiprināt" button in a certificate row: the user confirms without opening the review panel.
 * Only when date and points are read and neither is marked unsure (the same isUnsure the review panel uses),
 * and never for a duplicate (a repeat of a certificate that is still there), a future date or a date outside the cycle.
 * Shared by the row and the server.
 */
export function rowConfirmEligible(
  cert: Pick<CmeCertificate, "id" | "status" | "title" | "organizer" | "date" | "points" | "fieldConfidence" | "fileHash" | "duplicateOf"> &
    Partial<Pick<CmeCertificate, "parseNotes">>,
  all: Pick<CmeCertificate, "id" | "title" | "organizer" | "date" | "fileHash">[],
  window: { start: string | null; end: string | null },
  today: string,
): boolean {
  if (cert.status !== "needs_review" || !cert.date || cert.points == null) return false;
  if (contentFlag(cert.parseNotes)) return false;
  if (isUnsure(cert, "date") || isUnsure(cert, "points")) return false;
  if (dateBlocks(cert.date, window, today).length) return false;
  return !(cert.duplicateOf && all.some((o) => o.id === cert.duplicateOf));
}

/**
 * The "is this a certificate?" note on a record uploaded anyway ("noText" or "notCertificate"), or null.
 * Such a record is never confirmed for the user: not on upload, not from its row.
 */
export function contentFlag(parseNotes: string | null | undefined): "noText" | "notCertificate" | null {
  if (!parseNotes) return null;
  try {
    const notes = JSON.parse(parseNotes) as ParseNote[];
    const hit = Array.isArray(notes) ? notes.find((n) => n?.code === "noText" || n?.code === "notCertificate") : undefined;
    return hit ? (hit.code as "noText" | "notCertificate") : null;
  } catch {
    return null; // older certificates hold plain text notes
  }
}
