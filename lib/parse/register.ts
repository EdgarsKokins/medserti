import type { Lecture, ParseNote, RegistryEvent } from "../types";
import { fold } from "./text";
import { skeletons } from "./lvDictionary";
import { REGISTRY_CONFIDENCE } from "./tipMatch";
import { displayCase } from "./title";
import type { ApprovalRead } from "./approvals";
import type { ParseResult } from "./index";

/*
 * The certificate's approval numbers checked against the LĀB register. Pure: the rows come in from lib/tipRegistry.ts.
 * A row is used only when it agrees with the certificate: the certificate's date falls in the row's dates, and its TIP agrees
 * with what is printed, for one number or added up for several. A number that fails the check may be a misread one, and its
 * row says nothing about this certificate. People still confirm: nothing here raises a value past the auto-confirm line.
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

/** Letters of the rows' words for the words of a text read: "Paraugholina" is the register's "Paraugholīna" */
function spelledFromRows(text: string, rows: RegistryEvent[]): string {
  const known = new Map<string, string>();
  for (const r of rows) for (const w of r.title.match(/\p{L}{4,}/gu) ?? []) for (const k of skeletons(w)) known.set(k, w);
  return text.replace(/\p{L}{4,}/gu, (w) => {
    const hit = skeletons(w).map((k) => known.get(k)).find(Boolean);
    if (!hit || hit.length !== w.length) return w;
    const caps = w === w.toLocaleUpperCase("lv");
    return [...hit].map((c, i) => (caps || w[i] !== w[i].toLocaleLowerCase("lv") ? c.toLocaleUpperCase("lv") : c.toLocaleLowerCase("lv"))).join("");
  });
}

/** The lectures: what the certificate lists, in the register's words when they say the same; a number each when its row says so */
function lecturesFrom(read: Lecture[] | null | undefined, accepted: RegistryEvent[], title: string): Lecture[] | null {
  const unused = new Set(accepted);
  const names = accepted.map((r) => lectureNameOfRow(r.title));
  const list = (read ?? []).map((l) => {
    const own = accepted.find((r) => r.approvalId === l.approvalId);
    // the row printed with this lecture, or a row that says the same whichever number the certificate printed it by
    let pick = own && nameDistance(l.name, lectureNameOfRow(own.title)) <= SAME_LECTURE ? own : undefined;
    if (!pick) pick = accepted.find((r, i) => unused.has(r) && nameDistance(l.name, names[i]) <= SAME_LECTURE);
    const row = pick ?? (own && unused.has(own) ? own : undefined);
    if (row) unused.delete(row);
    return {
      name: pick ? lectureNameOfRow(pick.title) : spelledFromRows(l.name, accepted),
      tip: row?.tip ?? l.tip,
      approvalId: row?.approvalId ?? l.approvalId,
    };
  });
  // one number for the whole list: the number belongs to the course
  if (accepted.length === 1 && list.length > 1) return list.map((l) => ({ ...l, tip: null, approvalId: null }));
  // lectures the list did not show, when the register names them apart from each other and from the course
  const vague = (name: string) => nameDistance(name, title) <= SAME_TITLE || accepted.filter((r) => lectureNameOfRow(r.title) === name).length > 1 || /seminār|akadēmij/iu.test(name);
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

  // the title: the register's words when they are what the certificate says or when nothing was read; never a vaguer name in its place
  const read = r.titleRead ?? { value: f.title, confidence: f.fieldConfidence.title ?? 0 };
  const same = accepted.map((e) => lectureNameOfRow(e.title)).find((name) => nameDistance(read.value, name) <= SAME_TITLE);
  if (same) {
    f.title = same.slice(0, 300);
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
  f.lectures = lecturesFrom(f.lectures, accepted, f.title);
  return { ...r, fields: f, pointsKind, notes: notes.length ? JSON.stringify(notes) : null, check, registered: accepted };
}
