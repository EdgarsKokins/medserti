import { commonWordsEndingIn } from "./lvDictionary";
import { canonicalApproval } from "./approvals";
import { readsAsWord } from "./spelling";
import { collapse, fold, type Text } from "./text";
import { stripOcrNoise } from "./title";

/*
 * What a Latvian certificate says it was: one course and the lectures heard there.
 * The course name is the sentence's, the lectures are the list under it. A scan comes as two reads, the scanner's text
 * layer and our OCR, with different words lost in each, so each read is parsed alone and the best read of each part wins.
 * Rules are about the sentence and the list, whoever printed them: no name of an organizer or a course in here.
 */

export interface LectureRead {
  name: string;
  /** TIP printed for this lecture alone, when it is */
  tip: number | null;
  /** its own approval number, when it has one */
  approvalId: string | null;
}

export interface CourseHit {
  value: string;
  confidence: number;
  /** a word the parser wrote itself: the document's other forms of it say nothing about it (./spelling.ts) */
  own?: string;
}

/** Event nouns as the sentence has them (folded, "in the ..."), their dictionary form, and whether an adjective agrees as masculine */
const EVENTS: Record<string, { noun: string; masculine?: boolean }> = {
  nodarbiba: { noun: "nodarbība" },
  seminara: { noun: "seminārs", masculine: true },
  akademija: { noun: "akadēmija" },
  cikla: { noun: "cikls", masculine: true },
  foruma: { noun: "forums", masculine: true },
  konference: { noun: "konference" },
  kongresa: { noun: "kongress", masculine: true },
  simpozija: { noun: "simpozijs", masculine: true },
  skola: { noun: "skola" },
  vebinara: { noun: "vebinārs", masculine: true },
  darbnica: { noun: "darbnīca" },
  meistarklase: { noun: "meistarklase" },
  apmaciba: { noun: "apmācība" },
  paneldiskusija: { noun: "paneļdiskusija" },
  kursa: { noun: "kurss", masculine: true },
  kursos: { noun: "kursi", masculine: true },
};
/** Words that describe any event: a sentence with only these names none ("izglītojošā seminārā") */
const GENERIC_WORD = /^(?:izglitojos|zinatnisk|praktisk|interaktiv|talakizglitib|neformal|starptautisk)/u;
const SHORT_WORDS = new Set(["un", "ar", "par", "uz", "no", "ka", "kā", "ko", "kas", "vai", "to", "ir", "pa", "pēc", "pec", "bez", "vēl", "vel", "ja", "jo"]);

