import type { CmeCategory, ParseNote } from "../types";
import { eventDays } from "./dates";
import { lineAt, NA, NB, rx, toNum, type Text } from "./text";

/*
 * Points and hours. All patterns run on folded text, so "tālākizglītības" and an OCR'd "talakizglTtibas"
 * match the same way.
 */

// "1.3", "1,3", "21,5", "7.00", and OCR splitting a decimal over a line ("2.\n7") before a label
const NUM = "(\\d{1,3}(?:[.,]\\s?\\d{1,2})?)";
/** a number not glued to a digit before it ("2.7" must not yield "7") */
const NUM_START = "(?<![\\p{N}]|\\p{N}[.,]|\\p{N}[.,]\\s)(?<!category\\s|level\\s|kategorij\\p{L}{1,2}\\s)";

const POINT_LABEL =
  "(?:tip(?![\\p{L}])|talakizglitibas\\s+(?:kredit)?punkt\\p{L}*|(?:mediciniskas\\s+)?talakizglitibas\\s+kred\\p{L}tpunkt\\p{L}*|kred\\p{L}tpunkt\\p{L}*|further\\s+education\\s+points?|(?:continuing\\s+)?education\\s+points?|ects(?:\\s+(?:credits?|points?))?|ecmec\\p{L}*|(?:european\\s+)?cme(?:\\s+(?:points?|credits?|hours?))?|cpd\\s+(?:points?|credits?|hours?)|credits?|points?)";

/** "12 TIP", "1,3TIP", "24 European CME credits (ECMEC®s)", "9 further education points (405 minutes)" */
const POINTS_AFTER = rx(
  `${NUM_START}${NUM}\\s*(?:\\([^)\\n]{1,30}\\)\\s*)?(?:european\\s+|eiropas\\s+|lab\\s+)?${POINT_LABEL}`,
);
/** "Tālākizglītības punktu skaits 6", "TIP: 12", "Credits: 3" */
const POINTS_BEFORE = rx(
  `(?<![\\p{L}\\p{N}-])(?:tip|talakizglitibas\\s+punkt\\p{L}*(?:\\s+skaits)?|kred\\p{L}tpunkt\\p{L}*|ects|ecmec\\p{L}*|cme\\s+(?:points?|credits?)|credits?|punkt\\p{L}*\\s+skaits)(?:\\s*\\([^)\\n]{1,30}\\))?\\s*(?:[:=]|-\\s)?\\s*${NUM}(?![\\p{L}\\p{N}/-]|[.,]\\d)`,
);
/** OCR breaks words with stray dots ("1.3 medicTniska.s ta.la.kizglTtibas kredTtpunktu"): allow a few words in between */
const POINTS_LOOSE = rx(`${NUM_START}${NUM}\\s+(?:[^\\s\\d]\\S+\\s+){1,3}?(?:kred\\p{L}tpunkt\\p{L}*|talakizglitibas\\s+punkt\\p{L}*)`);
/** "CME Credits - Wednesday, 20 May 2026   7.00": credits per day, to be added up */
const PER_DAY = rx(`(?:cme|ecmec|credits?)[^\\n\\d]{0,40}?(\\d{1,2}\\.?\\s+\\p{L}{3,}\\.?\\s+(?:19|20)\\d{2})\\s+${NUM}(?![\\p{N}])`);
/** the accreditation of the whole event: "has been accredited ... with 24 European CME credits" */
const COURSE_TOTAL = /accredit|akredit|designat|maximum|max\.|up to|lidz \d|each medical specialist|should claim/;
/** a stated total for this certificate */
const TOTAL = /kopa|total|kopsumm|par dalibu .{0,40}(?:pieskirt|tiek)|pieskirti|apliecina/;
/** approval number of one lecture or event: TIP2023/5987, 2023/5988, Nr. 2020/437 */
const APPROVAL = /(?:tip\s?)?(?:19|20)\d{2}\/\d{2,5}/g;

