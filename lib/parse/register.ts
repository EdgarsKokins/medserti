import type { Lecture, ParseNote, RegistryEvent } from "../types";
import { fold } from "./text";
import { skeleton, skeletons } from "./lvDictionary";
import { readsAsWord } from "./spelling";
import { REGISTRY_CONFIDENCE } from "./tipMatch";
import { displayCase } from "./title";
import type { ApprovalRead } from "./approvals";
import type { ParseResult } from "./index";

/*
 * The certificate's approval numbers checked against the LĀB register. Pure: the rows come in from lib/tipRegistry.ts.
 * A row is used only when it agrees with the certificate: the certificate's date falls in the row's dates, and its TIP agrees
 * with what is printed, for one number or added up for several. A number that fails the check may be a misread one, and its
 * row says nothing about this certificate. People still confirm: nothing here raises a value past the auto-confirm line.
 * Names: what is printed stands when it was read cleanly (readCleanly below). The register has its own typos and wordings;
 * it fills in Latvian letters a scan lost, and its name is used only when the printed one is garbled or missing.
 */

export type RegisterRows = Map<string, RegistryEvent[]> | null;

export type RejectReason = "notFound" | "date" | "tip" | "noDate";

export interface RegisterCheck {
  accepted: RegistryEvent[];
  rejected: { id: string; reason: RejectReason }[];
}

/** Printed points are rounded to a tenth, the register's sometimes differently */
const TIP_TOLERANCE = 0.05;
/** A title read this close to the register's name (edits per letter) is that name, misread */
const SAME_TITLE = 0.25;
const SAME_LECTURE = 0.35;
/** Confidence of a title or organizer taken from a row that agreed. A person still confirms: below AUTO_CONFIRM_CONFIDENCE */
const FROM_REGISTER = 0.85;
/** A read this doubtful is worth less than even a vague name from the register */
const WEAK_TITLE = 0.5;

const close = (a: number, b: number) => Math.abs(a - b) <= TIP_TOLERANCE;
const lettersOf = (s: string) => fold(s).replace(/[^\p{L}\p{N}]+/gu, "");

/** Edits per letter between two names, ignoring case, Latvian letters and punctuation */
export function nameDistance(a: string, b: string): number {
  const x = lettersOf(a);
  const y = lettersOf(b);
  if (!x || !y) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[y.length] / Math.max(x.length, y.length);
}

/** The certificate's date in a row's dates: a range can run for two years ("13.12.2023-11.12.2025"), one number covering many runs */
export function dateInRow(row: Pick<RegistryEvent, "start" | "end" | "days">, date: string, endDate: string | null): boolean {
  if (row.days.includes(date)) return true;
  if (!row.start) return false;
  return date <= (row.end ?? row.start) && (endDate ?? date) >= row.start;
}

/** Rows that sum to the printed TIP: all of them, or the smallest set of those left out for a wrong number */
function agreeing(rows: { read: ApprovalRead; row: RegistryEvent }[], points: number) {
  const sum = (l: typeof rows) => l.reduce((a, r) => a + (r.row.tip ?? 0), 0);
  if (close(sum(rows), points)) return rows;
  let best: typeof rows | null = null;
  for (let mask = 1; mask < 1 << rows.length; mask++) {
    const pick = rows.filter((_, i) => mask & (1 << i));
    if (close(sum(pick), points) && (!best || pick.length > best.length)) best = pick;
  }
  return best;
}

