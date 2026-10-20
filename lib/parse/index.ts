import type { CmeCertificate, FieldConfidence, ParseNote, Profile } from "../types";
import { LOW_CONFIDENCE } from "./confidence";
import { eventDays, findDates } from "./dates";
import { findCategory, findCountry, isEmergencyCare, isLecturer } from "./place";
import { derivePoints, findHours, findPoints, findPracticalHours } from "./points";
import { matchesSpecialty } from "./specialty";
import { makeText } from "./text";
import { findApprovalId, findOrganizer, findTitle } from "./title";

/*
 * Free, local certificate parsing.
 *   PDFs: text layer extracted on the server with unpdf. When the layer is thin (a scan), the browser
 *         renders the pages, OCRs them with tesseract.js and sends that text along (see ./ocr.ts).
 *   Images: OCR'd in the browser with tesseract.js, text sent with the upload.
 * parseCertificateText() is a pure heuristic extractor for Latvian, English, Lithuanian and other certificates.
 * Every key field gets a confidence; fields below LOW_CONFIDENCE are named in a note so the user checks them.
 * Results are always "needs_review": the user confirms every certificate.
 */

export { matchesSpecialty, LOW_CONFIDENCE };

export const PARSEABLE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

/** Fields the parser fills in on a CmeCertificate */
export type ParsedFields = Pick<
  CmeCertificate,
  | "title"
  | "organizer"
  | "date"
  | "endDate"
  | "points"
  | "academicHours"
  | "category"
  | "inSpecialty"
  | "emergencyCare"
  | "practicalHours"
  | "approvalId"
  | "country"
  | "confidence"
  | "fieldConfidence"
>;

export interface ParseResult {
  status: "needs_review";
  fields: ParsedFields;
  /** JSON array of ParseNote (codes plus values), rendered in the UI language; null when there is nothing to say */
  notes: string | null;
}

const encodeNotes = (notes: ParseNote[]): string | null => (notes.length ? JSON.stringify(notes) : null);

export const EMPTY_FIELDS: ParsedFields = {
  title: "",
  organizer: "",
  date: null,
  endDate: null,
  points: null,
  academicHours: null,
  category: "other",
  inSpecialty: false,
  emergencyCare: false,
  practicalHours: null,
  approvalId: null,
  country: null,
  confidence: null,
  fieldConfidence: null,
};

export { OCR_PDF_BELOW } from "./ocr";

/** Fewer non-space characters than this in a PDF text layer = treat as a scan */
export const MIN_TEXT_CHARS = 40;

const textChars = (s: string) => s.replace(/\s/g, "").length;

// ---------- entry points ----------

