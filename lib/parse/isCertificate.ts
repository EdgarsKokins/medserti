import { SPECIALTIES } from "../specialties";
import { findDates } from "./dates";
import { ocrUnreadable, type QualityIssue } from "./imageQuality";
import { findPoints } from "./points";
import { makeText, NA, NB, rx } from "./text";
import { findOrganizer, findTitle } from "./title";

/*
 * "Is this a certificate?" A rule-based check on the text we read (PDF text layer or OCR) plus what the parser found.
 * It catches the wrong file: a meme, a receipt, a holiday photo. It never blocks: the upload flow asks the user
 * ("choose another file" or "upload anyway") and a record uploaded anyway carries a note and is never confirmed for the user.
 *
 * Signals are matched on folded text (lowercase, no diacritics, OCR slips mapped; see ./text.ts) with letter boundaries,
 * in Latvian, English and Russian. Every group counts its first hit fully and a second distinct hit at a lower weight,
 * so one long certificate does not outscore a short one by repeating itself.
 *
 * Calibrated in Oct 2026 on the 47 real samples (none flagged) and 43 non-certificates: memes, receipts, a menu,
 * emails, chats, invoices, tickets, real photos (see the PR for the table). Event programmes and flyers of medical
 * courses pass as certificates on purpose: they document a course too (a programme is what a course abroad is judged by).
 */

export type CertificateKind = "certificate" | "notCertificate" | "noText";

export interface CertificateCheck {
  kind: CertificateKind;
  score: number;
  /** word-like tokens read: the noText test */
  words: number;
  /** which signals fired, for calibration and debugging */
  signals: string[];
}

/** What the parser already found; the browser leaves it out and the check runs the cheap finders itself */
export interface FoundFields {
  title?: string | null;
  organizer?: string | null;
  date?: string | null;
  points?: number | null;
}

/** Fewer word-like tokens than this: nothing readable (a landscape, a blank page, a pocket photo) */
export const MIN_WORDS = 4;
/**
 * OCR confidence (0-100) below this, and not a certificate: what was "read" is noise from a photo (photos 13-44,
 * real certificates 57 and up). A certificate with low confidence stays a certificate: the blurry check speaks then.
 */
export const NO_TEXT_CONFIDENCE = 45;
/** Score at or above this: a certificate (real samples score 5.5 and up, non-certificates 2.5 at most) */
export const CERTIFICATE_SCORE = 4;

const alt = (words: string[]) => words.join("|");

/** certificate, statement and award words; stems take any ending ("apliecin" = apliecina, apliecinājums, apliecība is separate) */
const CERT = [
  "sertifikat", "certifikat", "certificat", "certify", "certifies", "certified", "apliecib", "apliecin", "izzin", "diplom",
  "atzinibas", "pateicibas raksts", "goda raksts", "attestation", "attendance", "confirmation of participation",
  "сертификат", "справк", "удостоверени", "свидетельств", "диплом", "грамот",
];
/** points, credits and hours, the units a CME certificate counts in */
const CREDIT = [
  // TIP is a common word on a restaurant receipt ("TIP 6.00"): only with a number before it, a "TIP2025/..." approval or "TIP punkti"
  // and never a money amount ("4.83\nTIP 6.00"): one decimal at most, on the same line
  "\\d+(?:[.,]\\d)?[\\x20\\t]?tip", "tip\\s?\\d{4}\\s?/", "tip punkt", "talakizglitibas punkt", "kreditpunkt", "credit points?", "\\d[\\d.,]*\\s*credits?",
  // the bare acronyms turn up in OCR'd names ("Dr CMe"): only with a unit or "for CME"
  "cme\\s*(?:credit|hour|point|certif|accredit|activit)", "(?:for|european|accredited)\\s+cme", "cpd\\s*(?:credit|hour|point)",
  "\\d[\\d.,]*\\s*ects", "ects\\s*(?:credit|point)", "ecmec", "uems", "eaccme", "akademiskas stundas", "akad\\.? st", "\\d+\\s*(?:stundas|stundu|hours?|часов|часа)",
  "балл", "кредит",
];
/** course and event words */
const EVENT = [
  "kurs[sau]", "kursos", "seminar", "konferenc", "kongres", "lekcij", "meistarklas", "simpozij", "apmacib", "darbnic", "vebinar",
  "course", "congress", "conference", "symposium", "workshop", "webinar", "lecture", "training", "master ?class", "live surgery", "meeting",
  "курс", "конференц", "семинар", "конгресс", "мастер-?класс", "лекци", "симпозиум", "повышени[ея] квалификации",
];
/** someone took part: the sentence every certificate makes */
const PARTICIPATION = [
  "piedalij", "apmeklej", "noklausij", "pabeidz", "attended", "participated", "has completed", "successfully completed", "passed",
  "принял[аи]? участие", "участвовал", "прош[её]л", "провел",
];
/** medical context beyond the specialty names */
const MEDICAL = [
  "arst", "medicin", "mediku", "klinik", "slimnic", "veselib", "pacient", "kirurg", "masu asociacij", "medmas",
  "hospital", "clinic", "medical", "medicine", "physician", "surgeon", "surgery", "doctor", "nurse", "health", "patient",
  "клиник", "больниц", "врач", "медицин", "хирург", "пациент", "здравоохранени",
];
/** shop, restaurant and travel documents; a certificate rarely says these (a course flyer may name its fee and invoice) */
const COMMERCE = [
  "rekin", "kases ceks", "ceks nr", "kopa apmaksai", "kopa eur", "pvn \\d", "samaksat", "edienkart", "pirkum",
  "invoice", "receipt", "subtotal", "total due", "total", "vat \\d", "boarding pass", "boarding", "gate", "seat", "e-ticket", "fare", "menu",
  "starters", "desserts", "кассовый чек", "чек", "итого", "ндс", "оплата картой", "посадочн", "меню",
];