const ORGANISED = /(\S+)\s+(?:organizet|rikot)\p{L}*\s+(.{3,240}?)\s+(?:un\s+)?noklaus/du;
/** "par piedalīšanos seminārā <title> LĀB Sertifikācijas padome ...": the scanner misreads the two words, so they are read loosely */
const TAKING_PART = /par\s+pieda\S{3,9}nos\s+\S{5,12}\s+(.{6,300}?)\s+(?:la[bv]\s+)?sertifik\S+\s+padom/du;
/** "piedalījās seminārā <name>" up to what follows a name. Scans have "paneldiskusija" as "pane!diskusija". */
const NAMED = /piedal\S*\s+(?:(?:izglitojosa|zinatniski\s+praktiskaja|starptautiskaja|zinatniskaja)\s+)?(?:seminara|pane\S?diskusij\p{L}*|konference|kursos|kursa|vebinara|darbnica|meistarklase|apmaciba)\s*:?\s+(.{4,300}?)\s+(?=un\s+noklaus|noklaus|lektor|la[bv]\s+sertifik|sertifik\S+\s+padom|programma|(?:dr|prof|asoc|doc)\.)/du;
/** "piedalījās izglītojošā seminārā: <date> un noklausījās lekciju": the seminar has no name, the first lecture says what it was */
const UNNAMED_SEMINAR = /piedal\S*\s+(?:\S+\s+){0,3}?seminara\s*:?\s+(?:[^"“„]{0,50}\s)?(?:un\s+)?noklaus/u;

const QUOTE = /["“”„«»]|''|’’|‘‘/u;
const SYMBOLS = /[°=<>@#{}[\]\\^£$%&]/u;

const lower = (s: string) => s.toLocaleLowerCase("lv");
const upperShare = (s: string) => {
  const letters = s.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter((c) => c === c.toLocaleUpperCase("lv") && c !== c.toLocaleLowerCase("lv")).length / letters.length : 0;
};
const inCaps = (s: string) => upperShare(s) >= 0.7;

/** A word of a title printed in capitals, in normal case; abbreviations stay ("AH", "SGLT2", "EKG") */
function wordCase(w: string): string {
  const core = w.replace(/[^\p{L}\p{N}]/gu, "");
  if (/\d/.test(core) || core.length <= 1) return w;
  if (core.length <= 5 && !readsAsWord(core)) return w;
  const small = lower(w);
  return /^(?:latvij|eirop|baltij|rīg|rig[aā])/u.test(lower(core)) ? small.replace(/\p{L}/u, (c) => c.toLocaleUpperCase("lv")) : small;
}

/** A name in capitals in sentence case ("KĀ PRAKSĒ ..." is "Kā praksē ..."); a first letter up either way */
export function sentenceCase(s: string): string {
  const cased = inCaps(s) ? s.split(" ").map(wordCase).join(" ") : s;
  const out = cased.replace(/(\p{N})-\s/gu, "$1 - ");
  // the first letter, and the first after the end of a sentence when the whole was in capitals
  const up = (x: string) => x.replace(/\p{L}/u, (c) => c.toLocaleUpperCase("lv"));
  return up(inCaps(s) ? out.replace(/((?<!\d)[.?!]\s+)(\p{Ll})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase("lv")) : out);
}

/** A word stuck to a digit ("skolas7.") and a dot inside a word in capitals ("JAUT.AJUMI" is the scanner's "Ā") */
const unglue = (s: string) =>
  s
    .replace(/(\p{L}{3})(\d{1,2}\.)/gu, "$1 $2")
    .replace(/(\p{Lu})\.(\p{Lu})/gu, "$1$2")
    .replace(/(\p{Lu})\.(?=[\s"”“]|$)/gu, (m, a: string, off: number, all: string) => (/\p{Lu}{3}$/u.test(all.slice(Math.max(0, off - 3), off + 1)) ? a : m));

/** A token of a sentence read as text, without the bits of logos and table borders around it, or null when it is such a bit */
function keepToken(raw: string): string | null {
  const w = raw.replace(/^[^\p{L}\p{N}(]+|[^\p{L}\p{N}).:?!]+$/gu, "").replace(/[.:]$/, (m) => (/^\d+\.$/.test(raw) ? m : ""));
  if (/^\d{1,2}\.$/u.test(w) || /^[IVX]{1,4}$/u.test(w)) return w;
  if (SHORT_WORDS.has(lower(w))) return w;
  return /^[\p{L}(][\p{L}()'’-]{2,}$/u.test(w) ? w : null;
}

/** The organizer's logo inside the sentence's words ("0Paraugs", "OParaugs") */
const sameName = (a: string, b: string) => fold(a).replace(/0/g, "o") === fold(b).replace(/0/g, "o");

/**
 * The name in a sentence's "... <course>": "Veselības skolas 7. interaktīvajā nodarbībā" -> "Veselības skolas 7. interaktīvā
 * nodarbība"; "pavasara seminārā ārstiem" -> "Pavasara seminārs ārstiem"; "seminārā <NAME>" -> the name; "VESELĪBAS AKADĒMIJĀ Tukuma
 * Centrālajā Bibliotēkā" -> "Veselības akadēmija" (place dropped); "<X> ciklā MUGURAS SĀPES" -> "<X> cikls: Muguras sāpes".
 * Null when it names nothing ("izglītojošā seminārā").
 */
function courseFromWords(rawSlice: string, by: string): CourseHit | null {
  // "organizētajā seminārā „<name>”": the quoted name is the name
  const quoted = /[„“"«]([^„“”"«»]{4,120})[”“"»]/u.exec(rawSlice);
  if (quoted) return { value: sentenceCase(collapse(unglue(quoted[1]))), confidence: 0.9 };

  const tokens = unglue(rawSlice).split(/\s+/).map(keepToken).filter((w): w is string => !!w && sameName(w, by) === false);
  if (!tokens.length) return null;
  const f = tokens.map((w) => fold(w));
  // "seminārā <NAME IN CAPITALS>": the name follows the word for what it is
  if (EVENTS[f[0]] && tokens.length > 1 && inCaps(tokens.slice(1).join(" "))) return { value: sentenceCase(repairFirstWord(tokens.slice(1).join(" "))), confidence: 0.85 };
  let at = -1;
  for (let i = f.length - 1; i >= 0; i--) {
    if (EVENTS[f[i]]) {
      at = i;
      break;
    }
  }
  if (at < 0) return tokens.length >= 2 ? { value: sentenceCase(repairFirstWord(tokens.join(" "))), confidence: 0.7 } : null;

  const event = EVENTS[f[at]];
  const head = tokens.slice(0, at);
  // the adjective agrees with the noun: "interaktīvajā" -> "interaktīvā", "ikgadējā" stays, "izglītojošā seminārā" -> "izglītojošs"
  const agree = (w: string) =>
    w.replace(/aj[āa]$/iu, (m) => {
      const up = m === m.toLocaleUpperCase("lv");
      const out = event.masculine ? "ais" : "ā";
      return up ? out.toLocaleUpperCase("lv") : out;
    });
  const named = head.map((w, i) => (i === head.length - 1 ? agree(w) : w));
  const nameWords = head.filter((w) => !GENERIC_WORD.test(fold(w)) && !/^\d/.test(w));

  // what follows: words in small letters stay ("ārstiem"), capitals are the subtitle, a capitalised word starts a place
  const rest = tokens.slice(at + 1);
  const small: string[] = [];
  let i = 0;
  while (i < rest.length && !/^\p{Lu}/u.test(rest[i])) small.push(rest[i++]);
  const caps: string[] = [];
  while (i < rest.length && inCaps(rest[i])) caps.push(rest[i++]);
  if (!nameWords.length && !small.length && !caps.length) return null;

  const nounCase = inCaps(tokens[at]) ? event.noun.toLocaleUpperCase("lv") : event.noun;
  const main = [...named, nounCase, ...small].join(" ");
  // capitals and small letters in one name: each part in its own case
  const cased = sentenceCase(repairFirstWord(main.split(" ").map((w, n, all) => (inCaps(w) && all.some((o) => !inCaps(o)) ? wordCase(w) : w)).join(" ")));
  const value = caps.length ? `${cased}: ${sentenceCase(caps.join(" "))}` : cased;
  return { value, confidence: 0.85, own: event.noun };
}

/** "IRDS", "MRDS" for "SIRDS": a logo over the first letter of a heading in capitals. Only a word our course titles use. */
function repairFirstWord(name: string): string {
  const [first, ...rest] = name.split(" ");
  if (!first || !rest.length || !inCaps(first) || first.length < 3 || readsAsWord(first)) return name;
  const options = [...commonWordsEndingIn(first, 1), ...commonWordsEndingIn(first.slice(1), 2)];
  return options.length ? [options[0].toLocaleUpperCase("lv"), ...rest].join(" ") : name;
}

/** A line that is not text: logos, stamps, table borders */
function noiseLine(line: string): boolean {
  if (SYMBOLS.test(line)) return true;
  const words = line.match(/\p{L}+/gu) ?? [];
  if (!words.length) return !/^[\s\-,.:]*$/.test(line) || line.includes("|");
  if (words.every((w) => SHORT_WORDS.has(lower(w)))) return false;
  const long = words.filter((w) => w.length >= 4);
  return !long.length;
}

/** One word nobody writes, at the end of a title or in a list ("izm", "eee"); in the middle a scanner's layer breaks real words apart */
const strayWord = (line: string) => /^\p{L}{1,4}[.,?]?$/u.test(line) && !SHORT_WORDS.has(lower(line.replace(/[.,?]$/, ""))) && !readsAsWord(line.replace(/[.,?]$/, ""));

/** Lines of a title up to the first line that is not text */
function titleLines(s: string): string {
  const lines = unglue(s).split("\n").map((l) => l.replace(/^[|\s~_•·*]+|[|\s~_•·*]+$/gu, "")).filter((l) => l && !noiseLine(l));
  while (lines.length && strayWord(lines[lines.length - 1])) lines.pop();
  return collapse(lines.join(" "));
}

const hasDateOrPoints = (flat: string) => /(?:19|20)\d{2}|\d{1,2}[.:]\d{2}|(?<![\p{L}])tip(?![\p{L}])|punkt/u.test(flat);

/** The course or seminar a read names, or null */
function courseOf(t: Text): CourseHit | null {
  const organised = ORGANISED.exec(t.flat);
  if (organised) {
    const [from, to] = organised.indices![2];
    // a sentence that runs on through the whole page is not this sentence
    const hit = /^\S*\s*(?:dr|prof)\./u.test(organised[2]) ? null : courseFromWords(t.raw.slice(from, to), t.raw.slice(...organised.indices![1]));
    if (hit) return hit;
  }
  const taking = TAKING_PART.exec(t.flat);
  if (taking && !/(?<![\p{L}])tip(?![\p{L}])|punkt/u.test(taking[1])) {
    const [from, to] = taking.indices![1];
    const value = titleLines(t.raw.slice(from, to));
    if (value.split(" ").length >= 2) return { value: sentenceCase(stripOcrNoise(value)), confidence: 0.9 };
  }
  const named = NAMED.exec(t.flat);
  if (named && !/^(?:un|noklaus|lektor)/u.test(named[1])) {
    const [from, to] = named.indices![1];
    const slice = t.raw.slice(from, to);
    // „<name>”; OCR may have turned a quote into another one, or lost the closing one at a line end
    const open = /^[^\p{L}]*?["“„«]/u.exec(slice);
    if (open) {
      const inner = slice.slice(open[0].length).split(/["“”„«»]/u)[0];
      const value = titleLines(inner);
      if (value.split(" ").length >= 2) return { value: sentenceCase(value), confidence: 0.9 };
    } else if (!hasDateOrPoints(named[1])) {
      const value = titleLines(slice);
      // one clean line right after the sentence is as sure as a quoted name; a joined second line less so
      if (value && value.split(" ").length <= 14) return { value: sentenceCase(value), confidence: slice.trim().includes("\n") ? 0.75 : 0.9 };
    }
  }
  return null;
}

// ----- lectures -----

/** Where the list begins: "noklausījās lekcijas", "noklausījās sekojošas lekcijas:", "PROGRAMMA:", "piedalījies/-usies lekcijās" */
const LIST_START = /noklaus\p{L}*\s*(?:sekojos\p{L}*\s+)?lekcij\p{L}*\s*:?|^sekojos\p{L}*\s+lekcij|(?<![\p{L}])program\s?ma\s*:|^lekcijas$/u;
/** Where it ends: what is left of the certificate */
const LIST_END = /la[bv]\s+sertifik\S+\s+padome\s+ar|saskan\S*\s+ar|par\s+dalibu|pamatojoties|sedes\s+vaditaj|semin\S+\s+(?:organiz|atbalst)|(?:19|20)\d{2}\.?\s*gada\s+\d{1,2}\./u;
/** Longer than this, or more of them, and it is a page of something else (a programme, a read that lost its lines), not a certificate's list */
const MAX_LECTURE_CHARS = 220;
const MAX_LECTURES = 12;
const SPEAKER_START = /^(?:dr|prof|asoc|doc|docente|profesor\p{L}*)(?![\p{L}])\.?/u;
/** "Anna Parauga, Urologs": no degree in front */
const PERSON_ROLE = /^\p{L}\p{Ll}+\s+\p{Lu}\p{Ll}+,\s*\p{L}+$/u;
const TIP_VALUE = /(\d{1,2}[.,;]\d{1,2}|\d{1,2})\s*tip(?![\p{L}])/u;
const ORG_LINE = /universit|slimnic|klinik|centrs|biedrib|asociacij/u;
const AFFILIATION_START = /^\p{Ll}/u;

/** Bullets, borders and what a stamp leaves ("Parauga lekcija 60 |", "Parauga lekcija £0", "Parauga lekcija fo", "Parauga lekcija A") around a line; a quote mark stays, it opens a lecture */
function stripLine(l: string): string {
  const s = l.replace(/^[^\p{L}\p{N}("“„«'’]+/u, "").replace(/[\s|=»~_]+$/gu, "").replace(/(?<=\p{L})\s+\S*[°=<>@#{}[\]\\^£$%&]\S*$/u, "").replace(/(?<=\p{L})\s+\d{1,2}$/u, "");
  // a lone capital is a stamp's too, unless it names something ("vitamīna D", "hepatīts B")
  const noStamp = s.replace(/(\p{L}+)\s+\p{Lu}$/u, (m, before: string) => (/vitamin|hepatit|grup|tip/u.test(fold(before)) ? m : before));
  return noStamp.replace(/\s+(\p{Ll}{1,2})$/u, (m, w: string) => (SHORT_WORDS.has(w) ? m : "")).trim();
}

/** A speaker glued onto the end of a lecture ("...lekcija''Asoc. Prof.", "lekcija.Doc. Parauga") is read on its own line */
const splitGlued = (s: string) =>
  s.replace(/(["”“’']|\p{L}\.)\s*(?=(?:Dr|DR|Doc|Asoc|Prof)\.)/gu, "$1\n");

const isSpeaker = (l: string) => SPEAKER_START.test(fold(l)) || PERSON_ROLE.test(l);

/** A lecture name out of its lines; a read's quote marks and bullets gone */
function lectureName(lines: string[]): string {
  const joined = collapse(lines.join(" ")).replace(/''|’’|‘‘/g, " ").replace(/["“”„«»]/gu, " ").replace(/(\p{L}{3})\.(\p{L}{3})/gu, "$1 $2");
  // a bullet read as a letter in front of capitals ("e PARAUGA LEKCIJA")
  const unbulleted = /^\p{Ll}\s+\p{Lu}/u.test(joined) ? joined.slice(2) : joined;
  const clean = collapse(unbulleted).replace(/\s*[^\p{L}\p{N}?!.)\s]+\s*$/u, "");
  return sentenceCase(clean.replace(/[.]$/, ""));
}

/** The lectures listed in one read */
function lecturesOf(t: Text, seminarTitleEnd: number): LectureRead[] {
  const lines = splitGlued(t.raw).split("\n").map((l) => l.trim());
  // the list starts at its last heading: "PROGRAMMA:" after a meeting's sentence, "lekcijas" after "piedalījās"
  let start = -1;
  let offset = 0;
  const after: number[] = [];
  lines.forEach((l, i) => {
    if (LIST_START.test(fold(l))) start = start < 0 ? i : start;
    after[i] = offset;
    offset += l.length + 1;
  });
  // no heading, but a seminar's name in quotes and the lectures in capitals under it ("PIEDALĪJĀS SEMINĀRĀ «X»")
  if (start < 0 && seminarTitleEnd >= 0) start = after.findIndex((o) => o >= seminarTitleEnd) - 1;
  if (start < 0) return [];

  const body = lines.slice(start + 1).map(stripLine).filter(Boolean);
  const out: LectureRead[] = [];
  let pending: string[] = [];
  let afterSpeaker = false;
  const close = () => {
    if (pending.length) {
      const name = lectureName(pending);
      if (name.length >= 4 && name.length <= MAX_LECTURE_CHARS) out.push({ name, tip: null, approvalId: null });
      pending = [];
    }
  };
  const firstText = body.find((l) => !noiseLine(l) && !isSpeaker(l));
  const capsList = !!firstText && inCaps(firstText) && firstText.split(/\s+/).length >= 2;
  // lectures with their own points and numbers: everything between a speaker and the next number belongs to the speaker.
  // Several lines of points and numbers in a row, under the whole list, are not that
  const isTipLine = (l: string) => TIP_VALUE.test(fold(l)) || !!canonicalApproval(l) || /sertifik\S+\s+padomes\s+lemum/u.test(fold(l));
  const textLines = body.filter((l) => isTipLine(l) || !noiseLine(l));
  const perLecture = textLines.filter((l, i) => isTipLine(l) && !isTipLine(textLines[i - 1] ?? "")).length >= 2;

  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const f = fold(line);
    if (LIST_END.test(f)) break;
    const id = canonicalApproval(line);
    const value = TIP_VALUE.exec(f);
    if (id || value) {
      close();
      const last = out[out.length - 1];
      if (last) {
        if (id && !last.approvalId) last.approvalId = id;
        if (value && last.tip == null) last.tip = Number(value[1].replace(/[,;]/, "."));
      }
      if (id) afterSpeaker = false;
      continue;
    }
    if (/sertifik\S+\s+padomes\s+lemum/u.test(f)) continue;
    if (noiseLine(line)) continue;
    // a stamp reads as a few words in capitals ("DREHER HWE", "SAIN"); this list's lectures are not in capitals
    if (!capsList && inCaps(line) && line.split(/\s+/).length <= 3 && !/[?.]$/.test(line)) continue;
    if (isSpeaker(line)) {
      // a lecture that starts with "Dr.": the speaker is the next line
      const next = body.slice(i + 1).find((l) => !noiseLine(l));
      if (!pending.length && !afterSpeaker && !out.length && next && isSpeaker(next) && line.split(/\s+/).length >= 4) {
        pending.push(line);
        continue;
      }
      close();
      afterSpeaker = true;
      continue;
    }
    if (afterSpeaker) {
      if (capsList) {
        // a caps list's speaker can run on in capitals ("... KLĪNISKĀS" / "UNIVERSITĀTES SLIMNĪCAS KLĪNIKA")
        if (!inCaps(line) || ORG_LINE.test(f)) continue;
      } else if (perLecture || AFFILIATION_START.test(line)) {
        continue;
      }
      afterSpeaker = false;
    } else if (capsList && !inCaps(line)) {
      continue;
    }
    pending.push(line);
  }
  // left over after the last speaker: stamps and logos, unless nothing was read
  if (!out.length) close();
  return out.length <= MAX_LECTURES ? out : [];
}

/** How much of a text reads as Latvian words, with a little credit for keeping its letters */
function readScore(s: string): number {
  const words = s.match(/\p{L}{3,}/gu) ?? [];
  const known = words.filter((w) => readsAsWord(w)).length;
  const letters = s.match(/[āčēģīķļņšūž]/giu)?.length ?? 0;
  return known * 10 - (words.length - known) * 5 + Math.min(letters, 9);
}

/**
 * The course and lecture list of a certificate, from each of its reads (a scanner's text layer, our OCR).
 * `value` empty means the certificate names no course and the first lecture is not to be used either: the old rules decide.
 */
export function readCourse(reads: Text[]): { hit: CourseHit | null; lectures: LectureRead[] } {
  let hit: CourseHit | null = null;
  let hitScore = -Infinity;
  let lectures: LectureRead[] = [];
  let unnamed = false;
  for (const t of reads) {
    const c = courseOf(t);
    const score = c ? readScore(c.value) : -Infinity;
    if (c && score > hitScore) {
      hit = c;
      hitScore = score;
    }
    if (UNNAMED_SEMINAR.test(t.flat)) unnamed = true;
    const quoteEnd = (() => {
      const m = /piedalij\S*\s+seminara\s*:?\s*\S?/u.exec(t.flat);
      if (!m) return -1;
      const rest = t.raw.slice(m.index + m[0].length);
      const close = rest.search(QUOTE);
      return close < 0 ? -1 : m.index + m[0].length + close;
    })();
    // a list is read by its lines, and a scanner's layer has lost them: the last read with a list wins, which is the OCR
    const list = lecturesOf(t, quoteEnd);
    if (list.length) lectures = list;
  }
  if (!hit && unnamed && lectures.length) return { hit: { value: lectures[0].name, confidence: 0.8 }, lectures };
  return { hit, lectures };
}
