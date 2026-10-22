import { findSpecialty, OTHER_PROFESSION_SPECIALTIES, SPECIALTIES, type Specialty } from "../specialties";
import { fold } from "./text";

/*
 * Does a certificate or course belong to the user's specialty?
 *
 * Each specialty has terms: phrases of word stems, matched at the start of a word on folded text (lowercase, no
 * diacritics, so OCR text that lost them still matches). One stem covers the Latvian declensions ("kardiolog" ->
 * kardiologs, kardioloģijā, kardiologiem) and the English and Russian forms. Terms come from the LV/EN/RU names in
 * lib/specialties.ts, plus the curated list below where the names alone miss common wording or are too broad.
 *
 * Narrow on purpose: a missed match costs the user one tick in the review form, a false one silently inflates the
 * 60% own-specialty share (Reg. 391 point 51) and the course picks.
 */

/** Curated terms per LĀB code, added to the ones derived from the names. Words are stems matched at a word start; "x=" is a whole word */
const CURATED: Record<string, string[]> = {
  // Ģimenes (vispārējās prakses) ārsts
  "57": [
    "ģimen ārst", "ģimen medicīn", "vispārēj prakse", "primār aprūp", "primār veselīb aprūp",
    "family medicin", "family physician", "family doctor", "general practi", "primary care", "primary health care",
    "семейн врач", "семейн медицин", "общ практик", "общ врачебн практик",
  ],
  // Internists
  "64": ["internist", "intern medicīn", "internal medicin", "iekšķīg slimīb", "внутренн болезн", "внутренн медицин"],
  // Pediatrs
  "99": ["pediatr", "paediatr", "педиатр", "bērn slimīb", "детск болезн"],
  // Anesteziologs, reanimatologs
  "7": [
    "anesteziolog", "anaesthesiolog", "anesthesiolog", "anestēzij intensīv", "anaesthesia intensive", "anesthesia intensive",
    "reanimatolog", "intensīv terapij", "intensive care", "critical care", "анестезиолог", "реаниматолог", "интенсивн терап",
  ],
  // Ķirurgs
  "71": ["ķirurg", "surger", "surgeon", "хирург"],
  // Ginekologs, dzemdību speciālists
  "55": ["ginekolog", "gynaecolog", "gynecolog", "dzemdniec", "dzemdīb", "obstetri", "акушер", "гинеколог"],
  // Psihiatrs
  "104": ["psihiatr", "psychiatr", "психиатр"],
  // Kardiologs
  "66": [
    "kardiolog", "cardiolog", "кардиолог", "kardiovaskul", "cardiovascul", "сердечн сосудист",
    "sirds mazspēj", "heart failur", "сердечн недостаточ", "aritm", "arrhythm", "аритм", "ritm traucējum", "sirds ritm", "hsm=", "koronār", "coronar", "коронарн",
    "elektrokardiogr", "elektrokardiolog", "electrocardiogr", "electrocardiolog", "электрокардиогр", "ekg=", "ecg=", "экг=", "ehokardiogr", "echocardiogr", "эхокардиогр",
    "kardiomiopāt", "cardiomyopath", "кардиомиопат", "bradikard", "bradycard", "брадикард", "tahikard", "tachycard", "тахикард",
  ],
  // Radiologs diagnosts
  "106": [
    "radiolog", "радиолог", "rentgen", "рентген", "datortomogrāf", "computed tomograph", "компьютерн томограф",
    "magnētisk rezonans", "magnetic resonance imag", "mri=", "мрт=",
  ],
  // Radiologs terapeits
  "107": ["radiolog terapeit", "radiation oncolog", "radiotherap", "staru terapij", "лучев терап"],
  // Neirologs
  "83": ["neirolog", "neurolog", "невролог"],
  // Traumatologs, ortopēds
  "122": [
    "traumatolog", "ortopēd", "orthopaed", "orthoped", "травматолог", "ортопед", "orthopaedic surger", "orthopedic surger",
    "artroskop", "arthroscop", "артроскоп", "endoprotezēšan", "arthroplast", "эндопротез",
  ],
  // Oftalmologs
  "87": ["oftalmolog", "ophthalmolog", "офтальмолог", "acu slimīb", "eye diseas", "glaukom", "glaucom", "katarakt", "cataract"],
  // Zobārsts
  "128": ["zobārst", "dentist", "dental", "stomatolog", "стоматолог"],
  // Bērnu zobārsts, Zobu protēzists: their RU names would otherwise mask nothing useful
  "28": ["bērn zobārst", "paediatric dentist", "pediatric dentist", "детск стоматолог"],
  "129": ["zob protēz", "prosthodont", "стоматолог ортопед"],
  // Onkologs ķīmijterapeits
  "88": ["onkolog", "oncolog", "онколог", "ķīmijterapij", "chemotherap", "химиотерап"],
  // Otolaringologs
  "95": ["otolaringolog", "otorinolaringolog", "otorhinolaryngolog", "otolaryngolog", "ent=", "лор=", "оториноларинголог"],
  // Pneimonologs
  "103": ["pulmonolog", "пульмонолог"],
  // Psihoterapeits
  "105": ["psihoterap", "psychotherap", "психотерап"],
  // Patologs: "patoloģija" alone is any disease ("sirds patoloģija"), so only the doctor and the field
  "98": ["patologs=", "patologi=", "patologu=", "patologa=", "patologiem=", "pathologist", "patologanatom", "patolog anatom", "patholog anatom", "histopatolog", "histopatholog", "патологоанатом"],
  // Fizikālās un rehabilitācijas medicīnas ārsts
  "48": ["rehabilitolog", "fizikāl rehabilitācij medicīn", "physical rehabilitation medicin", "реабилитолог"],
  // Laboratorijas ārsts
  "72": ["laboratorij medicīn", "laboratorij ārst", "laboratory medicin", "лабораторн медицин"],
  // Tiesu psihiatrijas eksperts
  "118": ["ties psihiatr", "forensic psychiatr", "судебн психиатр"],
  // functional specialists, physician assistants
  "fs-physio": ["fizioterap", "physiotherap", "физиотерап"],
  "fs-ot": ["ergoterap", "occupational therap", "эрготерап"],
  "fs-slt": ["logopēd", "speech language therap", "логопед"],
  "fs-diet": ["uztur speciālist", "dietitian", "dietolog", "диетолог"],
  "fs-art": ["māksl terapij", "art therap", "арт терап"],
  "fs-optom": ["optometr", "оптометр"],
  "pa-ems": ["feldšer", "paramedic", "фельдшер"],
};

