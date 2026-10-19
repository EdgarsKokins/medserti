import type { CmeCategory, CmeCertificate, Profile } from "./types";

/*
 * Free, local certificate parsing.
 *   PDFs: text layer extracted on the server with unpdf.
 *   Images: OCR'd in the browser with tesseract.js, text sent with the upload.
 * parseCertificateText() is a pure heuristic extractor for Latvian and English certificates.
 * Results are always "needs_review": the user confirms every certificate.
 */

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
>;

export interface ParseResult {
  status: "needs_review";
  fields: ParsedFields;
  notes: string | null;
}

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
};

/** Fewer non-space characters than this in a PDF text layer = treat as a scan */
const MIN_TEXT_CHARS = 40;

// ---------- entry points ----------

export async function parseCertificate(
  bytes: Buffer,
  contentType: string,
  profile: Pick<Profile, "specialty">,
  ocrText?: string | null,
): Promise<ParseResult> {
  if (contentType === "application/pdf") {
    let text = "";
    try {
      text = await extractPdfText(bytes);
    } catch (err) {
      console.error("extractPdfText", err);
      return manual("Could not read text from this PDF. Enter the details manually.");
    }
    if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS)
      return manual("This PDF looks like a scan (no text layer), so it could not be read automatically. Enter the details manually.");
    return parseCertificateText(text, profile);
  }

  const text = (ocrText ?? "").trim();
  if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS)
    return manual("Could not read text from this image. Enter the details manually.");
  const r = parseCertificateText(text, profile);
  return { ...r, notes: ["Read from the image with OCR: check every field.", r.notes].filter(Boolean).join(" ") };
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

function manual(notes: string): ParseResult {
  return { status: "needs_review", fields: { ...EMPTY_FIELDS }, notes };
}

export function parseCertificateText(raw: string, profile: Pick<Profile, "specialty">): ParseResult {
  const text = normalize(raw);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const notes: string[] = [];

  const title = findTitle(text, lines);
  const organizer = findOrganizer(lines);
  const { date, endDate } = findDates(text);
  const pts = findPoints(text);
  if (pts.note) notes.push(pts.note);
  const academicHours = findHours(text);
  const practicalHours = findPracticalHours(text);
  const emergencyCare = EMERGENCY.some((re) => re.test(text));
  const abroad = findAbroad(text);
  const category = findCategory(text, abroad);
  const country = abroad ?? (LATVIA.test(text) || /[āčēģīķļņšūž]/i.test(text) ? "Latvia" : null);

  let points = pts.value;
  const days = eventDays(date, endDate);
  if (points != null && /(?<![\p{L}])(?:ECTS|ECMEC)/u.test(text))
    notes.push(`Credits on the certificate (ECTS/ECMEC) counted 1:1 as TIP, as set by the organizer (Annex 4 item 3).`);
  if (points != null && category === "training_abroad" && academicHours && academicHours.value !== points)
    notes.push(
      `Organizer gives ${points} points for ${academicHours.value} h. Annex 4 footnote 1: when foreign points are not 1 per academic hour, you must submit a justified recalculation.`,
    );
  if (points != null && (category === "training_latvia" || category === "professional_meeting") && days && points > days * 8)
    notes.push(`${points} TIP over ${days} day(s) is above the 8 TIP per day limit for events in Latvia (Annex 4 items 1, 2).`);
  if (points == null) {
    const d = derivePoints(category, academicHours, date, endDate);
    if (d) {
      points = d.points;
      notes.push(d.note);
    } else {
      notes.push("No points found. Enter them manually.");
    }
  }
  if (!title) notes.push("No title found.");
  if (!date) notes.push("No date found.");
  if (!country)
    notes.push("Country not found. Set it: in Latvia it's 1 TIP per academic hour (max 8 a day), abroad it's what the organizer set.");

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
      inSpecialty: matchesSpecialty(text, profile.specialty),
      emergencyCare,
      practicalHours,
      approvalId: findApprovalId(text),
      country,
      confidence: Math.round((found / 3) * 100) / 100,
    },
    notes: notes.join(" ") || null,
  };
}

// ---------- helpers ----------

// JS \b is ASCII-only; these lookarounds work with Latvian letters
const NB = "(?<![\\p{L}\\p{N}])"; // no letter/digit before
const NA = "(?![\\p{L}\\p{N}])"; // no letter/digit after
const NUM = "(\\d{1,3}(?:[.,]\\d{1,2})?)";
const rx = (src: string, flags = "giu") => new RegExp(src, flags);

function normalize(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[   \t]/g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/ {2,}/g, " ");
}