interface Hit {
  value: number;
  index: number;
  length: number;
  /** the label was ECTS */
  ects: boolean;
  total: boolean;
  courseTotal: boolean;
  approval: string | null;
}

/**
 * How the points were found. Only "printed" (one TIP / CME / credit value written on the certificate)
 * can be auto-confirmed; ECTS is a 1:1 assumption, sums and course totals are our inference.
 */
export type PointsKind = "printed" | "ects" | "summed" | "courseTotal" | "multiple" | "derived";

export interface PointsResult {
  value: number | null;
  /** 0-1 */
  confidence: number;
  kind: PointsKind | null;
  notes: ParseNote[];
}

/** the approval number that belongs to a point value: the nearest one after it (before the next value), else before it */
function approvalFor(t: Text, hit: { index: number; length: number }, next: number, prev: number): string | null {
  const after = t.flat.slice(hit.index + hit.length, Math.min(next, hit.index + hit.length + 90));
  const a = [...after.matchAll(APPROVAL)][0];
  if (a) return a[0].replace(/^tip\s?/, "");
  const before = t.flat.slice(Math.max(prev, hit.index - 90), hit.index);
  const b = [...before.matchAll(APPROVAL)].pop();
  return b ? b[0].replace(/^tip\s?/, "") : null;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function findPoints(t: Text): PointsResult {
  // credits listed per day: add them up
  // keyed by day: a text layer and OCR of the same page list the same days twice
  const days = new Map<string, number>();
  for (const m of t.flat.matchAll(PER_DAY)) {
    const v = toNum(m[2]);
    if (v > 0 && v <= 24 && !days.has(m[1])) days.set(m[1], v);
  }
  const perDay = [...days.values()];
  if (perDay.length >= 2) {
    const sum = perDay.reduce((a, b) => a + b, 0);
    return { value: round(sum), confidence: 0.8, kind: "summed", notes: [{ code: "pointsSummed", p: { list: perDay.map(fmt).join(" + "), total: fmt(sum) } }] };
  }

  const raw: { value: number; index: number; length: number; ects: boolean }[] = [];
  const taken: [number, number][] = [];
  for (const re of [POINTS_AFTER, POINTS_BEFORE, POINTS_LOOSE]) {
    for (const m of t.flat.matchAll(re)) {
      const from = m.index;
      const to = from + m[0].length;
      if (taken.some(([a, b]) => from < b && to > a)) continue;
      const value = toNum(m[1]);
      if (!(value > 0 && value <= 300)) continue;
      taken.push([from, to]);
      raw.push({ value, index: from, length: to - from, ects: /ects/.test(m[0]) });
    }
  }
  if (!raw.length) return { value: null, confidence: 0, kind: null, notes: [] };
  raw.sort((a, b) => a.index - b.index);

  const hits: Hit[] = raw.map((h, i) => {
    const pre = t.flat.slice(Math.max(0, h.index - 160), h.index);
    const line = lineAt(t.fold, h.index);
    return {
      ...h,
      total: TOTAL.test(`${line} ${t.flat.slice(Math.max(0, h.index - 50), h.index)}`),
      courseTotal: COURSE_TOTAL.test(pre.slice(-110)) || COURSE_TOTAL.test(t.flat.slice(h.index, h.index + 120)),
      approval: approvalFor(t, h, raw[i + 1]?.index ?? Infinity, raw[i - 1] ? raw[i - 1].index + raw[i - 1].length : 0),
    };
  });

  // the course-wide accreditation is a ceiling, not what this doctor earned; use it only when nothing else is printed
  const own = hits.filter((h) => !h.courseTotal);
  if (!own.length) {
    const h = hits[0];
    return { value: h.value, confidence: 0.6, kind: "courseTotal", notes: [{ code: "courseTotal", p: { points: fmt(h.value) } }] };
  }

  // several lectures, each with its own value and approval number: the certificate covers all of them
  // (the same lecture can appear twice when a text layer and OCR are read together: count it once)
  const byApproval = new Map<string, Hit>();
  let consistent = own.every((h) => h.approval);
  for (const h of own) {
    const seen = h.approval ? byApproval.get(h.approval) : undefined;
    if (seen && seen.value !== h.value) consistent = false;
    else if (h.approval && !seen) byApproval.set(h.approval, h);
  }
  const totals = own.filter((h) => h.total);
  if (consistent && byApproval.size >= 2) {
    const items = [...byApproval.values()];
    const sum = items.reduce((a, h) => a + h.value, 0);
    return {
      value: round(sum),
      confidence: 0.8,
      kind: "summed",
      notes: [{ code: "pointsSummed", p: { list: items.map((h) => fmt(h.value)).join(" + "), total: fmt(sum) } }],
    };
  }

  const distinct = [...new Set(own.map((h) => h.value))];
  if (distinct.length === 1)
    return { value: distinct[0], confidence: own.length > 1 || own[0].total ? 0.95 : 0.9, kind: own.every((h) => h.ects) ? "ects" : "printed", notes: [] };
  if (totals.length) {
    const tv = [...new Set(totals.map((h) => h.value))];
    if (tv.length === 1) return { value: tv[0], confidence: 0.8, kind: "multiple", notes: [] };
  }
  return { value: own[0].value, confidence: 0.4, kind: "multiple", notes: [{ code: "multiplePoints", p: { list: distinct.map(fmt).join("; ") } }] };
}

const round = (n: number) => Math.round(n * 100) / 100;

// ----- hours -----

const HOURS_LABEL = "(?:akademisk\\p{L}*\\s+stund\\p{L}*|ak\\.\\s*st(?:und\\p{L}*)?\\.?|academic\\s+hours?|akademin\\p{L}*\\s+valand\\p{L}*)";
const HOURS_AFTER = rx(`${NB}${NUM}\\s*${HOURS_LABEL}`);
const HOURS_BEFORE = rx(`${HOURS_LABEL}\\s*(?:[:-]|skaits:?)?\\s*${NUM}${NA}`);
/** plain hours: "6 stundas", "6 hours", "6 h", "8 val." (lt), "8 ч." (ru), "duration: 6", "ilgums 6 st." */
const PLAIN_HOURS_LABEL = "(?:stund\\p{L}*|st\\.|hours?|hrs?\\.?|h|val\\.|valand\\p{L}*|ч\\.|час\\p{L}*|std\\.|stunden)";
const PLAIN_HOURS_AFTER = rx(`${NB}${NUM}\\s*${PLAIN_HOURS_LABEL}(?![\\p{L}\\p{N}])`);
const PLAIN_HOURS_BEFORE = rx(
  `(?:duration|length|ilgums|apjoms|kopejais\\s+apjoms|stundu\\s+skaits|number\\s+of\\s+hours|hours)\\s*(?:\\([^)\\n]{1,20}\\))?\\s*[:=-]?\\s*${NUM}${NA}`,
);
const PRACTICAL_LINE = /praktisk|hands-on|practical/u;
const HOURS_TOTAL = /kopa|total|kopsumm/;

function collectHours(t: Text, patterns: RegExp[], skipPractical: boolean) {
  const hits: { value: number; total: boolean; index: number }[] = [];
  for (const re of patterns) {
    for (const m of t.fold.matchAll(re)) {
      const value = toNum(m[1]);
      const line = lineAt(t.fold, m.index);
      if (skipPractical && PRACTICAL_LINE.test(line) && !HOURS_TOTAL.test(line)) continue;
      if (value > 0 && value <= 500) hits.push({ value, total: HOURS_TOTAL.test(line), index: m.index });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

/** Hours of the event. `academic` is false when the certificate only says "hours" without "academic". */
export function findHours(t: Text): { value: number; academic: boolean } | null {
  const academic = collectHours(t, [HOURS_AFTER, HOURS_BEFORE], false);
  if (academic.length) return { value: (academic.find((h) => h.total) ?? academic[0]).value, academic: true };
  const plain = collectHours(t, [PLAIN_HOURS_AFTER, PLAIN_HOURS_BEFORE], true);
  if (plain.length) return { value: (plain.find((h) => h.total) ?? plain[0]).value, academic: false };
  return null;
}

const PRACTICAL = [
  // "4 stundas praktiskās nodarbības", "4 ak. st. praktiskā daļa"
  rx(`${NB}${NUM}\\s*(?:ak\\.\\s*st\\.?|(?:akademisk\\p{L}*\\s+)?stund\\p{L}*)\\s+(?:\\p{L}+\\s+)?praktisk`, "iu"),
  // "praktiskās nodarbības: 4 stundas", "praktiskā daļa 4 ak. st."
  rx(`praktisk\\p{L}*(?:\\s+\\p{L}+){0,2}\\s*[:-]?\\s*${NUM}\\s*(?:ak\\.\\s*st|(?:akademisk\\p{L}*\\s+)?stund|h${NA}|hours?)`, "iu"),
  // "4 hours of hands-on / practical training"
  rx(`${NB}${NUM}\\s*(?:academic\\s+)?(?:hours?|h)${NA}\\s+(?:of\\s+)?(?:hands-on|practical)`, "iu"),
  // "practical training: 4 hours", "hands-on part 4 h"
  rx(`(?:practical|hands-on)(?:\\s+\\p{L}+){0,2}\\s*[:-]?\\s*${NUM}\\s*(?:hours?|h${NA})`, "iu"),
];

export function findPracticalHours(t: Text): number | null {
  for (const re of PRACTICAL) {
    const m = re.exec(t.fold);
    if (m) return toNum(m[1]);
  }
  return null;
}

/**
 * Points from hours when the certificate prints none (Annex 4, Regulation No. 391 as worded by No. 487, 18 Aug 2026):
 *  item 1, 2, 8 (events in Latvia): 1 TIP per academic hour, max 8 TIP per day
 *  item 3 (abroad): as set by the organizer; with no number printed we use 1 TIP per hour (footnote 1 baseline)
 *  item 4 and 4.1 (interdisciplinary conference of the certification body, a university or a clinical university hospital): 12 TIP each
 *  item 7, 9 (distance learning): 1 TIP per academic hour, no daily cap
 *  item 10 (practical training): 8 TIP per day
 */
export function derivePoints(
  category: CmeCategory,
  hours: { value: number; academic: boolean } | null,
  date: string | null,
  endDate: string | null,
): { points: number; notes: ParseNote[] } | null {
  const days = eventDays(date, endDate);
  const check: ParseNote = { code: "checkBeforeConfirming" };
  if (category === "practical_training" && days)
    return { points: days * 8, notes: [{ code: "derivedPractical", p: { days } }, check] };
  if (category === "interdisciplinary_conference") return { points: 12, notes: [{ code: "derivedInterdisciplinary" }, check] };
  if (!hours || hours.value <= 0) return null;

  const h = hours.value;
  const academic = hours.academic;
  const plain: ParseNote[] = academic ? [] : [{ code: "plainHours" }];
  if (category === "training_abroad") return { points: h, notes: [{ code: "derivedAbroad", p: { h, academic } }, ...plain, check] };
  if (category === "e_learning") return { points: h, notes: [{ code: "derivedElearning", p: { h, academic } }, ...plain, check] };

  const cap = days ? days * 8 : null;
  const points = cap != null ? Math.min(h, cap) : h;
  const capped = cap != null && h > cap;
  return { points, notes: [{ code: "derivedLatvia", p: capped ? { h, academic, days: days! } : { h, academic } }, ...plain, check] };
}
