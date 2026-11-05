import type { CmeCertificate, FieldConfidence, Lecture, ParseNote, Profile } from "../types";
import { LOW_CONFIDENCE } from "./confidence";
import { eventDays, findDates } from "./dates";
import { findCategory, findCountry, isEmergencyCare, isLecturer, isMasterClassTeacher } from "./place";
import { docLanguage, needsTranslation } from "./language";
import { estimateAbroad } from "../abroad";
import { derivePoints, findHours, findPoints, findPracticalHours, type PointsKind } from "./points";
import { matchesSpecialty } from "./specialty";
import { latvianSpeller, makeText } from "./text";
import { findApprovalNumbers, type ApprovalRead } from "./approvals";
import { readCourse, type LectureRead } from "./course";
import { classifyCertificate, type CertificateKind } from "./isCertificate";
import { findApprovalId, findOrganizer, findTitle } from "./title";
import { latvianChecker } from "./spelling";
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
  | "approvalIds"
  | "lectures"
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
  /** "is this a certificate?" on the text read (./isCertificate.ts); left out when there was nothing to judge */
  content?: CertificateKind;
  /** every approval number read, to look up in the LĀB register (./register.ts); never stored */
  numbers?: ApprovalRead[];
  /** the text read, to check a register row against; never stored */
  text?: string;
  /** which of the title's words the parser wrote from the sentence and may be respelled from the register */
  titleRead?: { value: string; confidence: number };
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
  approvalIds: null,
  lectures: null,
  country: null,
  language: null,
  confidence: null,
  fieldConfidence: null,
};

/** A field the spell check changed is sure enough not to be flagged, but a person confirms it (AUTO_CONFIRM_CONFIDENCE) */
const SPELLED_CONFIDENCE = 0.85;

/** Fewer non-space characters than this in a PDF text layer = treat as a scan */
const MIN_TEXT_CHARS = 40;

const textChars = (s: string) => s.replace(/\s/g, "").length;

// ---------- entry points ----------

export async function parseCertificate(
  bytes: Buffer,
  contentType: string,
  profile: Pick<Profile, "specialty">,
  ocrText?: string | null,
  /** tesseract's mean confidence (0-100) for ocrText, sent by the browser; tells photo noise from text */
  ocrConfidence: number | null = null,
): Promise<ParseResult> {
  const ocr = (ocrText ?? "").trim();
  const judge = (r: ParseResult, text: string, conf: number | null) => withContent(r, classifyCertificate(text, r.fields, conf).kind);

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
    if (!hasOcr) return judge(parseCertificateText(layer, profile), layer, null);
    // a thin text layer often holds exactly the lines OCR misreads (names, credit tables): read both
    const text = hasLayer ? `${layer}\n\n${ocr}` : ocr;
    const read = hasLayer ? parseLayerAndOcr(layer, ocr, profile) : parseCertificateText(ocr, profile, { ocr: true });
    return judge(withNote(read, { code: "pdfOcr" }), text, hasLayer ? null : ocrConfidence);
  }

  // too little to parse: still judged when OCR read something (a meme caption is short); no OCR text at all means the
  // browser could not read it, so there is nothing to judge
  if (textChars(ocr) < MIN_TEXT_CHARS) return ocr ? withContent(manual("imageUnreadable"), classifyCertificate(ocr, null, ocrConfidence).kind) : manual("imageUnreadable");
  return judge(withNote(parseCertificateText(ocr, profile, { ocr: true }), { code: "ocr" }), ocr, ocrConfidence);
}

/**
 * Record what the "is this a certificate?" check found. Anything but a certificate puts its note first
 * (the review panel says so before anything else); "no text" replaces "could not read the image", which says the same.
 */
