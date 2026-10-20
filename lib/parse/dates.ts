import { around, NB, rx, type Text } from "./text";

/*
 * Event dates. Every date-looking span becomes a candidate; candidates are scored by their surroundings
 * (event words up, issue/validity words down) and the best one wins. Confidence drops when a different
 * date scores about as well, so the user is asked to check it.
 */

/** Folded month-name prefixes (lv, en, de, et, lt, ru) -> month. Longest prefix wins. */
const MONTHS: [string, number][] = ([
  // Latvian
  ["janvar", 1], ["februar", 2], ["mart", 3], ["april", 4], ["maij", 5], ["jun", 6], ["jul", 7], ["august", 8],
  ["septembr", 9], ["oktobr", 10], ["novembr", 11], ["decembr", 12],
  // English (+ a printed typo seen on a real certificate) and German
  ["jan", 1], ["feb", 2], ["mar", 3], ["apr", 4], ["may", 5], ["mai", 5], ["aug", 8], ["sep", 9], ["spet", 9],
  ["oct", 10], ["okt", 10], ["nov", 11], ["dec", 12], ["dez", 12], ["marz", 3],
  // Estonian
  ["jaanuar", 1], ["veebruar", 2], ["marts", 3], ["aprill", 4], ["juuni", 6], ["juuli", 7], ["detsemb", 12],
  // Lithuanian (genitive, as printed in dates)
  // short prefixes: OCR misreads the diacritics ("lapkrigio" for "lapkričio")
  ["saus", 1], ["vasar", 2], ["kov", 3], ["bala", 4], ["gegu", 5], ["birz", 6], ["liep", 7], ["rugp", 8],
  ["rugs", 9], ["spal", 10], ["lapkr", 11], ["gruo", 12],
  // Russian (folded: й -> и)
  ["январ", 1], ["феврал", 2], ["март", 3], ["апрел", 4], ["ма", 5], ["июн", 6], ["июл", 7], ["август", 8],
  ["сентябр", 9], ["октябр", 10], ["ноябр", 11], ["декабр", 12],
] as [string, number][]).sort((a, b) => b[0].length - a[0].length);

/** month number for a folded word, or null */
export function monthOf(word: string): number | null {
  const w = word.toLowerCase();
  if (w.length < 3) return null;
  return MONTHS.find(([p]) => w.startsWith(p))?.[1] ?? null;
}

const MONTH_WORD = "(\\p{L}{3,}\\.?)";
const D = "(\\d{1,2})";
const Y = "((?:19|20)\\d{2})";
const ORD = "(?:st|nd|rd|th|\\.)?";
const DASH = "\\s*(?:-|–|—|un|and|bis|līdz|lidz|iki|по|до)\\s*";

const MIN_YEAR = 2000; // older dates on a CME certificate are birth dates or regulation dates
const MAX_YEAR = new Date().getUTCFullYear() + 2;