const toNum = (s: string) => Number(s.replace(",", "."));
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? undefined : end);
}

// ----- points -----

const POINT_LABEL = "(?:TIP|tālākizglītības\\s+punkt\\p{L}*|kredītpunkt\\p{L}*|ECTS(?:\\s+(?:credits?|points?))?|ECMEC\\p{L}*|CME(?:\\s+(?:points?|credits?))?|credits?|points?)";
const POINTS_AFTER = rx(`${NB}${NUM}\\s*(?:\\([^)\\n]{1,30}\\)\\s*)?(?:European\\s+|Eiropas\\s+)?${POINT_LABEL}${NA}`);
const POINTS_BEFORE = rx(
  `(?<![\\p{L}\\p{N}-])(?:TIP|tālākizglītības\\s+punkt\\p{L}*|kredītpunkt\\p{L}*|ECTS|ECMEC\\p{L}*|CME\\s+(?:points?|credits?)|credits?|punkt\\p{L}*)(?:\\s*\\([^)\\n]{1,30}\\))?\\s*(?:[:=-]|skaits:?)?\\s*${NUM}(?![\\p{L}\\p{N}/-]|[.,]\\d)`,
);
const TOTAL = /kopā|total|kopsumm/i;

function findPoints(text: string): { value: number | null; note: string | null } {
  const hits: { value: number; total: boolean; index: number }[] = [];
  for (const re of [POINTS_AFTER, POINTS_BEFORE]) {
    for (const m of text.matchAll(re)) {
      const value = toNum(m[1]);
      if (value > 0 && value <= 300) hits.push({ value, total: TOTAL.test(lineAt(text, m.index)), index: m.index });
    }
  }
  if (!hits.length) return { value: null, note: null };
  hits.sort((a, b) => a.index - b.index);
  const total = hits.find((h) => h.total);
  if (total) return { value: total.value, note: null };
  const distinct = [...new Set(hits.map((h) => h.value))];
  if (distinct.length === 1) return { value: distinct[0], note: null };
  return { value: hits[0].value, note: `Several point values found (${distinct.join(", ")}); used the first. Check it.` };
}

// ----- hours -----

const HOURS_LABEL = "(?:akadēmisk\\p{L}*\\s+stund\\p{L}*|ak\\.\\s*st(?:und\\p{L}*)?\\.?|academic\\s+hours?)";
const HOURS_AFTER = rx(`${NB}${NUM}\\s*${HOURS_LABEL}`);
const HOURS_BEFORE = rx(`${HOURS_LABEL}\\s*(?:[:-]|skaits:?)?\\s*${NUM}${NA}`);
/** plain hours: "6 stundas", "6 hours", "6 h", "duration: 6", "ilgums 6 st." */
const PLAIN_HOURS_LABEL = "(?:stund\\p{L}*|st\\.|hours?|hrs?\\.?|h)";
const PLAIN_HOURS_AFTER = rx(`${NB}${NUM}\\s*${PLAIN_HOURS_LABEL}${NA}`);
const PLAIN_HOURS_BEFORE = rx(
  `(?:duration|length|ilgums|apjoms|kopējais\\s+apjoms|stundu\\s+skaits|number\\s+of\\s+hours|hours)\\s*(?:\\([^)\\n]{1,20}\\))?\\s*[:=-]?\\s*${NUM}${NA}`,
);
const PRACTICAL_LINE = /praktisk|hands-on|practical/iu;