export function withContent(r: ParseResult, kind: CertificateKind): ParseResult {
  if (kind === "certificate") return { ...r, content: kind };
  const notes: ParseNote[] = (r.notes ? (JSON.parse(r.notes) as ParseNote[]) : []).filter((n) => !(kind === "noText" && n.code === "imageUnreadable"));
  return { ...r, content: kind, notes: encodeNotes([{ code: kind }, ...notes]) };
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractTextItems, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { items } = await extractTextItems(pdf);
  // unpdf's extractText, except that text placed far away on the page starts a new line: pdf.js marks no line end
  // between "Piešķirti 8 TIP" and a seal's "PARAUGU" in the corner, which would read as "8 TIPPARAUGU".
  // A jump of a line or so is a wrapped line of a scan's skewed text layer ("bezmiegu" / "un"): left as it was.
  const pages = items.map((page) => {
    let s = "";
    let prev: (typeof page)[number] | null = null;
    for (const it of page) {
      if (prev && !prev.hasEOL && prev.str && it.str && Math.abs(it.y - prev.y) > Math.max(it.fontSize, prev.fontSize) * 2) s += "\n";
      s += it.str + (it.hasEOL ? "\n" : "");
      prev = it;
    }
    return s;
  });
  return pages.join("\n").replace(/[^\S\n]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function withNote(r: ParseResult, note: ParseNote): ParseResult {
  const notes: ParseNote[] = r.notes ? JSON.parse(r.notes) : [];
  return { ...r, notes: encodeNotes([note, ...notes]) };
}

function manual(code: "pdfUnreadable" | "pdfScan" | "imageUnreadable"): ParseResult {
  return { status: "needs_review", fields: { ...EMPTY_FIELDS }, source: "none", pointsKind: null, notes: encodeNotes([{ code }]) };
}

const r2 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;

/** A scan with both a text layer and OCR: the layer spelled from the OCR, then the OCR itself */
export function parseLayerAndOcr(layer: string, ocr: string, profile: Pick<Profile, "specialty">): ParseResult {
  const spelled = latvianSpeller(ocr)(layer);
  return parseCertificateText(`${spelled}\n\n${ocr}`, profile, { ocr: true, reads: [spelled, ocr] });
}

export function parseCertificateText(raw: string, profile: Pick<Profile, "specialty">, opts: { ocr?: boolean; reads?: string[] } = {}): ParseResult {
  const t = makeText(raw);
  const notes: ParseNote[] = [];
  // our own OCR misreads digits now and then; scanner-app text layers are already in `raw` and judged by content
  const ocrFactor = opts.ocr ? 0.9 : 1;

  // the sentence and the lecture list, read from each read alone; anything else keeps the rules of findTitle
  const course = readCourse((opts.reads ?? [raw]).map(makeText));
  const titleHit = course.hit ?? findTitle(t);
  const titleRead = titleHit.value.replace(/^["'«»„“”‹›]+|["'«»„“”‹›]+$/g, "").trim();
  const organizerHit = findOrganizer(t);
  // a line of the title read as an organizer ("... Eiropas Sirds Ritma asociācijas (EHRA)"): not the organizer
  // (the header above the heading is its own line, even when the event is named after it: "Baltic Demo Cardiology Forum 2025")
  const titleWords = new Set(foldKey(titleHit.value).split(" "));
  const inTitle = (v: string) => foldKey(v).split(" ").filter((w) => w.length > 2).every((w) => titleWords.has(w));
  if (organizerHit.value && titleHit.value && !organizerHit.stated && !organizerHit.header && inTitle(organizerHit.value)) {
    organizerHit.value = "";
    organizerHit.confidence = 0;
  }
  const spell = latvianChecker(t.raw);
  const title = spell(titleRead, "title", titleHit.own);
  const organizer = spell(organizerHit.value, "organizer");
  const dates = findDates(t);
  const { date, endDate } = dates;
  const pts = findPoints(t);
  notes.push(...pts.notes);
  const numbers = findApprovalNumbers(t);
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

  const spelled = (field: string, read: string, confidence: number) => (field === read ? confidence : Math.min(confidence, SPELLED_CONFIDENCE));
  const fieldConfidence: FieldConfidence = {
    title: r2(spelled(title, titleRead, titleHit.confidence) * ocrFactor),
    organizer: r2(spelled(organizer, organizerHit.value, organizerHit.confidence) * ocrFactor),
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
      // the first LĀB number, or whatever other approval number the certificate has
      approvalId: numbers[0]?.id ?? findApprovalId(t),
      approvalIds: numbers.length > 1 ? numbers.map((n) => n.id) : null,
      lectures: lecturesWithPoints(course.lectures, numbers, points, (name) => spell(name, "title")),
      country,
      language,
      confidence: Math.round((found / 3) * 100) / 100,
      fieldConfidence,
    },
    notes: encodeNotes(notes),
    numbers,
    text: t.raw,
    titleRead: { value: title.slice(0, 300), confidence: fieldConfidence.title ?? 0 },
  };
}

/**
 * The lectures read, spelled. Their numbers: each one's own, or the numbers listed under the list in the order printed.
 * Their points only when they add up to the certificate's: a total printed under the last lecture is not that lecture's.
 */
function lecturesWithPoints(read: LectureRead[], numbers: ApprovalRead[], points: number | null, spell: (name: string) => string): Lecture[] | null {
  if (!read.length) return null;
  const inOrder = numbers.length === read.length && read.every((l) => !l.approvalId);
  const sum = read.reduce((a, l) => a + (l.tip ?? 0), 0);
  const addsUp = read.every((l) => l.tip != null) && points != null && Math.abs(sum - points) <= 0.05;
  return read.map((l, i) => ({
    name: spell(l.name).slice(0, 300),
    tip: addsUp ? l.tip : null,
    approvalId: l.approvalId ?? (inOrder ? numbers[i].id : null),
  }));
}