function iso(y: number, m: number | null, d: number): string | null {
  if (!m || m < 1 || m > 12 || d < 1 || d > 31 || y < MIN_YEAR || y > MAX_YEAR) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

interface Candidate {
  start: string;
  end: string | null;
  index: number;
  length: number;
  /** month written as a word: harder to misread than a bare number */
  worded: boolean;
}

type Reader = (m: RegExpMatchArray) => [string | null, string | null] | null;

const word = (s: string) => monthOf(s.replace(/\.$/, ""));

/** Patterns on flat text, most specific first; a later pattern cannot claim a span an earlier one took */
const PATTERNS: { re: RegExp; read: Reader; worded?: boolean }[] = [
  // 12.03.2025 - 14.03.2025, 05/06/2025-7/06/2025, 20/05/2026-22/05/2026
  {
    re: rx(`(?<![\\d.])${D}[./]${D}[./]${Y}\\.?${DASH}${D}[./]${D}[./]${Y}(?!\\d)`),
    read: (m) => [iso(+m[3], +m[2], +m[1]), iso(+m[6], +m[5], +m[4])],
  },
  // 2022-05-01 - 2024-05-01
  {
    re: rx(`(?<!\\d)${Y}-(\\d{2})-(\\d{2})${DASH}${Y}-(\\d{2})-(\\d{2})(?!\\d)`),
    read: (m) => [iso(+m[1], +m[2], +m[3]), iso(+m[4], +m[5], +m[6])],
  },
  // 17.10-18.10.2024
  {
    re: rx(`(?<![\\d.])${D}\\.${D}\\.?${DASH}${D}\\.${D}\\.${Y}(?!\\d)`),
    read: (m) => [iso(+m[5], +m[2], +m[1]), iso(+m[5], +m[4], +m[3])],
  },
  // 12.-13.03.2025, 12-13.03.2025
  {
    re: rx(`(?<![\\d.])${D}\\.?${DASH}${D}[./]${D}[./]${Y}(?!\\d)`),
    read: (m) => [iso(+m[4], +m[3], +m[1]), iso(+m[4], +m[3], +m[2])],
  },
  // 2025-03-12
  { re: rx(`(?<!\\d)${Y}-(\\d{2})-(\\d{2})(?!\\d)`), read: (m) => [iso(+m[1], +m[2], +m[3]), null] },
  // 12.03.2025, 12/03/2025 (day first)
  { re: rx(`(?<![\\d.,])${D}[./]${D}[./]${Y}(?!\\d)`), read: (m) => [iso(+m[3], +m[2], +m[1]), null] },
  // 2025. gada 12. martā, 2025. g. 12.-13. martā, 2022.GADA 24.NOVEMBRIS
  {
    re: rx(`${Y}\\.?\\s*(?:gada|g\\.)\\s*${D}\\.(?:${DASH}${D}\\.)?\\s*${MONTH_WORD}`),
    read: (m) => {
      const mo = word(m[4]);
      return [iso(+m[1], mo, +m[2]), m[3] ? iso(+m[1], mo, +m[3]) : null];
    },
    worded: true,
  },
  // Lithuanian: 2020 m. lapkričio 20 d., 2020 m. lapkričio 20-21 d.
  {
    re: rx(`${Y}\\s*m\\.\\s*${MONTH_WORD}\\s+${D}(?:${DASH}${D})?\\s*d\\.`),
    read: (m) => {
      const mo = word(m[2]);
      return [iso(+m[1], mo, +m[3]), m[4] ? iso(+m[1], mo, +m[4]) : null];
    },
    worded: true,
  },
  // Russian: с 16 июня по 19 июня 2026 года
  {
    re: rx(`${NB}${D}\\s+${MONTH_WORD}${DASH}${D}\\s+${MONTH_WORD},?\\s+${Y}`),
    read: (m) => {
      const [m1, m2] = [word(m[2]), word(m[4])];
      return m1 && m2 ? [iso(+m[5], m1, +m[1]), iso(+m[5], m2, +m[3])] : null;
    },
    worded: true,
  },
  // 12.-13. martā 2025, 12. marts, 2025, 12 March 2025, 12-13 March 2025, 12th of March 2025, 17. Oktober 2024
  {
    re: rx(`${NB}${D}${ORD}(?:${DASH}${D}${ORD})?\\s*(?:of\\s+)?${MONTH_WORD},?\\s+${Y}`),
    read: (m) => {
      const mo = word(m[3]);
      return [iso(+m[4], mo, +m[1]), m[2] ? iso(+m[4], mo, +m[2]) : null];
    },
    worded: true,
  },
  // March 12, 2025, March 12-13, 2025, June 5-6-7, 2025, September 25 - 26th, 2025
  {
    re: rx(`${NB}${MONTH_WORD}\\s+${D}${ORD}(?:${DASH}\\d{1,2}${ORD})*?(?:${DASH}${D}${ORD})?,?\\s+${Y}`),
    read: (m) => {
      const mo = word(m[1]);
      return [iso(+m[4], mo, +m[2]), m[3] ? iso(+m[4], mo, +m[3]) : null];
    },
    worded: true,
  },
];

/** words near the event date */
const EVENT = /noris|notika|notiks|datum|laiks|piedalij|piedalijas|apmekl|noklausij|dalyvav|participat|attend|held|took place|date|dates|vieta|venue|sede|sedi|seminar|konferenc|kongres|course|kurss|kursa|congress|conference|workshop|lekcij|lectur|находился|в период/;
/** words near an issue, signature, validity or birth date */
const NOT_EVENT = /izsniegt|izdot|issued|paraksts|signed|derig|valid|lidz \d|gimis|dzimis|birth|personas kods|reg\. ?nr|registr|lemum|dokumentu nr|apstiprin|approved/;

function candidates(t: Text): Candidate[] {
  const out: Candidate[] = [];
  const taken: [number, number][] = [];
  for (const { re, read, worded } of PATTERNS) {
    for (const m of t.flat.matchAll(re)) {
      const from = m.index;
      const to = from + m[0].length;
      if (taken.some(([a, b]) => from < b && to > a)) continue;
      const r = read(m);
      if (!r || !r[0]) continue;
      const [start, end] = r;
      taken.push([from, to]);
      out.push({ start, end: end && end > start ? end : null, index: from, length: to - from, worded: !!worded });
    }
  }
  return out;
}

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export interface DateResult {
  date: string | null;
  endDate: string | null;
  /** 0-1 */
  confidence: number;
}

export function findDates(t: Text): DateResult {
  const all = candidates(t);
  // a range longer than a year is how long an approval is valid, not an event
  const hits = all.filter((c) => !(c.end && days(c.start, c.end) > 62));
  if (!hits.length) return { date: null, endDate: null, confidence: 0 };

  const score = (c: Candidate) => {
    const { pre, post } = around(t, c.index, c.length, 70, 35);
    const near = `${pre} ${post}`;
    let s = 0;
    if (EVENT.test(near)) s += 3;
    if (NOT_EVENT.test(pre.slice(-45)) || /^\s*(?:,\s*)?\d{6}-?\d{5}/.test(post)) s -= 4; // "07.04.1978, 441200-40509": a birth date and personal code
    if (c.end) s += 1;
    if (c.worded) s += 0.5;
    // a certificate that names a city first ("Ventspilī, 2021. gada 3. septembrī") dates the event in its first lines
    if (c.index < t.flat.length * 0.15) s += 0.5;
    return s;
  };
  const scored = hits.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s || a.c.index - b.c.index);
  const best = scored[0];

  let confidence = best.c.worded ? 0.9 : 0.85;
  if (best.s < 0) confidence -= 0.35; // only issue-looking dates
  else if (best.s < 2) confidence -= 0.1; // no event word nearby
  // another date that scores close and starts on a different day: we might have picked the wrong one
  const rival = scored.find((x) => x !== best && x.c.start !== best.c.start && x.c.start !== best.c.end && best.s - x.s < 1);
  if (rival) confidence -= 0.3;
  return { date: best.c.start, endDate: best.c.end, confidence: Math.max(0.1, Math.round(confidence * 100) / 100) };
}

export function eventDays(start: string | null, end: string | null): number | null {
  if (!start) return null;
  if (!end) return 1;
  const d = days(start, end) + 1;
  return d >= 1 && d <= 366 ? d : null;
}