/** Specialty names from lib/specialties.ts reduced to their medical stem: "Traumatologs" -> "traumatolo" also finds "traumatologam" */
const MEDICAL_ROOT = /(?:log|iatr|kirurg|surg|ortop|orthop|pediat|paediat|terap|therap|skop|scop|grafi|graph|patol|pathol|medic|dont|лог|иатр|хирург|терап|педиатр|ортоп|травм|скоп|граф|медиц)/;
const SPECIALTY_STEMS = (() => {
  const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const stems = new Set<string>();
  for (const s of SPECIALTIES)
    for (const name of [s.lv, s.en, s.ru])
      for (const w of fold(name).split(/[^\p{L}]+/u))
        if (w.length >= 7 && MEDICAL_ROOT.test(w)) stems.add(w.slice(0, Math.max(6, w.length - 2)));
  return [...stems];
})();

// matched on folded text with its line breaks; a space in a phrase also spans a break (OCR splits lines anywhere)
const group = (words: string[]) => rx(`${NB}(?:${alt(words).replace(/ /g, "\\s+")})`, "giu");
const GROUPS = {
  cert: { re: group(CERT), first: 4, more: 2 },
  credit: { re: group(CREDIT), first: 3, more: 1 },
  event: { re: group(EVENT), first: 2, more: 1 },
  participation: { re: group(PARTICIPATION), first: 2, more: 0 },
  medical: { re: group([...MEDICAL, ...SPECIALTY_STEMS]), first: 2, more: 1 },
  // one penalty, however many: a course programme names its fee and invoice, a receipt says little else anyway
  commerce: { re: rx(`${NB}(?:${alt(COMMERCE).replace(/ /g, "\\s+")})${NA}`, "giu"), first: -2, more: 0 },
} as const;

/** Word-like tokens: two or more letters with a vowel. OCR of a photo yields scraps ("Mn", "mw", "Šo"), not words */
export function countWords(text: string): number {
  let n = 0;
  for (const tok of text.split(/[^\p{L}]+/u)) {
    if (tok.length < 2 || tok.length > 30) continue;
    // a letter soup of mixed case ("mMwN") is OCR noise; real words are lower, Title or UPPER case
    if (!/^(?:\p{Lu}?\p{Ll}+|\p{Lu}+)$/u.test(tok)) continue;
    if (!/[aeiouyāēīūoаеёиоуыэюяіAEIOUYĀĒĪŪАЕЁИОУЫЭЮЯ]/u.test(tok)) continue;
    // two-letter tokens count only in upper case or as common words; OCR noise is mostly two letters
    if (tok.length === 2 && !/^\p{Lu}{2}$/u.test(tok) && !/^(?:ar|un|uz|no|ka|ir|šo|to|of|in|on|at|by|is|it|an|as|we|my|me|на|по|за|от|до|не|из|он|мы|вы)$/u.test(tok.toLowerCase())) continue;
    n++;
  }
  return n;
}

