import type { Course } from "../types";
import { cityOf, dmy, fetchText, sleep, textOf, tipIn } from "../util";
import { todayLv } from "../../format";

/**
 * Latvijas Fizioterapeitu asociācija (fizioterapeitiem.lv) "Semināru un pasākumu plāns": its own (LFA) events and
 * other organizers' events it posts for physiotherapists (Ralfs Gauja's test, November 2026). The list gives date,
 * time, title and a link; each event page adds place, fee and, sometimes, TIP in free text. Contact details on the
 * pages are not kept.
 */
const ORIGIN = "https://fizioterapeitiem.lv";
export const LFA_LIST = `${ORIGIN}/events`;
/** event pages read per refresh, nearest first; one at a time */
const MAX_DETAILS = 25;
const LFA = "Latvijas Fizioterapeitu asociācija";

export interface LfaRow {
  date: string;
  time: string | null;
  title: string;
  url: string;
  /** "LFA" for the association's own events, "Citi" or "Online" for the rest */
  category: string;
}

export function parseLfaList(html: string, today = todayLv()): LfaRow[] {
  const out: LfaRow[] = [];
  for (const row of html.split(/<div class="views-row">/).slice(1)) {
    const day = /<span class="date">\s*(\d{1,2})\.(\d{1,2})\s*<\/span>/.exec(row);
    const year = /<span class="year">\s*(\d{4})\s*<\/span>/.exec(row)?.[1];
    const link = /<span class="title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
    if (!day || !year || !link) continue;
    const date = dmy(`${day[1]}.${day[2]}.${year}`);
    const title = textOf(link[2]);
    if (!date || !title || date < today) continue;
    out.push({
      date,
      time: /<span class="time">\s*(\d{1,2}:\d{2})/.exec(row)?.[1] ?? null,
      title,
      url: new URL(link[1], ORIGIN).toString(),
      category: textOf(/<span class="category">([\s\S]*?)<\/span>/.exec(row)?.[1] ?? ""),
    });
  }
  return out;
}

/** "norises vieta: tiešsaistē zoom platformā" style label lines from the event text */
const after = (text: string, label: RegExp) => {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => label.test(l));
  if (i < 0) return null;
  // the value sits on the same line after the colon, or on the next line
  const same = lines[i].replace(label, "").replace(/^[\s:]+/, "").trim();
  return (same || lines[i + 1]?.trim() || "").slice(0, 140) || null;
};

export function parseLfaEvent(html: string): Pick<Course, "endDate" | "location" | "price" | "free" | "tip"> {
  const start = html.indexOf("field--name-field-date-range");
  // the event text ends where the site's contact footer starts
  const stop = html.indexOf("LFA Sertifikācijas Komisija", start);
  const body = start < 0 ? "" : html.slice(start, stop > start ? stop : undefined);
  const text = textOf(body.replace(/<\/(p|div|li|h\d|span)>/gi, "\n"), true);
  const days = [...text.slice(0, 200).matchAll(/\d{1,2}\.\d{1,2}\.\d{4}/g)].map((m) => dmy(m[0])).filter((d): d is string => !!d);
  const fee = after(text, /^.*(?:dalības\s+maksa|cena|maksa)\s*:/iu);
  const amounts = fee ? [...fee.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*(?:eur|€)/giu)].map((m) => Number(m[1].replace(",", "."))) : [];
  return {
    endDate: days.length > 1 && days[days.length - 1] !== days[0] ? days[days.length - 1] : null,
    location: after(text, /^.*(?:norises\s+vieta|vieta|norises\s+adrese)\s*:/iu),
    price: fee,
    free: !!fee && /bez\s+maksas/iu.test(fee) && amounts.length === 0,
    tip: tipIn(text),
  };
}

export function toLfaCourse(row: LfaRow, detail: ReturnType<typeof parseLfaEvent> | null): Course {
  const place = detail?.location ?? null;
  const { city, online } = place ? cityOf(place) : { city: null, online: row.category === "Online" };
  return {
    id: `lfa:${row.url.replace(/\/+$/, "").split("/").pop()}:${row.date}`,
    kind: "event",
    source: "lfa",
    title: row.title,
    url: row.url,
    startDate: row.date,
    endDate: detail?.endDate ?? null,
    availableUntil: null,
    // "Klātienē ... Rīga, Tiešsaistē - Evisit.lv": both
    format: online && city && city !== "Online" ? "hybrid" : online ? "online_live" : "in_person",
    location: place,
    time: row.time,
    city: city ?? (online ? "Online" : null),
    tip: detail?.tip ?? null,
    minutes: null,
    // posted by the physiotherapists' association for its members
    audience: "Fizioterapeiti",
    allSpecialties: false,
    organizer: row.category === "LFA" ? LFA : null,
    approvalId: null,
    annexItem: null,
    price: detail?.price ?? null,
    free: detail?.free ?? false,
  };
}

export async function fetchLfa(): Promise<Course[]> {
  const rows = parseLfaList(await fetchText(LFA_LIST));
  const out: Course[] = [];
  for (const [i, row] of rows.entries()) {
    let detail: ReturnType<typeof parseLfaEvent> | null = null;
    if (i < MAX_DETAILS) {
      await sleep(400); // be polite: one request at a time
      // a page that fails keeps the event with what the list says
      detail = await fetchText(row.url, 10_000).then(parseLfaEvent, () => null);
    }
    out.push(toLfaCourse(row, detail));
  }
  return out;
}
