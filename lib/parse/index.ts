import type { CmeCertificate, FieldConfidence, ParseNote, Profile } from "../types";
import { LOW_CONFIDENCE } from "./confidence";
import { eventDays, findDates } from "./dates";
import { findCategory, findCountry, isEmergencyCare, isLecturer, isMasterClassTeacher } from "./place";
import { docLanguage, needsTranslation } from "./language";
import { estimateAbroad } from "../abroad";
import { derivePoints, findHours, findPoints, findPracticalHours, type PointsKind } from "./points";
import { matchesSpecialty } from "./specialty";
import { makeText } from "./text";
import { findApprovalId, findOrganizer, findTitle } from "./title";
import { suggestNurseTopic } from "../nurse";
import { foldKey } from "../text";

/*
 * Free, local certificate parsing.
 *   PDFs: text layer extracted on the server with unpdf. When the layer is thin (a scan), the browser
 *         renders the pages, OCRs them with tesseract.js and sends that text along (see ./ocr.ts).
 *   Images: OCR'd in the browser with tesseract.js, text sent with the upload.
 * parseCertificateText() is a pure heuristic extractor for Latvian, English, Lithuanian and other certificates.
 * Every key field gets a confidence; fields below LOW_CONFIDENCE are named in a note so the user checks them.
 * Results are "needs_review" unless autoConfirmBlocks() (./confidence.ts) finds nothing to check: then the upload route confirms them.
 */

export { matchesSpecialty, LOW_CONFIDENCE };


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
  | "nurseTopic"
  | "approvalId"
  | "country"
  | "language"
  | "confidence"
  | "fieldConfidence"
>;

export interface ParseResult {
  status: "needs_review";
  fields: ParsedFields;
  /** where the text came from: a real PDF text layer, OCR (photos, scanned PDFs), or nothing readable */
  source: "text" | "ocr" | "none";
  /** how the points were found; null when there are none */
  pointsKind: PointsKind | null;
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
  nurseTopic: null,
  approvalId: null,
  country: null,
  language: null,
  confidence: null,
  fieldConfidence: null,
};

/** Fewer non-space characters than this in a PDF text layer = treat as a scan */
const MIN_TEXT_CHARS = 40;

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
  return { status: "needs_review", fields: { ...EMPTY_FIELDS }, source: "none", pointsKind: null, notes: encodeNotes([{ code }]) };
}

const r2 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;

export function parseCertificateText(raw: string, profile: Pick<Profile, "specialty">, opts: { ocr?: boolean } = {}): ParseResult {
  const t = makeText(raw);
  const notes: ParseNote[] = [];
  // our own OCR misreads digits now and then; scanner-app text layers are already in `raw` and judged by content
  const ocrFactor = opts.ocr ? 0.9 : 1;

  const titleHit = findTitle(t);
  const title = titleHit.value.replace(/^["'«»„“”‹›]+|["'«»„“”‹›]+$/g, "").trim();
  const organizerHit = findOrganizer(t);
  // a line of the title read as an organizer ("... Eiropas Sirds Ritma asociācijas (EHRA)"): not the organizer
  const titleWords = new Set(foldKey(titleHit.value).split(" "));
  const inTitle = (v: string) => foldKey(v).split(" ").filter((w) => w.length > 2).every((w) => titleWords.has(w));
  if (organizerHit.value && titleHit.value && !organizerHit.stated && inTitle(organizerHit.value)) {
    organizerHit.value = "";
    organizerHit.confidence = 0;
  }
  const organizer = organizerHit.value;
  const dates = findDates(t);
  const { date, endDate } = dates;
  const pts = findPoints(t);
  notes.push(...pts.notes);
  const academicHours = findHours(t);
  const practicalHours = findPracticalHours(t);
  const emergencyCare = isEmergencyCare(t);
  const countryHit = findCountry(t);
  const country = countryHit.value;
  const masterClass = isMasterClassTeacher(t);
  // a master class the holder ran is teaching, wherever it took place
  const category = masterClass ? "lecture_or_publication" : findCategory(t, country);
  const language = docLanguage(t);

  let points = pts.value;
  let pointsConfidence = pts.confidence;
  let pointsKind = pts.kind;
  const days = eventDays(date, endDate);
  if (points != null && /(?<![\p{L}])(?:ECTS|ECMEC)/iu.test(t.raw)) notes.push({ code: "ects" });
  if (points != null && category === "training_abroad" && academicHours) {
    // the organizer's credits count 1:1; a recalculation at 1 TIP per 45 minutes may give more (lib/abroad.ts)
    const e = estimateAbroad({ credits: points, hours: academicHours.value, academic: academicHours.academic, days });
    if (e.recalculatedMax) notes.push({ code: "abroadRecalc", p: { points, max: e.recalculatedMax, academic: academicHours.academic } });
    else if (academicHours.value !== points) notes.push({ code: "foreignRatio", p: { points, h: academicHours.value } });
  }
  if (points != null && (category === "training_latvia" || category === "professional_meeting") && days && points > days * 8)
    notes.push({ code: "dailyCap", p: { points, days } });
  if (points == null && masterClass) {
    // no Annex 4 item: never calculated (see Working for Claude/annex4-teaching-abroad.md)
    notes.push({ code: "masterClass" });
  } else if (points == null) {
    const d = derivePoints(category, academicHours, date, endDate);
    if (d) {
      points = d.points;
      pointsConfidence = 0.6;
      pointsKind = "derived";
      notes.push(...d.notes);
    } else {
      notes.push({ code: "noPoints" });
    }
  }
  if (!masterClass && isLecturer(t)) {
    notes.push({ code: "lecturer", p: { international: !!country && country !== "LV" } });
    if (points != null) pointsConfidence = Math.min(pointsConfidence, 0.6);
  }
  if (!title) notes.push({ code: "noTitle" });
  if (!date) notes.push({ code: "noDate" });
  if (!country) notes.push({ code: "noCountry" });
  if (needsTranslation(language)) notes.push({ code: "foreignLanguage", p: { lang: language! } });

  const fieldConfidence: FieldConfidence = {
    title: r2(titleHit.confidence * ocrFactor),
    organizer: r2(organizerHit.confidence * ocrFactor),
    date: r2(dates.confidence * ocrFactor),
    points: r2(points == null ? 0 : pointsConfidence * ocrFactor),
    country: r2(countryHit.confidence * ocrFactor),
  };
  // fields we filled in but are not sure of; missing ones already have their own note
  const unsure = (["date", "points", "title", "organizer", "country"] as const).filter((k) => {
    const v = { date, points, title, organizer, country }[k];
    return v != null && v !== "" && fieldConfidence[k]! < LOW_CONFIDENCE;
  });
  if (unsure.length) notes.push({ code: "lowConfidence", p: { fields: unsure.join(",") } });

  const found = [title, date, pts.value ?? (points != null ? "derived" : null)].filter(Boolean).length;
  return {
    status: "needs_review",
    source: opts.ocr ? "ocr" : "text",
    pointsKind: points == null ? null : pointsKind,
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
      // kept for every profession; only nurses see and count it (Reg. 630 point 26.3)
      nurseTopic: suggestNurseTopic(t.flat, t.raw),
      approvalId: findApprovalId(t),
      country,
      language,
      confidence: Math.round((found / 3) * 100) / 100,
      fieldConfidence,
    },
    notes: encodeNotes(notes),
  };
}