/** Words in the list names that say nothing about the field: dropped when deriving terms */
const DROP = new Set(
  ["ārsts", "ārste", "ārsta", "ārsti", "doctor", "physician", "врач", "speciālists", "specialist", "специалист", "metode", "metodes", "method", "метод"].map(fold),
);
/** Joiners skipped inside a phrase ("Fizikālās un rehabilitācijas") */
const JOIN = new Set(["un", "and", "of", "the", "in", "ar", "with", "и", "в", "по", "incl"]);
/** Stems too broad to match on their own (a phrase may still use them): inter- matched "International", radio- matched "Radiofrekvences" */
const GENERIC = new Set(
  [
    "inter", "radio", "neiro", "neuro", "нейро", "kardio", "cardio", "psih", "psych", "elektr", "electr", "ekspert", "expert", "эксперт",
    "terapij", "therap", "терапи", "diagnostik", "diagnost", "medicīn", "medicin", "медицин", "klīnisk", "clinic", "клиническ",
    "sport", "lāzer", "laser", "лазер", "alkohol", "alcohol", "patolog", "patholog", "fiziolog", "physiolog",
  ].map(fold),
);

/** Folded word -> stem: strips one case or number ending (LV, EN, RU) so a prefix match covers the other forms */
function stem(w: string): string {
  // fold has already turned "й" into "и"
  if (/[а-я]/.test(w)) return w.replace(/(иеи|ого|ому|ами|ями|ия|ии|ию|ыи|ои|ая|ое|ые|ых|их|ов|ев|ам|ах|а|я|ы|и|о|е|у|ю|ь)$/, "");
  const en = w.replace(/olog(?:ists?|ical|ic|y)$/, "olog").replace(/iatr(?:ics|ists?|ic|y|s)$/, "iatr");
  if (en !== w) return en;
  return w.replace(/(ijas|ijai|iju|ija|iem|ajam|ais|as|am|ai|os|us|is|es|s|a|u|i|e|y)$/, "");
}

const words = (s: string) => fold(s).split(/[^\p{L}]+/u).filter(Boolean);

