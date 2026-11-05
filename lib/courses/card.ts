import { formatDate, formatNumber, round1, todayLv } from "@/lib/format";
import type { Dict } from "@/lib/i18n/en";
import type { Locale } from "@/lib/locale";
import { SOURCE_URLS, type Course, type CourseExtra, type CourseSource } from "./types";

/**
 * The opened course on /courses: what goes where. The row above it already shows the title, TIP and price; the opened
 * part adds the when and where lines and the apply action, and everything else folds under one disclosure.
 */

type Strings = Dict["courses"];
/** undefined: details not loaded yet; null: the request failed */
type Extra = CourseExtra | null | undefined;
type CardRow = Pick<Course, "kind" | "source" | "startDate" | "endDate" | "availableUntil" | "format" | "city" | "tip" | "minutes" | "audience" | "allSpecialties" | "organizer">;

/** "Latvija" in the source data means the whole country, not a city */
const WHOLE_LATVIA = "Latvija";
export const cityLabel = (city: string, s: Strings) => (city === WHOLE_LATVIA ? s.wholeLatvia : city);

export const hoursOf = (minutes: number | null) => (minutes ? formatNumber(round1(minutes / 60), 1) : null);

/** Sources where the course link is itself the way to sign up. LUMPII's and LMA's own list pages are not: they only list. */
export function isDirectApply(source: CourseSource, url: string) {
  return (
    source === "lab_courses" || source === "kursiarstiem" || source === "medicinaskursi" || source === "evisit" || source === "lfa" || source === "lupsk" || source === "lza" || source === "kosmetologs" ||
    (source === "lumpii" && !url.endsWith("/kursi")) ||
    (source === "lma" && url !== SOURCE_URLS.lma)
  );
}

export type ApplyMode =
  | { kind: "direct"; url: string }
  | { kind: "email"; email: string; phone: string | null }
  | { kind: "phone"; phone: string }
  | { kind: "none"; url: string };

/** How to sign up. Details that failed to load still leave the source's own list as a way in. */
export function applyMode(r: Pick<Course, "source">, extra: CourseExtra | null): ApplyMode {
  const url = extra?.url ?? SOURCE_URLS[r.source];
  if (extra && isDirectApply(r.source, url)) return { kind: "direct", url };
  const c = extra?.contact;
  if (c?.email) return { kind: "email", email: c.email, phone: c.phone };
  if (c?.phone) return { kind: "phone", phone: c.phone };
  return { kind: "none", url };
}

/** An online course's format already says "Online", so it gets no separate place */
export function courseLocation(r: Pick<Course, "city" | "format">, extra: Extra, s: Strings) {
  const online = r.city === "Online" || r.format === "online_live" || r.format === "recorded";
  const place = online || !r.city ? null : cityLabel(r.city, s);
  const location = extra?.location ?? null;
  return { online, place, venue: location && location !== r.city ? location : null };
}

const dayOf = (iso: string) => String(Number(iso.slice(8, 10)));
const monthOf = (iso: string) => Number(iso.slice(5, 7)) - 1;

/** "16. novembrī", "16. - 20. novembrī", "30. novembrī - 2. decembrī" */
export function dateSpan(start: string, end: string | null, s: Strings) {
  const d = s.details;
  const first = d.dayMonth(dayOf(start), d.months[monthOf(start)]);
  if (!end || end === start) return first;
  if (monthOf(start) === monthOf(end) && start.slice(0, 4) === end.slice(0, 4)) return d.dayRange(dayOf(start), dayOf(end), d.months[monthOf(end)]);
  return `${first} - ${d.dayMonth(dayOf(end), d.months[monthOf(end)])}`;
}

export type CardLine = { main: string | null; sub: string[] };

export function whenLine(r: CardRow, extra: Extra, s: Strings, locale: Locale, today = todayLv()): CardLine {
  const d = s.details;
  const hours = hoursOf(r.minutes);
  const hoursText = hours ? s.hours(hours) : null;
  const clean = (parts: (string | null)[]) => parts.filter((p): p is string => !!p);
  const time = extra?.time ? d.atTime(extra.time) : null;
  if (r.startDate) {
    const single = !r.endDate || r.endDate === r.startDate;
    return {
      main: dateSpan(r.startDate, r.endDate, s),
      sub: clean([
        r.startDate.slice(0, 4) !== today.slice(0, 4) ? d.year(r.startDate.slice(0, 4)) : null,
        single ? d.weekdays[new Date(`${r.startDate}T12:00:00Z`).getUTCDay()] : null,
        time,
        hoursText,
      ]),
    };
  }
  const until = r.availableUntil ? formatDate(r.availableUntil, locale) : null;
  if (r.kind === "recorded") return { main: d.anytime, sub: clean([until ? `${s.availableUntil.toLocaleLowerCase(locale)} ${until}` : null, hoursText]) };
  if (r.kind === "ongoing") return { main: until ? `${s.approvedUntil} ${until}` : d.anytime, sub: clean([hoursText]) };
  return { main: null, sub: clean([time, hoursText]) };
}

export function whereLine(r: CardRow, extra: Extra, s: Strings): CardLine {
  const { online, place, venue } = courseLocation(r, extra, s);
  if (online) return { main: s.formats[r.format], sub: venue ? [venue] : [] };
  if (place) return { main: place, sub: venue ? [venue] : [] };
  return { main: venue, sub: [] };
}

/** The facts behind the disclosure, only those the source gives */
export function restFacts(r: CardRow, extra: Extra, s: Strings): [string, string][] {
  const d = s.details;
  const c = extra?.contact;
  const contact = extra && applyMode(r, extra).kind !== "direct" && c ? [c.name, c.email].filter(Boolean).join(" · ") : "";
  const rest: [string, string][] = [];
  if (r.organizer) rest.push([d.organizer, r.organizer]);
  if (r.audience || r.allSpecialties) rest.push([d.audience, r.audience || s.forAll]);
  rest.push([d.format, s.formats[r.format]]);
  if (r.kind === "ongoing" && r.tip != null) rest.push([d.tip, d.tipWhole(formatNumber(r.tip, 1))]);
  if (contact) rest.push([d.contact, contact]);
  if (extra?.approvalId) rest.push([r.source === "lma" ? d.approvalLma : d.approval, `${extra.approvalId}${extra.annexItem ? `, ${s.annex(extra.annexItem)}` : ""}`]);
  return rest;
}

/**
 * Everything the source does not give, in one line, so an empty value takes no space of its own but is still said:
 * testers read a silently missing fact as an error (Ineta Ūdra's test, November 2026). Price has its place in the row and
 * the place its own line. Null when nothing is missing; details still loading do not count as missing.
 */
export function missingLine(r: CardRow, extra: Extra, s: Strings, locale: Locale): string | null {
  const d = s.details;
  const lower = (label: string) => label.toLocaleLowerCase(locale);
  const { online, place, venue } = courseLocation(r, extra, s);
  const list = [
    r.kind === "event" && extra !== undefined && !extra?.time ? lower(d.time) : null,
    !online && place && extra !== undefined && !venue ? lower(d.address) : null,
    r.minutes ? null : lower(d.duration),
    r.tip == null ? d.tip : null,
    r.organizer ? null : lower(d.organizer),
    r.audience || r.allSpecialties ? null : lower(d.audience),
  ].filter(Boolean);
  return list.length ? `${d.notListed}: ${list.join(", ")}.` : null;
}