function collectHours(text: string, patterns: RegExp[], skipPractical: boolean) {
  const hits: { value: number; total: boolean; index: number }[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const value = toNum(m[1]);
      const line = lineAt(text, m.index);
      if (skipPractical && PRACTICAL_LINE.test(line) && !TOTAL.test(line)) continue;
      if (value > 0 && value <= 500) hits.push({ value, total: TOTAL.test(line), index: m.index });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

/** Hours of the event. `academic` is false when the certificate only says "hours" without "academic". */
function findHours(text: string): { value: number; academic: boolean } | null {
  const academic = collectHours(text, [HOURS_AFTER, HOURS_BEFORE], false);
  if (academic.length) return { value: (academic.find((h) => h.total) ?? academic[0]).value, academic: true };
  const plain = collectHours(text, [PLAIN_HOURS_AFTER, PLAIN_HOURS_BEFORE], true);
  if (plain.length) return { value: (plain.find((h) => h.total) ?? plain[0]).value, academic: false };
  return null;
}

const PRACTICAL = [
  // "4 stundas praktiskās nodarbības", "4 ak. st. praktiskā daļa"
  rx(`${NB}${NUM}\\s*(?:ak\\.\\s*st\\.?|(?:akadēmisk\\p{L}*\\s+)?stund\\p{L}*)\\s+(?:\\p{L}+\\s+)?praktisk`),
  // "praktiskās nodarbības: 4 stundas", "praktiskā daļa 4 ak. st."
  rx(`praktisk\\p{L}*(?:\\s+\\p{L}+){0,2}\\s*[:-]?\\s*${NUM}\\s*(?:ak\\.\\s*st|(?:akadēmisk\\p{L}*\\s+)?stund|h${NA}|hours?)`),
  // "4 hours of hands-on / practical training"
  rx(`${NB}${NUM}\\s*(?:academic\\s+)?(?:hours?|h)${NA}\\s+(?:of\\s+)?(?:hands-on|practical)`),
  // "practical training: 4 hours", "hands-on part 4 h"
  rx(`(?:practical|hands-on)(?:\\s+\\p{L}+){0,2}\\s*[:-]?\\s*${NUM}\\s*(?:hours?|h${NA})`),
];

function findPracticalHours(text: string): number | null {
  for (const re of PRACTICAL) {
    const m = rx(re.source, "iu").exec(text);
    if (m) return toNum(m[1]);
  }
  return null;
}

/**
 * Points from hours when the certificate prints none (Annex 4, Regulation No. 391 as amended 25 Nov 2025):
 *  item 1, 2, 8 (events in Latvia): 1 TIP per academic hour, max 8 TIP per day
 *  item 3 (abroad): as set by the organizer; with no number printed we use 1 TIP per hour (footnote 1 baseline)
 *  item 4 (certification body's interdisciplinary conference): 12 TIP each
 *  item 7, 9 (distance learning): 1 TIP per academic hour, no daily cap
 *  item 10 (practical training): 8 TIP per day
 */
function derivePoints(
  category: CmeCategory,
  hours: { value: number; academic: boolean } | null,
  date: string | null,
  endDate: string | null,
): { points: number; note: string } | null {
  const days = eventDays(date, endDate);
  if (category === "practical_training" && days)
    return { points: days * 8, note: `Points not printed; derived as ${days} day(s) x 8 TIP for practical training (Annex 4 item 10). Check before confirming.` };
  if (category === "interdisciplinary_conference")
    return { points: 12, note: "Points not printed; interdisciplinary conference of a certification body counts 12 TIP (Annex 4 item 4). Check before confirming." };
  if (!hours || hours.value <= 0) return null;

  const h = hours.value;
  const hoursWord = hours.academic ? "academic hour" : "hour";
  const plainNote = hours.academic ? "" : ` The certificate says "hours", not "academic hours"; we counted them 1:1.`;
  if (category === "training_abroad")
    return {
      points: h,
      note: `Points not printed; derived as 1 TIP per ${hoursWord} (${h} h). Abroad, points are as set by the organizer (Annex 4 item 3).${plainNote} Check before confirming.`,
    };
  if (category === "e_learning")
    return { points: h, note: `Points not printed; derived as 1 TIP per ${hoursWord} (${h} h), no daily cap for distance learning (Annex 4 items 7, 9).${plainNote} Check before confirming.` };

  const cap = days ? days * 8 : null;
  const points = cap != null ? Math.min(h, cap) : h;
  const capped = cap != null && h > cap;
  return {
    points,
    note: `Points not printed; derived as 1 TIP per ${hoursWord} (${h} h)${
      capped ? `, capped at 8 TIP per day over ${days} day(s)` : ""
    } (Annex 4 items 1, 2).${plainNote} Check before confirming.`,
  };
}

function eventDays(start: string | null, end: string | null): number | null {
  if (!start) return null;
  if (!end) return 1;
  const d = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return d >= 1 && d <= 366 ? d : null;
}

// ----- dates -----

const LV_MONTHS: [string, number][] = [
  ["janvār", 1], ["februār", 2], ["mart", 3], ["aprīl", 4], ["maij", 5], ["jūnij", 6],
  ["jūlij", 7], ["august", 8], ["septembr", 9], ["oktobr", 10], ["novembr", 11], ["decembr", 12],
];
const EN_MONTHS: [string, number][] = [
  ["jan", 1], ["feb", 2], ["mar", 3], ["apr", 4], ["may", 5], ["jun", 6],
  ["jul", 7], ["aug", 8], ["sep", 9], ["oct", 10], ["nov", 11], ["dec", 12],
];
const LV_MONTH_RX = `(${LV_MONTHS.map(([s]) => s).join("|")})\\p{L}*`;
const EN_MONTH_RX = `(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\\.?`;

const monthOf = (name: string, table: [string, number][]) => {
  const n = name.toLowerCase();
  return table.find(([s]) => n.startsWith(s))?.[1] ?? null;
};

function iso(y: number, m: number | null, d: number): string | null {
  if (!m || m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

interface DateHit {
  start: string;
  end: string | null;
  index: number;
}

const DATE_PATTERNS: { re: RegExp; read: (m: RegExpMatchArray) => [string | null, string | null] }[] = [
  // 12.03.2025 - 14.03.2025
  {
    re: rx(`(?<!\\d)(\\d{1,2})[./](\\d{1,2})[./](\\d{4})\\.?\\s*-\\s*(\\d{1,2})[./](\\d{1,2})[./](\\d{4})(?!\\d)`),
    read: (m) => [iso(+m[3], +m[2], +m[1]), iso(+m[6], +m[5], +m[4])],
  },
  // 12.-13.03.2025, 12-13.03.2025
  {
    re: rx(`(?<![\\d.])(\\d{1,2})\\.?\\s*-\\s*(\\d{1,2})[./](\\d{1,2})[./](\\d{4})(?!\\d)`),
    read: (m) => [iso(+m[4], +m[3], +m[1]), iso(+m[4], +m[3], +m[2])],
  },
  // 2025-03-12
  { re: rx(`(?<!\\d)(\\d{4})-(\\d{2})-(\\d{2})(?!\\d)`), read: (m) => [iso(+m[1], +m[2], +m[3]), null] },
  // 12.03.2025, 12/03/2025 (day first)
  { re: rx(`(?<![\\d.])(\\d{1,2})[./](\\d{1,2})[./](\\d{4})(?!\\d)`), read: (m) => [iso(+m[3], +m[2], +m[1]), null] },
  // 2025. gada 12. martā, 2025. g. 12.-13. martā
  {
    re: rx(`(\\d{4})\\.\\s*(?:gada|g\\.)\\s+(\\d{1,2})\\.(?:\\s*-\\s*(\\d{1,2})\\.)?\\s*${LV_MONTH_RX}`),
    read: (m) => {
      const mo = monthOf(m[4], LV_MONTHS);
      return [iso(+m[1], mo, +m[2]), m[3] ? iso(+m[1], mo, +m[3]) : null];
    },
  },
  // 12.-13. martā 2025, 12. marts, 2025
  {
    re: rx(`${NB}(\\d{1,2})\\.(?:\\s*-\\s*(\\d{1,2})\\.)?\\s*${LV_MONTH_RX},?\\s+(\\d{4})`),
    read: (m) => {
      const mo = monthOf(m[3], LV_MONTHS);
      return [iso(+m[4], mo, +m[1]), m[2] ? iso(+m[4], mo, +m[2]) : null];
    },
  },
  // 12 March 2025, 12-13 March 2025, 12th of March 2025
  {
    re: rx(`${NB}(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*-\\s*(\\d{1,2})(?:st|nd|rd|th)?)?\\s+(?:of\\s+)?${EN_MONTH_RX},?\\s+(\\d{4})`),
    read: (m) => {
      const mo = monthOf(m[3], EN_MONTHS);
      return [iso(+m[4], mo, +m[1]), m[2] ? iso(+m[4], mo, +m[2]) : null];
    },
  },
  // March 12, 2025, March 12-13, 2025
  {
    re: rx(`${NB}${EN_MONTH_RX}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*-\\s*(\\d{1,2})(?:st|nd|rd|th)?)?,?\\s+(\\d{4})`),
    read: (m) => {
      const mo = monthOf(m[1], EN_MONTHS);
      return [iso(+m[4], mo, +m[2]), m[3] ? iso(+m[4], mo, +m[3]) : null];
    },
  },
];

const EVENT_LINE = /norises|notika|datums|laiks|norisinā|date|held|took place|kursa|kursā|konferenc|seminār|apmācīb/i;
const ISSUE_LINE = /izsniegt|izdot|issued|paraksts|signed|dekān|direktor|rīgā,\s*\d{4}/i;

function findDates(text: string): { date: string | null; endDate: string | null } {
  const hits: DateHit[] = [];
  const taken: [number, number][] = [];
  for (const { re, read } of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const from = m.index;
      const to = from + m[0].length;
      if (taken.some(([a, b]) => from < b && to > a)) continue; // a longer pattern already covered this span
      const [start, end] = read(m);
      if (!start) continue;
      taken.push([from, to]);
      hits.push({ start, end: end && end > start ? end : null, index: from });
    }
  }
  if (!hits.length) return { date: null, endDate: null };
  const score = (h: DateHit) => {
    const line = lineAt(text, h.index);
    return (EVENT_LINE.test(line) ? 2 : 0) + (h.end ? 1 : 0) - (ISSUE_LINE.test(line) ? 2 : 0);
  };
  const best = hits.reduce((a, b) => (score(b) > score(a) || (score(b) === score(a) && b.index < a.index) ? b : a));
  return { date: best.start, endDate: best.end };
}

// ----- title -----

const QUOTES = [/„([^“”"\n]{0,200}(?:\n[^“”"\n]{0,200}){0,2})[“”"]/gu, /«([^»]{4,300})»/gu, /“([^”]{4,300})”/gu, /"([^"]{4,300})"/gu];
const ORG_PREFIX = /(?:SIA|AS|VSIA|biedrība|nodibinājums|Ltd|LLC|GmbH|Inc)\.?\s*$/iu;
const TITLE_ANCHORS = [
  /par\s+(?:sekmīgu\s+)?(?:piedalīšanos|dalību)(?:\s+(?:kursā|konferencē|seminārā|apmācībā|programmā|kongresā|darbnīcā|meistarklasē|lekcijā|vebinārā))?/iu,
  /(?:ir\s+)?(?:piedalīj\p{L}*|apmeklēj\p{L}*|apguv\p{L}*|noklausīj\p{L}*)(?:\s+(?:tālākizglītības|profesionālās\s+pilnveides|starptautiskajā|zinātniski\s+praktiskajā))?(?:\s+(?:kursā|konferencē|seminārā|apmācībā|programmā|kongresā|kursu|programmu))?/iu,
  /(?:participated\s+in|attended|has\s+completed|completed|for\s+attending|successfully\s+completed|(?:has\s+)?(?:successfully\s+)?passed)(?:\s+the(?![\p{L}]))?(?:\s+(?:course|conference|seminar|workshop|webinar|training|congress|programme|program)(?![\p{L}]))?(?:\s+(?:entitled|titled|on)(?![\p{L}]))?/iu,
  /(?<![\p{L}])(?:kursā|konferencē|seminārā|apmācībā|kongresā)/iu,
];

function cleanTitle(s: string): string {
  return collapse(s)
    // OCR often turns „ into » or ,, so strip any quote-like character at both ends
    .replace(/^[\s:„“”"«»‚‘’',-]+|[\s:„“”"«»‚‘’',.;-]+$/gu, "")
    .trim();
}

function findTitle(text: string, lines: string[]): string {
  // 1. quoted text, skipping quoted organisation names (SIA „...")
  const quoted: { value: string; index: number }[] = [];
  for (const re of QUOTES) {
    for (const m of text.matchAll(re)) {
      const before = text.slice(Math.max(0, m.index - 30), m.index);
      const value = cleanTitle(m[1]);
      if (value.length >= 4 && !ORG_PREFIX.test(before)) quoted.push({ value, index: m.index });
    }
  }
  quoted.sort((a, b) => a.index - b.index);
  if (quoted.length) {
    const anchorAt = TITLE_ANCHORS.map((re) => rx(re.source, "iu").exec(text)?.index ?? -1).filter((i) => i >= 0);
    const firstAnchor = anchorAt.length ? Math.min(...anchorAt) : -1;
    return (quoted.find((q) => firstAnchor >= 0 && q.index > firstAnchor) ?? quoted[0]).value;
  }

  // 2. rest of the anchor line, or the next line
  for (const re of TITLE_ANCHORS) {
    for (let i = 0; i < lines.length; i++) {
      const m = rx(re.source, "iu").exec(lines[i]);
      if (!m) continue;
      const rest = cleanTitle(lines[i].slice(m.index + m[0].length));
      if (rest.length >= 6) return rest;
      const next = lines[i + 1] ? cleanTitle(lines[i + 1]) : "";
      if (next.length >= 4 && !looksLikeDateOrPoints(next)) return next;
    }
  }

  // 3. "apliecina, ka" / "certify that" <name> <verb> <title>: take the line after the name
  for (let i = 0; i < lines.length; i++) {
    if (/apliecina,?\s+ka|certif\p{L}*\s+that/iu.test(lines[i]) && lines[i + 2]) return cleanTitle(lines[i + 2]);
  }
  return "";
}

const looksLikeDateOrPoints = (s: string) => /^\d|TIP|punkt|stund|hours?|datums|date/iu.test(s);

// ----- organizer -----

const ORG_WORDS =
  /biedrīb|asociācij|universitāt|slimnīc|centr[sa]|klīnik|koledž|akadēmij|institūt|dienests|(?<![\p{L}])(?:SIA|VSIA|Ltd|LLC|GmbH)(?![\p{L}])|association|society|university|hospital|clinic|college|academy|institute|centre|center|foundation|federation/iu;
const NOT_ORG = /saskaņot|apstiprin|akreditēt|reģistr|accredited|approved|endorsed|ar\s+\p{L}+\s+biedrīb/iu;
const HEADINGS = /^(?:apliecība|sertifikāts|certificate(?:\s+of\s+\p{L}+)?|diploms|izziņa|attestation|apliecina|this is to certify)/iu;

function findOrganizer(lines: string[]): string {
  const top = lines.slice(0, 25);
  const i = top.findIndex((l) => ORG_WORDS.test(l) && !NOT_ORG.test(l) && l.length <= 160);
  if (i >= 0) {
    // OCR leaves stray single letters from logos ("U University")
    let org = collapse(top[i].replace(/(?<![\p{L}\p{N}])\p{L}(?![\p{L}\p{N}.])/gu, " "));
    // logos often split the name over two lines: "Klaipeda" / "University"
    const prev = i > 0 ? collapse(top[i - 1]) : "";
    if (org.split(" ").length <= 2 && /^\p{Lu}[\p{L}-]+(?:\s+\p{Lu}[\p{L}-]+)?$/u.test(prev) && !HEADINGS.test(prev)) org = `${prev} ${org}`;
    return org.replace(/\s+(?:rector|dean|director|rektors|dekāns|direktors)\b.*$/iu, "").replace(/[,;:]+$/, "");
  }
  const first = lines.find((l) => !HEADINGS.test(l) && l.length >= 3);
  return first ? collapse(first) : "";
}

// ----- approval id -----

const ID = "([A-Z0-9ĀČĒĢĪĶĻŅŠŪŽ][\\p{L}\\p{N}\\-/.]*\\p{N}[\\p{L}\\p{N}\\-/]*)";
const APPROVAL_PATTERNS = [
  rx(`(?:reģ(?:istrācijas)?\\.?\\s*(?:Nr|numurs)\\.?|reģistrēt\\p{L}*[^\\n]{0,60}?Nr\\.?|apstiprināt\\p{L}*[^\\n]{0,60}?Nr\\.?|saskaņot\\p{L}*[^\\n]{0,80}?Nr\\.?|akreditēt\\p{L}*[^\\n]{0,60}?Nr\\.?)\\s*[:#]?\\s*${ID}`, "iu"),
  rx(`(?:approval|accreditation|registration|event)\\s*(?:no\\.?|number|code|id)\\s*[:#]?\\s*${ID}`, "iu"),
  rx(`(?<![\\p{L}])(?:Nr\\.?|No\\.)\\s*[:#]?\\s*${ID}`, "u"),
];

function findApprovalId(text: string): string | null {
  // the registration line often follows "saskaņots ar ... biedrību," on the next line
  const flat = text.replace(/,\s*\n/g, ", ");
  for (const re of APPROVAL_PATTERNS) {
    const m = re.exec(flat);
    if (m) return m[1].replace(/[.,/-]+$/, "").slice(0, 100);
  }
  return null;
}

// ----- emergency care, category, country -----

const EMERGENCY = [
  /neatliekam/iu,
  /pirm\p{L}*\s+palīdzīb/iu,
  /reanimācij|atdzīvināšan/iu,
  /(?<![\p{L}])(?:BLS|ALS|ACLS|PALS|EPALS|ATLS|CPR)(?![\p{L}])/u,
  /emergency|resuscitation|first\s+aid|life\s+support/iu,
];

const ABROAD: [RegExp, string][] = [
  [/lietuv\p{L}*|lithuania|viļņ\p{L}*|vilnius|kaun\p{L}*|kaunas|klaipė?d\p{L}*|šiauli\p{L}*|siauliai|palang\p{L}*|LT-\d{5}/iu, "Lithuania"],
  [/igaunij\p{L}*|estonia|eesti|tallin\p{L}*|tartu|pärnu|parnu/iu, "Estonia"],
  [/somij\p{L}*|finland|suomi|helsink\p{L}*|tampere|turku|oulu/iu, "Finland"],
  [/zviedrij\p{L}*|sweden|sverige|stockholm|stokholm\p{L}*|göteborg|gothenburg|malmö|uppsala/iu, "Sweden"],
  [/norvēģij\p{L}*|norway|norge|oslo|bergen/iu, "Norway"],
  [/dānij\p{L}*|denmark|danmark|copenhagen|københavn|kopenhāgen\p{L}*|aarhus/iu, "Denmark"],
  [/īslandē|islande|iceland|reykjavik/iu, "Iceland"],
  [/polij\p{L}*|poland|polska|warsaw|warszaw\p{L}*|varšav\p{L}*|kraków|krakow|gdańsk|gdansk|wrocław|wroclaw|poznań|poznan/iu, "Poland"],
  [/vācij\p{L}*|germany|deutschland|berlin\p{L}*|münchen|munich|hamburg|frankfurt|köln|cologne|düsseldorf|dusseldorf|leipzig|dresden|heidelberg|stuttgart/iu, "Germany"],
  [/austrij\p{L}*|austria|österreich|vienna|wien|vīn\p{L}*|salzburg|innsbruck|graz/iu, "Austria"],
  [/šveic\p{L}*|switzerland|schweiz|suisse|geneva|genève|ženēv\p{L}*|zurich|zürich|cīrih\p{L}*|basel|bern|lausanne|davos/iu, "Switzerland"],
  [/nīderland\p{L}*|netherlands|nederland|holland|amsterdam\p{L}*|rotterdam|utrecht|leiden|the hague|den haag|maastricht/iu, "Netherlands"],
  [/beļģij\p{L}*|belgium|belgique|brussels|bruxelles|brisel\p{L}*|antwerp|ghent|leuven/iu, "Belgium"],
  [/luksemburg\p{L}*|luxembourg/iu, "Luxembourg"],
  [/francij\p{L}*|france|paris|parīz\p{L}*|lyon|marseille|nice|strasbourg|bordeaux|toulouse/iu, "France"],
  [/spānij\p{L}*|spain|españa|barcelon\p{L}*|madrid\p{L}*|valencia|seville|sevilla|málaga|malaga/iu, "Spain"],
  [/portugāl\p{L}*|portugal|lisbon|lisboa|lisabon\p{L}*|porto/iu, "Portugal"],
  [/itālij\p{L}*|italy|italia|rome|roma|romā|milan|milano|milān\p{L}*|florence|firenze|bologna|turin|torino|naples|napoli|venice|venezia/iu, "Italy"],
  [/grieķij\p{L}*|greece|athens|atēn\p{L}*|thessaloniki/iu, "Greece"],
  [/kipr\p{L}*|cyprus|nicosia|limassol/iu, "Cyprus"],
  [/maltā|malta|valletta/iu, "Malta"],
  [/čehij\p{L}*|czech|česk\p{L}*|prague|praha|prāg\p{L}*|brno/iu, "Czechia"],
  [/slovākij\p{L}*|slovakia|bratislav\p{L}*|košice/iu, "Slovakia"],
  [/ungārij\p{L}*|hungary|magyarország|budapest\p{L}*|debrecen|szeged/iu, "Hungary"],
  [/slovēnij\p{L}*|slovenia|ljubljan\p{L}*/iu, "Slovenia"],
  [/horvātij\p{L}*|croatia|hrvatska|zagreb|split|dubrovnik/iu, "Croatia"],
  [/rumānij\p{L}*|romania|bucharest|bucurești|bukareš\p{L}*|cluj/iu, "Romania"],
  [/bulgārij\p{L}*|bulgaria|sofia|sofij\p{L}*|varna/iu, "Bulgaria"],
  [/serbij\p{L}*|serbia|belgrade|beograd/iu, "Serbia"],
  [/īrij\p{L}*|ireland|dublin|cork|galway/iu, "Ireland"],
  [/lielbritānij\p{L}*|united kingdom|great britain|england|scotland|wales|london|londonā|edinburgh|manchester|birmingham|glasgow|oxford|cambridge|liverpool/iu, "United Kingdom"],
  [/ukrain\p{L}*|kyiv|kiev|lviv|ļvov\p{L}*/iu, "Ukraine"],
  [/gruzij\p{L}*|georgia(?!\s+state)|tbilisi/iu, "Georgia"],
  [/turcij\p{L}*|turkey|türkiye|istanbul|stambul\p{L}*|ankara|antalya/iu, "Turkey"],
  [/izraēl\p{L}*|israel|tel aviv|jerusalem/iu, "Israel"],
  [/amerikas savienot\p{L}*|united states|usa(?![\p{L}])|new york|boston|chicago|san francisco|los angeles|washington,?\s*d\.?c/iu, "United States"],
  [/kanād\p{L}*|canada|toronto|montreal|vancouver/iu, "Canada"],
  [/apvienotie arābu|united arab emirates|dubai|abu dhabi/iu, "United Arab Emirates"],
];
const LATVIA = /latvij|latvia|rīg[aā]|riga|liepāj|daugavpil|jelgav|ventspil|valmier|rēzekn|jūrmal|ogr[eē]|tukum|cēs[iī]s|sigulda|LV-\d{4}/iu;

function findAbroad(text: string): string | null {
  // only look at lines that describe where/when the event happened, to avoid organisation names like "Vācijas ... biedrība"
  const placeLines = text.split("\n").filter((l) => /norises|vieta|notika|datums|place|venue|held|location|(?:19|20)\d{2}|adrese|address|iela|str\.|tel\.?:|(?<![\p{L}])[A-Z]{2}-\d{4,5}/iu.test(l));
  for (const l of placeLines) {
    if (LATVIA.test(l)) continue;
    for (const [re, country] of ABROAD) if (rx(`(?<![\\p{L}])(?:${re.source})`, "iu").test(l)) return country;
  }
  // no place line named a country: if nothing points to Latvia either, take the first country named anywhere
  if (LATVIA.test(text)) return null;
  for (const l of text.split("\n")) {
    if (/society|association|federation|biedrīb|asociācij/iu.test(l)) continue; // "Lithuanian Society of ..." is not a venue
    for (const [re, country] of ABROAD) if (rx(`(?<![\\p{L}])(?:${re.source})`, "iu").test(l)) return country;
  }
  return null;
}

const CATEGORY_RULES: [CmeCategory, RegExp][] = [
  ["e_learning", /e-mācīb|tiešsaist|attālināt|webinār|vebinār|e-kurs|online|e-learning|webinar|virtual|distance\s+learning/iu],
  ["practical_training", /(?<![\p{L}])(?<!ārsta\s)prakse(?![\p{L}])|praktisk\p{L}*\s+apmācīb|stažēšan|internship|clinical\s+(?:attachment|placement)/iu],
  ["interdisciplinary_conference", /starpdisciplīn\p{L}*\s+konferenc|interdisciplinary\s+conference/iu],
  ["professional_meeting", /biedrības\s+sēd|asociācijas\s+sēd|society\s+meeting|association\s+meeting/iu],
];

function findCategory(text: string, abroad: string | null): CmeCategory {
  // order matters: delivery mode and practical training beat location; location beats event type
  for (const [category, re] of CATEGORY_RULES) {
    if (category === "interdisciplinary_conference" && abroad) continue;
    if (re.test(text)) return category;
  }
  return abroad ? "training_abroad" : "training_latvia";
}

// ----- specialty -----

const STOP = new Set(["medicine", "medical", "medicīna", "medicīnas", "ārsts", "doctor", "general", "specialist", "speciālists", "and", "un", "of", "the", "care"]);
/** English specialty word stem -> Latvian stems, since profiles are in English and certificates usually in Latvian */
const LV_STEMS: Record<string, string[]> = {
  famil: ["ģimen"],
  cardi: ["kardio"],
  paedi: ["pediat"],
  pedia: ["pediat"],
  surge: ["ķirur"],
  neuro: ["neiro"],
  oncol: ["onkol"],
  derma: ["derma"],
  psych: ["psihi"],
  gynae: ["ginek"],
  gynec: ["ginek"],
  obste: ["dzemd"],
  ophth: ["oftal", "acu "],
  ortho: ["ortop", "traumat", "arthro", "artro", "endoprotez", "locītav"],
  ortop: ["orthop", "traumat", "arthro", "artro", "endoprotez", "locītav"],
  traum: ["ortop", "orthop", "arthro", "artro", "locītav"],
  radio: ["radio"],
  anaes: ["aneste"],
  anest: ["aneste"],
  inter: ["iekšķīg", "internā"],
  emerg: ["neatliek"],
  denti: ["zobārst", "stomat"],
  nursi: ["māsu", "māsa"],
  urolo: ["urolo"],
  endoc: ["endokr"],
  gastr: ["gastro"],
  pulmo: ["pneimo", "pulmo"],
  rheum: ["reimat"],
  infec: ["infekc"],
  otorh: ["otorin"],
  physi: ["fizik", "rehabil"],
  rehab: ["rehabil"],
  occup: ["arodslim"],
  patho: ["patolo"],
  labor: ["laborat"],
};

export function matchesSpecialty(text: string, specialty: string): boolean {
  const hay = text.toLowerCase();
  const words = specialty
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  return words.some((w) => {
    const stem = w.slice(0, 5);
    return hay.includes(stem) || (LV_STEMS[stem] ?? []).some((s) => hay.includes(s));
  });
}