/**
 * Is this text a CME certificate (or a programme of one)? `found`: what the parser read; computed here when left out.
 * `ocrConfidence`: tesseract's mean confidence when the text is our OCR; null for a PDF text layer.
 */
export function classifyCertificate(text: string, found?: FoundFields | null, ocrConfidence: number | null = null): CertificateCheck {
  const words = countWords(text);
  const t = makeText(text);
  const signals: string[] = [];
  let score = 0;
  for (const [name, g] of Object.entries(GROUPS)) {
    const hits = new Set<string>();
    for (const m of t.fold.matchAll(g.re)) hits.add(m[0].replace(/[\d.,\s]+/g, " ").trim());
    if (!hits.size) continue;
    const pts = g.first + (hits.size > 1 ? g.more : 0);
    score += pts;
    signals.push(`${name}${pts >= 0 ? "+" : ""}${pts}(${[...hits].slice(0, 3).join("|")})`);
  }
  const f = found ?? {
    date: findDates(t).date,
    points: findPoints(t).value,
    title: findTitle(t).value,
    organizer: findOrganizer(t).value,
  };
  if (f.date) {
    score += 1;
    signals.push("date+1");
  }
  if (f.points != null) {
    score += 2;
    signals.push("points+2");
  }
  if (f.title) {
    score += 0.5;
    signals.push("title+0.5");
  }
  if (f.organizer) {
    score += 0.5;
    signals.push("organizer+0.5");
  }
  const kind: CertificateKind =
    score >= CERTIFICATE_SCORE && words >= MIN_WORDS
      ? "certificate"
      : words < MIN_WORDS || (ocrConfidence != null && ocrConfidence < NO_TEXT_CONFIDENCE)
        ? "noText"
        : "notCertificate";
  return { kind, score, words, signals };
}

/** What the upload flow asks the user about a file, if anything */
/**
 * A photo of a computer screen instead of the file: the OCR text carries the app's menu bar ("Edit View Go Tools Window
 * Help") or the keyboard's function row (F1 F2 F3 ...). The PDF itself reads far better, so we ask for it.
 */
export function screenPhoto(text: string): boolean {
  const menu = text.split("\n").some((l) => new Set(l.match(/(?<![\p{L}])(?:File|Edit|View|Go|Tools|Window|Help|Format|Insert|Bookmarks|History)(?![\p{L}])/gu) ?? []).size >= 4);
  const fKeys = new Set(text.match(/(?<![\p{L}\d])F(?:[1-9]|1[0-2])(?!\d)/gu) ?? []).size >= 4;
  return menu || fKeys;
}

export type UploadQuestion =
  | { kind: "quality"; issues: QualityIssue[] }
  | { kind: "noText" }
  | { kind: "notCertificate" };

/**
 * One question per file, in this order:
 *   1. it reads as a certificate: the photo checks speak (blurry, dark, bright, small before OCR; low OCR confidence after)
 *   2. a photo check failed before OCR: the photo message, whatever the text says. A shaken certificate reads as scraps
 *      that look like no certificate at all, so the text of a bad photo is not evidence.
 *   3. the photo is fine and the text is real but no certificate: "not a certificate" (retaking the photo won't help)
 *   4. the photo is fine and there is no text: "no text found"
 * `issues` are the checks before OCR (none for a PDF text layer); `ocrConfidence` is null for a PDF text layer.
 */
export function uploadQuestion(x: { check: CertificateCheck; issues: QualityIssue[]; ocrConfidence: number | null; text: string }): UploadQuestion | null {
  if (x.check.kind === "certificate") {
    // only photos (OCR): a PDF's own text layer is never a screen photo
    if (x.ocrConfidence != null && screenPhoto(x.text)) return { kind: "quality", issues: ["screen", ...x.issues] };
    if (x.issues.length) return { kind: "quality", issues: x.issues };
    if (x.ocrConfidence != null && ocrUnreadable(x.ocrConfidence, x.text)) return { kind: "quality", issues: ["unreadable"] };
    return null;
  }
  if (x.issues.length) return { kind: "quality", issues: x.issues };
  return { kind: x.check.kind };
}
