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
  out.push(...dateBlocks(f.date, x.window, x.today));
  if (isDuplicate({ ...f, fileHash: x.fileHash }, x.existing)) out.push("duplicate");
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

type DupFields = Pick<CmeCertificate, "title" | "organizer" | "date"> & { fileHash?: string | null };

/** Same file, or same title + organizer + date as one of `others` */
function isDuplicate(c: DupFields, others: DupFields[]): boolean {
  return others.some(
    (o) =>
      (!!c.fileHash && o.fileHash === c.fileHash) ||
      (!!c.date && o.date === c.date && norm(o.title) === norm(c.title) && norm(o.organizer) === norm(c.organizer)),
  );
}

/**
 * "Confirm all checked": the user confirms in one click every needs_review certificate whose date, points,
 * title and organizer all reach AUTO_CONFIRM_CONFIDENCE. Unlike auto-confirm, OCR'd certificates qualify,
 * because the user sees the list and confirms it. Duplicates, future dates and dates outside the cycle stay in review.
 * Shared by the button (to list them) and the server (which decides again and never trusts the client's list).
 */
export function confirmCheckedEligible(
  cert: Pick<CmeCertificate, "id" | "status" | "title" | "organizer" | "date" | "points" | "fieldConfidence" | "fileHash">,
  all: Pick<CmeCertificate, "id" | "title" | "organizer" | "date" | "fileHash">[],
  window: { start: string | null; end: string | null },
  today: string,
): boolean {
  if (cert.status !== "needs_review") return false;
  if (!cert.title || !cert.organizer || !cert.date || cert.points == null) return false;
  if (KEY_FIELDS.some((k) => (cert.fieldConfidence?.[k] ?? 0) < AUTO_CONFIRM_CONFIDENCE)) return false;
  if (dateBlocks(cert.date, window, today).length) return false;
  return !isDuplicate(cert, all.filter((o) => o.id !== cert.id));
}