export async function parseCertificate(
  bytes: Buffer,
  contentType: string,
  profile: Pick<Profile, "specialty">,
  ocrText?: string | null,
): Promise<ParseResult> {
  const ocr = (ocrText ?? "").trim();

  if (contentType === "application/pdf") {
    let layer = "";
    let unreadable = false;
    try {
      layer = await extractPdfText(bytes);
    } catch (err) {
      console.error("extractPdfText", err);
      unreadable = true;
    }
    const hasLayer = textChars(layer) >= MIN_TEXT_CHARS;
    const hasOcr = textChars(ocr) >= MIN_TEXT_CHARS;
    if (!hasLayer && !hasOcr) return manual(unreadable ? "pdfUnreadable" : "pdfScan");
    if (!hasOcr) return parseCertificateText(layer, profile);
    // a thin text layer often holds exactly the lines OCR misreads (names, credit tables): read both
    const r = parseCertificateText(hasLayer ? `${layer}\n\n${ocr}` : ocr, profile, { ocr: true });
    return withNote(r, { code: "pdfOcr" });
  }

  if (textChars(ocr) < MIN_TEXT_CHARS) return manual("imageUnreadable");
  return withNote(parseCertificateText(ocr, profile, { ocr: true }), { code: "ocr" });
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

function withNote(r: ParseResult, note: ParseNote): ParseResult {
  const notes: ParseNote[] = r.notes ? JSON.parse(r.notes) : [];
  return { ...r, notes: encodeNotes([note, ...notes]) };
}

function manual(code: "pdfUnreadable" | "pdfScan" | "imageUnreadable"): ParseResult {
  return { status: "needs_review", fields: { ...EMPTY_FIELDS }, notes: encodeNotes([{ code }]) };
}

const r2 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;

export function parseCertificateText(raw: string, profile: Pick<Profile, "specialty">, opts: { ocr?: boolean } = {}): ParseResult {
  const t = makeText(raw);
  const notes: ParseNote[] = [];
  // our own OCR misreads digits now and then; scanner-app text layers are already in `raw` and judged by content
  const ocrFactor = opts.ocr ? 0.9 : 1;

  const titleHit = findTitle(t);
  const title = titleHit.value.replace(/^["'«»„“”‹›]+|["'«»„“”‹›]+$/g, "").trim();
  const organizer = findOrganizer(t);
  const dates = findDates(t);
  const { date, endDate } = dates;
  const pts = findPoints(t);
  notes.push(...pts.notes);
  const academicHours = findHours(t);
  const practicalHours = findPracticalHours(t);
  const emergencyCare = isEmergencyCare(t);
  const countryHit = findCountry(t);
  const country = countryHit.value;
  const category = findCategory(t, country);

  let points = pts.value;
  let pointsConfidence = pts.confidence;
  const days = eventDays(date, endDate);
  if (points != null && /(?<![\p{L}])(?:ECTS|ECMEC)/iu.test(t.raw)) notes.push({ code: "ects" });
  if (points != null && category === "training_abroad" && academicHours && academicHours.value !== points)
    notes.push({ code: "foreignRatio", p: { points, h: academicHours.value } });
  if (points != null && (category === "training_latvia" || category === "professional_meeting") && days && points > days * 8)
    notes.push({ code: "dailyCap", p: { points, days } });
  if (points == null) {
    const d = derivePoints(category, academicHours, date, endDate);
    if (d) {
      points = d.points;
      pointsConfidence = 0.6;
      notes.push(...d.notes);
    } else {
      notes.push({ code: "noPoints" });
    }
  }
  if (isLecturer(t)) {
    notes.push({ code: "lecturer", p: { international: !!country && country !== "LV" } });
    if (points != null) pointsConfidence = Math.min(pointsConfidence, 0.6);
  }
  if (!title) notes.push({ code: "noTitle" });
  if (!date) notes.push({ code: "noDate" });
  if (!country) notes.push({ code: "noCountry" });

  const fieldConfidence: FieldConfidence = {
    title: r2(titleHit.confidence * ocrFactor),
    date: r2(dates.confidence * ocrFactor),
    points: r2(points == null ? 0 : pointsConfidence * ocrFactor),
    country: r2(countryHit.confidence * ocrFactor),
  };
  // fields we filled in but are not sure of; missing ones already have their own note
  const unsure = (["date", "points", "title", "country"] as const).filter((k) => {
    const v = k === "date" ? date : k === "points" ? points : k === "title" ? title : country;
    return v != null && v !== "" && fieldConfidence[k]! < LOW_CONFIDENCE;
  });
  if (unsure.length) notes.push({ code: "lowConfidence", p: { fields: unsure.join(",") } });

  const found = [title, date, pts.value ?? (points != null ? "derived" : null)].filter(Boolean).length;
  return {
    status: "needs_review",
    fields: {
      title: title.slice(0, 300),
      organizer: organizer.slice(0, 200),
      date,
      endDate,
      points,
      academicHours: academicHours?.value ?? null,
      category,
      inSpecialty: matchesSpecialty(t.raw, profile.specialty),
      emergencyCare,
      practicalHours,
      approvalId: findApprovalId(t),
      country,
      confidence: Math.round((found / 3) * 100) / 100,
      fieldConfidence,
    },
    notes: encodeNotes(notes),
  };
}