/** Stem phrases from one list name: "Dermatologs, venerologs" -> two alternatives; "Mutes, sejas un žokļu ķirurgs" -> one phrase */
function nameTerms(name: string): string[] {
  const parts = name.replace(/\([^)]*\)/g, " ").split(",").map((p) => words(p).filter((w) => !DROP.has(w) && !JOIN.has(w)));
  const alternatives = parts.length > 1 && parts.every((p) => p.length === 1);
  const phrases = alternatives ? parts : [parts.flat()];
  return phrases
    .filter((p) => p.length > 0)
    .map((p) => p.map((w) => (w.length < 3 ? `${w}=` : stem(w))))
    .filter((p) => p.length > 1 || (p[0].length >= 6 && !GENERIC.has(p[0])))
    .map((p) => p.join(" "));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NB = "(?<![\\p{L}\\p{N}])";
const NA = "(?![\\p{L}\\p{N}])";
// rest of the word, then spaces, commas, hyphens or slashes, then at most one joiner
const GAP = `\\p{L}*[\\s,\\-/]+(?:(?:${[...JOIN].join("|")})[\\s,\\-/]+)?`;

/** "sirds mazspēj" -> word-start regex on folded text; "mri=" must be the whole word */
function termRx(phrase: string): RegExp {
  const src = phrase
    .trim()
    .split(/\s+/)
    .map((w) => (w.endsWith("=") ? esc(fold(w.slice(0, -1))) + NA : esc(fold(w))))
    .join(GAP);
  return new RegExp(NB + src, "u");
}

const ALL: readonly Specialty[] = [...SPECIALTIES, ...OTHER_PROFESSION_SPECIALTIES];

function termsOf(s: Specialty): string[] {
  const derived = [s.lv, s.en, s.ru].flatMap(nameTerms);
  return [...new Set([...derived, ...(CURATED[s.code] ?? []).map((t) => t.split(/\s+/).map(fold).join(" "))])];
}

interface Matcher {
  terms: RegExp[];
  /** narrower listed specialties that contain this one's stem ("Bērnu kardiologs" for Kardiologs), blanked out before matching */
  masks: RegExp[];
}

/**
 * A lecturer's credit ("Dr. Oskars Kalējs, kardiologs, PSKUS"): a role noun between a comma and punctuation.
 * It names who speaks, not the field of the event, so it is blanked out. LĀB names joined by a comma keep their first part.
 */
const CREDIT = /,\s*\p{L}+(?:s|e|ist|ian)(?=\s*(?:[,;.|)\-–—]|$))/gmu;
/** The same credit on the line under the lecturer's name ("Dr. Anželika Gudreniece\nneirologs") */
const CREDIT_LINE = /(?<=^\s*(?:dr|prof|asoc)\b[^\n]*\n)\s*\p{L}+(?:s|e|ist|ian)(?=\s*(?:[,;.|)\-–—]|$))/gmu;

const cache = new Map<string, Matcher>();

function buildMatcher(specialty: string): Matcher {
  // a listed specialty, or free text whose parts are listed ("Traumatoloģija un ortopēdija"), or plain free text
  const whole = findSpecialty(specialty);
  const listed = whole
    ? [whole]
    : [...new Set(specialty.split(/[,;/]|\s(?:un|and|и)\s/u).map((p) => findSpecialty(p)).filter((s): s is Specialty => !!s))];
  const own = listed.length ? listed.flatMap(termsOf) : nameTerms(specialty);
  const terms = own.map(termRx);
  const hits = (s: string) => terms.some((rx) => rx.test(s));
  const ownNames = listed.length ? listed.flatMap((s) => [s.lv, s.en, s.ru].map(fold)) : [fold(specialty)];
  const masks: RegExp[] = [];
  for (const other of ALL) {
    if (listed.includes(other)) continue;
    for (const phrase of termsOf(other)) {
      if (!phrase.includes(" ") || !hits(phrase)) continue;
      const rx = termRx(phrase);
      // a phrase that also names the user's own specialty is not narrower ("Radiologs diagnosts" vs "radiolog")
      if (ownNames.some((n) => rx.test(n))) continue;
      masks.push(new RegExp(rx.source, "gu"));
    }
  }
  return { terms, masks };
}

export function matchesSpecialty(text: string, specialty: string): boolean {
  const key = specialty.trim();
  if (!key || !text) return false;
  let m = cache.get(key);
  if (!m) cache.set(key, (m = buildMatcher(key)));
  if (!m.terms.length) return false;
  let t = fold(text).replace(CREDIT_LINE, " ").replace(CREDIT, " ");
  for (const rx of m.masks) t = t.replace(rx, " ");
  return m.terms.some((rx) => rx.test(t));
}