/** Which rows agree with the certificate, and why the others do not */
export function checkRows(numbers: ApprovalRead[], rows: Map<string, RegistryEvent[]>, cert: { date: string | null; endDate: string | null; points: number | null }): RegisterCheck {
  const rejected: RegisterCheck["rejected"] = [];
  const dated: { read: ApprovalRead; row: RegistryEvent }[] = [];
  for (const read of numbers) {
    const found = (rows.get(read.id) ?? []).filter((r) => r.approvalId === read.id);
    if (!found.length) rejected.push({ id: read.id, reason: "notFound" });
    else if (!cert.date) rejected.push({ id: read.id, reason: "noDate" });
    else {
      const row = found.find((r) => dateInRow(r, cert.date!, cert.endDate));
      if (row) dated.push({ read, row });
      else rejected.push({ id: read.id, reason: "date" });
    }
  }
  if (cert.points == null) return { accepted: dated.filter((d) => d.row.tip != null).map((d) => d.row), rejected };
  // a lecture's own value was read and the other's lost: every number that printed a value agrees with its row, and the points read were one of those
  const lectureValues = dated.filter((d) => d.read.tip != null);
  const oneLecture = dated.length > 1 && lectureValues.length > 0 && lectureValues.length < dated.length
    && lectureValues.every((d) => d.row.tip != null && close(d.read.tip!, d.row.tip)) && lectureValues.some((d) => close(d.read.tip!, cert.points!));
  if (oneLecture && dated.every((d) => d.row.tip != null)) return { accepted: dated.map((d) => d.row), rejected };
  // added up for several; a lecture's own printed value keeps its row when another number on the page was misread
  const kept = agreeing(dated, cert.points) ?? dated.filter((d) => d.read.tip != null && d.row.tip != null && close(d.read.tip, d.row.tip));
  for (const d of dated) if (!kept.includes(d)) rejected.push({ id: d.read.id, reason: "tip" });
  return { accepted: kept.map((d) => d.row), rejected };
}

/** A row's name without what only the register needs: "... lekcija: <name>", "lekcija dr. X “<name>” lekcija norises datumā ..." */
export function lectureNameOfRow(title: string): string {
  const s = title.replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();
  const quoted = /[“”"„«]([^“”"„»]{4,})[“”"»]/u.exec(s);
  const name = quoted ? quoted[1] : s.replace(/^.*?lekcij\p{L}*\s*:\s*/iu, "");
  return name.replace(/[.\s]+$/u, "");
}

/** The organizer cell can hold a contact person: a bare name that the certificate nowhere mentions is not an organizer */
function organizerOfRow(name: string, doc: string): string | null {
  const v = name.trim();
  if (!v) return null;
  const onCertificate = v.split(/\s+/).some((w) => w.length >= 4 && fold(doc).includes(fold(w)));
  const personLike = /^\p{Lu}\p{Ll}+(?:[ -]\p{Lu}\p{Ll}+){1,2}$/u.test(v);
  return personLike && !onCertificate ? null : displayCase(v);
}

const sharesWord = (a: string, b: string) => {
  const words = new Set(fold(a).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));
  return fold(b).split(/[^\p{L}\p{N}]+/u).some((w) => words.has(w));
};

/** The register's name when it says more than the certificate; the certificate's when it names more ("X, Y un Z asociācija") */
function bestOrganizer(read: string, row: string | null): string {
  if (!row) return read;
  if (!read) return row;
  if (sharesWord(read, row) && read.split(/\s+/).length > row.split(/\s+/).length) return read;
  return row;
}

/** How often each word's skeleton occurs in the text read: a scan's text layer and OCR that read a word alike vouch for it */
function wordCounts(doc: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of doc.match(/\p{L}+/gu) ?? []) out.set(skeleton(w), (out.get(skeleton(w)) ?? 0) + 1);
  return out;
}

const bare = (raw: string) => raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
/** A word the dictionary lacks is taken for a real term from this long ("polineiropātija"), when nothing else is wrong with it */
const TERM_LETTERS = 8;
const ABBREVIATION = /^(?:dr|prof|med|doc|asoc)$/iu;
/** A word and "un", "ar" ... read as one ("bezmieguun") */
const GLUED = /^(\p{L}{3,}?)(un|ar|no|par|uz)$/iu;

/**
 * Was this word read cleanly? Yes when the dictionary or our course titles know it, misread letters or not; when it is an
 * abbreviation, a number, or a capitalised name inside the sentence; when the text layer and OCR both read it this way;
 * or when it is long and shaped like a term the dictionary lacks. Scraps ("ee", "apt", "s"), a capital inside a word
 * ("interakUvaja"), letters no Latvian word doubles ("apriipe") and a word glued to the next are not.
 */
function cleanWord(raw: string, first: boolean, counts: Map<string, number>): boolean {
  const w = bare(raw);
  if (!w) return true;
  if (/^\d+$/.test(w)) return w.length === 4 || /\d\.$/.test(raw);
  if (/\d/.test(w)) return /^\p{Lu}[\p{Lu}\d-]*$/u.test(w);
  if (/^\p{Lu}$/u.test(w) || /^\p{Lu}{2,6}$/u.test(w) || ABBREVIATION.test(w)) return true;
  if (/^\p{Lu}?\p{Ll}*-\p{L}+/u.test(w)) return w.split("-").every((part) => cleanWord(part, first, counts));
  const glued = GLUED.exec(w);
  if (readsAsWord(w)) return true;
  if (glued && readsAsWord(glued[1])) return false;
  if ((w.match(/\p{L}/gu) ?? []).length <= 3 || /\p{Ll}\p{Lu}/u.test(w) || /[^\p{L}'’()-]/u.test(w)) return false;
  if ((counts.get(skeleton(w)) ?? 0) >= 2) return true;
  if (/ii|uu|aa/iu.test(fold(w))) return false;
  if (!first && /^\p{Lu}\p{Ll}{3,}$/u.test(w)) return true;
  return w.length >= TERM_LETTERS;
}

/** Every word of a printed name read cleanly: then it is shown as printed, whatever the register calls it */
export function readCleanly(name: string, doc: string): boolean {
  const counts = wordCounts(doc);
  return name.trim().split(/\s+/).every((w, i) => cleanWord(w, i === 0, counts));
}

/** A word in the case of the printed one */
const inCaseOf = (printed: string, word: string) => {
  if (printed === printed.toLocaleUpperCase("lv") && printed.length > 1) return word.toLocaleUpperCase("lv");
  const low = word.toLocaleLowerCase("lv");
  return printed[0] !== printed[0].toLocaleLowerCase("lv") ? low[0].toLocaleUpperCase("lv") + low.slice(1) : low;
};
const latvianLetters = (w: string) => w.match(/[āčēģīķļņšūž]/giu)?.length ?? 0;

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/**
 * A printed name with the letters a scan lost, from the rows, word by word; it stays the printed name. A word takes the row's letters
 * when it is that word misread ("Paraugholina", "skaitjos"), never when it is another word, and a row's word the dictionary does not
 * know never replaces one ("Vai kafija" stays when the row says "Vai diēta", a row's typo stays out).
 */
function spelledFromRows(text: string, rows: RegistryEvent[]): string {
  const lists = rows.map((r) => r.title.match(/\p{L}+/gu) ?? []);
  const known = new Map<string, string>();
  for (const list of lists) for (const w of list) for (const k of skeletons(w)) known.set(k, w);
  const words = [...text.matchAll(/\p{L}+/gu)].map((m) => m[0]);
  let i = -1;
  return text.replace(/\p{L}+/gu, (w) => {
    i++;
    const hit = skeletons(w).map((k) => known.get(k)).find(Boolean);
    if (hit && hit.length === w.length) {
      if (latvianLetters(hit) < latvianLetters(w)) return w;
      // "ka" is a word and "kā" another: a short word only where a neighbour is the row's neighbour too
      if (w.length <= 3 && !lists.some((list) => list.some((x, n) => skeleton(x) === skeleton(w) && ((!!words[i + 1] && skeleton(list[n + 1] ?? "") === skeleton(words[i + 1])) || (!!words[i - 1] && skeleton(list[n - 1] ?? "") === skeleton(words[i - 1])))))) return w;
      const caps = w === w.toLocaleUpperCase("lv");
      return [...hit].map((c, n) => (caps || w[n] !== w[n].toLocaleLowerCase("lv") ? c.toLocaleUpperCase("lv") : c.toLocaleLowerCase("lv"))).join("");
    }
    // not a word as read, and a row has a real word within a slip of it; a capitalised word inside the name may be a surname
    if (w.length < 4 || readsAsWord(w) || (i > 0 && /^\p{Lu}\p{Ll}/u.test(w))) return w;
    const near = [...known.values()].find((x) => Math.abs(x.length - w.length) <= 1 && distance(skeleton(x), skeleton(w)) <= 2 && readsAsWord(x));
    return near ? inCaseOf(w, near) : w;
  });
}

/** The lectures: as the certificate prints them when read cleanly, else the register's name for them; points and numbers from the rows */
function lecturesFrom(read: Lecture[] | null | undefined, accepted: RegistryEvent[], title: string, doc: string): Lecture[] | null {
  const unused = new Set(accepted);
  const names = accepted.map((r) => lectureNameOfRow(r.title));
  // a name the register gives several numbers, or the course's own, says nothing about one lecture
  const vague = (name: string) => nameDistance(name, title) <= SAME_TITLE || names.filter((n) => n === name).length > 1 || /seminār|akadēmij/iu.test(name);
  const list = (read ?? []).map((l) => {
    const own = accepted.find((r) => r.approvalId === l.approvalId);
    // the row printed with this lecture, or a row that says the same whichever number the certificate printed it by
    let pick = own && nameDistance(l.name, lectureNameOfRow(own.title)) <= SAME_LECTURE ? own : undefined;
    if (!pick) pick = accepted.find((r, i) => unused.has(r) && nameDistance(l.name, names[i]) <= SAME_LECTURE);
    const row = pick ?? (own && unused.has(own) ? own : undefined);
    if (row) unused.delete(row);
    const garbled = !readCleanly(l.name, doc);
    const fromRow = garbled && (pick ?? (own && !vague(lectureNameOfRow(own.title)) ? own : undefined));
    return {
      name: fromRow ? lectureNameOfRow(fromRow.title) : spelledFromRows(l.name, accepted),
      tip: row?.tip ?? l.tip,
      approvalId: row?.approvalId ?? l.approvalId,
    };
  });
  // one number for the whole list: the number belongs to the course
  if (accepted.length === 1 && list.length > 1) return list.map((l) => ({ ...l, tip: null, approvalId: null }));
  // lectures the list did not show, when the register names them apart from each other and from the course
  const missing = [...unused].filter((r) => !vague(lectureNameOfRow(r.title)));
  if (!list.length && missing.length < 2) return read?.length ? list : null;
  return [...list, ...missing.map((r) => ({ name: lectureNameOfRow(r.title), tip: r.tip, approvalId: r.approvalId }))];
}

/**
 * The parse result with the register's word where it agrees. `rows` null means the register could not be asked:
 * what the parser read stands, and the upload goes on. The rows themselves are not kept, only what was taken from them.
 */
export function applyRegister(r: ParseResult, rows: RegisterRows): ParseResult & { check: RegisterCheck | null; registered: RegistryEvent[] } {
  const numbers = r.numbers ?? [];
  if (!rows || !numbers.length) return { ...r, check: null, registered: [] };
  const f = { ...r.fields, fieldConfidence: { ...r.fields.fieldConfidence } };
  const check = checkRows(numbers, rows, { date: f.date, endDate: f.endDate, points: f.points });
  const notes: ParseNote[] = r.notes ? JSON.parse(r.notes) : [];
  let pointsKind = r.pointsKind;

  // rows whose date fits but whose TIP does not: the certificate and the register disagree, a person should look
  const differs = check.rejected.filter((x) => x.reason === "tip");
  if (differs.length) {
    const listed = numbers.filter((n) => differs.some((d) => d.id === n.id)).flatMap((n) => rows.get(n.id) ?? []);
    const total = listed.reduce((a, e) => a + (e.tip ?? 0), 0);
    notes.push({ code: "tipRegisterDiffers", p: { id: differs.map((d) => d.id).join(", "), points: Math.round(total * 100) / 100 } });
    f.fieldConfidence.points = Math.min(f.fieldConfidence.points ?? 1, REGISTRY_CONFIDENCE);
  }
  const { accepted } = check;
  if (!accepted.length) return { ...r, fields: f, pointsKind, notes: notes.length ? JSON.stringify(notes) : null, check, registered: [] };

  const sum = Math.round(accepted.reduce((a, e) => a + (e.tip ?? 0), 0) * 100) / 100;
  if (f.points == null) {
    // none printed: the register's, for a person to check, as in ./tipMatch.ts
    f.points = sum;
    f.fieldConfidence.points = REGISTRY_CONFIDENCE;
    pointsKind = "registry";
    for (let i = notes.length - 1; i >= 0; i--) if (notes[i].code === "noPoints") notes.splice(i, 1);
    notes.unshift({ code: "tipRegistry", p: { id: accepted.map((e) => e.approvalId).join(", "), points: sum } });
  } else if (!close(sum, f.points) && !differs.length) {
    // one lecture's points were read, the numbers say there were more: the sum, as for any summed certificate, a person checks it
    const list = accepted.map((e) => String(e.tip)).join(" + ");
    f.points = sum;
    f.fieldConfidence.points = Math.min(f.fieldConfidence.points ?? 1, 0.8);
    pointsKind = "summed";
    notes.push({ code: "pointsSummed", p: { list, total: String(sum) } });
  } else if (!differs.length) {
    notes.push({ code: "registerChecked", p: { id: accepted.map((e) => e.approvalId).join(", ") } });
  }

  // the title as printed when read cleanly; the register's words when they say the same as a garbled read, or nothing was read; never a vaguer name in its place
  const read = r.titleRead ?? { value: f.title, confidence: f.fieldConfidence.title ?? 0 };
  const same = accepted.map((e) => lectureNameOfRow(e.title)).find((name) => nameDistance(read.value, name) <= SAME_TITLE);
  if (same) {
    f.title = (readCleanly(read.value, r.text ?? "") ? spelledFromRows(read.value, accepted) : same).slice(0, 300);
    f.fieldConfidence.title = Math.max(FROM_REGISTER, Math.min(read.confidence, f.fieldConfidence.title ?? 0));
  } else if (!read.value || read.confidence < WEAK_TITLE) {
    f.title = lectureNameOfRow(accepted[0].title).slice(0, 300);
    f.fieldConfidence.title = REGISTRY_CONFIDENCE;
    for (let i = notes.length - 1; i >= 0; i--) if (notes[i].code === "noTitle") notes.splice(i, 1);
  } else {
    f.title = spelledFromRows(f.title, accepted);
  }

  // an organizer the register names too is no longer in doubt; a certificate already sure of it stays as sure
  const fromRow = organizerOfRow(accepted[0].organizer, r.text ?? "");
  if (fromRow) {
    f.organizer = bestOrganizer(f.organizer, fromRow).slice(0, 200);
    f.fieldConfidence.organizer = Math.max(FROM_REGISTER, f.fieldConfidence.organizer ?? 0);
  }
  for (let i = notes.length - 1; i >= 0; i--) {
    if (notes[i].code !== "lowConfidence") continue;
    const left = String(notes[i].p?.fields ?? "").split(",").filter((x) => x && !(fromRow && x === "organizer") && !(same && x === "title"));
    if (left.length) notes[i] = { code: "lowConfidence", p: { fields: left.join(",") } };
    else notes.splice(i, 1);
  }

  f.approvalId = accepted[0].approvalId;
  f.approvalIds = accepted.length > 1 ? accepted.map((e) => e.approvalId) : null;
  f.lectures = lecturesFrom(f.lectures, accepted, f.title, r.text ?? "");
  return { ...r, fields: f, pointsKind, notes: notes.length ? JSON.stringify(notes) : null, check, registered: accepted };
}
