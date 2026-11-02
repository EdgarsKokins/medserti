import type { Course } from "../types";
import { cityOf, decodeEntities, dmy, fetchText, lvLongDate, sentenceCase, sleep, textOf, tipIn } from "../util";
import { todayLv } from "../../format";

/**
 * Latvijas Zobārstu asociācija (lza-zobi.lv), "Kursi": conferences and courses for dentists (Kārlis Stirāns #14,
 * November 2026). The page is a news list that mixes courses with other news, and writes dates three ways
 * ("04.12.2026.", "2026. gada 21. novembris", "5. decembrī" with no year). An item counts when it has a date from
 * today on and either names TIP or reads as a course or conference. Contact details are not kept.
 */
const ORIGIN = "https://www.lza-zobi.lv";
export const LZA_LIST = `${ORIGIN}/lv/kursi`;
const MAX_DETAILS = 8;
const LZA = "Latvijas Zobārstu asociācija";

const MONTHS = ["janvār", "februār", "mart", "aprīl", "maij", "jūnij", "jūlij", "august", "septembr", "oktobr", "novembr", "decembr"];
const EVENT_WORD = /konferenc|kurs|seminār|forum|lekcij|meistarklas|simpozij|kongres|apmācīb|vebinār|webinār|darbnīc/iu;

/**
 * The first date in the text, whichever way it is written; a day and month without a year take the year it was
 * posted, or the next one. "Reģistrācija no 10.11.2026." after "2026. gada 21. novembris" is not the event date.
 */
export function lzaDate(text: string, posted: string): string | null {
  const found: { at: number; iso: string }[] = [];
  const num = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (num && dmy(num[0])) found.push({ at: num.index, iso: dmy(num[0])! });
  const long = /(\d{4})\.\s*g(?:ada|\.)?\s*(\d{1,2})\.\s*\p{L}+/iu.exec(text);
  if (long && lvLongDate(long[0])) found.push({ at: long.index, iso: lvLongDate(long[0])! });
  const short = /(?<![\d.])(\d{1,2})\.\s*(janvār|februār|mart|aprīl|maij|jūnij|jūlij|august|septembr|oktobr|novembr|decembr)\p{L}*(?!\s*\d)/iu.exec(text);
  if (short && !(long && short.index > long.index && short.index < long.index + long[0].length)) {
    const mo = MONTHS.indexOf(short[2].toLowerCase()) + 1;
    let year = Number(posted.slice(0, 4));
    const iso = (y: number) => `${y}-${String(mo).padStart(2, "0")}-${short[1].padStart(2, "0")}`;
    if (iso(year) < posted) year += 1;
    found.push({ at: short.index, iso: iso(year) });
  }
  return found.sort((a, b) => a.at - b.at)[0]?.iso ?? null;
}

export interface LzaRow {
  date: string;
  title: string;
  url: string;
  /** the teaser under the title: date, venue, registration line */
  teaser: string;
}

export function parseLzaList(html: string, today = todayLv()): LzaRow[] {
  const out: LzaRow[] = [];
  for (const block of html.split(/<h2><a href="/).slice(1)) {
    const url = block.slice(0, block.indexOf('"'));
    const title = decodeEntities(/title="([^"]*)"/.exec(block)?.[1] ?? "").replace(/\s+/g, " ").trim();
    const posted = /Ievietots:\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(block);
    const teaser = textOf((/<div class="news-comment">([\s\S]*?)<\/div>/.exec(block)?.[1] ?? "").replace(/\n/g, "<br>").replace(/<br\s*\/?>/gi, "\n"), true);
    if (!url.startsWith(ORIGIN) || !title || !posted) continue;
    const day = `${posted[1]}-${posted[2]}-${posted[3]}`;
    const date = lzaDate(title, day) ?? lzaDate(teaser, day);
    if (!date || date < today) continue;
    out.push({ date, title, url, teaser });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface LzaPage {
  text: string;
  tip: number | null;
  time: string | null;
  price: string | null;
}

export function parseLzaPage(html: string): LzaPage {
  const text = textOf(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<\/(p|div|li|h\d|span)>|<br\s*\/?>/gi, "\n"), true);
  const start = text.search(/Ievietots/u);
  const stop = text.indexOf("« Atpakaļ", start);
  const body = start < 0 ? "" : text.slice(start, stop > start ? stop : undefined);
  const time = /plkst\.?\s*(\d{1,2})[.:](\d{2})/iu.exec(body) ?? /\b(\d{1,2}):(\d{2})\b/.exec(body);
  const fee = /(?:dalības\s+maksa|cena)\s*:?\s*([^\n]{1,80})/iu.exec(body)?.[1]?.trim() ?? null;
  return {
    text: body,
    // "8 TIP", or LZA's own "TIP 8 punkti"
    tip: tipIn(body) ?? (Number(/TIP\s*(\d{1,2})\s*punkt/iu.exec(body)?.[1]) || null),
    time: time ? `${time[1].padStart(2, "0")}:${time[2]}` : null,
    price: fee,
  };
}

/**
 * The venue from the teaser: a line naming a street, a hotel or a city, or "Attālināti". A long sentence
 * ("... norisināsies 12.novembrī plkst. 14:00 viesnīcā Radisson Hotel Daugava ... un tiešsaistē") gives its hotel.
 */
export function venueOf(teaser: string): string | null {
  for (const raw of teaser.split("\n")) {
    const line = raw.trim();
    if (!line || /reģistrāc/iu.test(line)) continue;
    const remote = /attālināt|tiešsaist|zoom|teams/iu.test(line);
    const hotel = /viesnīc\p{L}*\s+([^,."]+)/iu.exec(line)?.[1]?.trim();
    if (hotel) return remote ? `${hotel}, tiešsaistē` : hotel;
    if (/iela|prospekt|bulvār|radisson|hotel/iu.test(line) && line.length <= 90) return line;
    if (/\b(?:rīgā|rīga|daugavpil\p{L}*|liepāj\p{L}*|jelgav\p{L}*|valmier\p{L}*|ventspil\p{L}*)\b/iu.test(line) && line.length <= 90) return line;
    if (remote) return "Attālināti";
  }
  return null;
}

export function toLzaCourse(row: LzaRow, page: LzaPage | null): Course | null {
  // news with a future date (a law in force from ...) is not a course
  if (!(page?.tip || /\bTIP\b/u.test(page?.text ?? "") || EVENT_WORD.test(row.title))) return null;
  const place = venueOf(row.teaser) ?? venueOf(page?.text.split("\n").slice(0, 6).join("\n") ?? "") ?? (/attālināt/iu.test(row.title) ? "Attālināti" : null);
  const { city, online } = place ? cityOf(place) : { city: null, online: false };
  const title = row.title
    .replace(/,\s*kas\s+(?:norisināsies|notiks)\b.*$/iu, "")
    .replace(/^\s*\d{1,2}\.\s*\p{L}+\s+/u, "") // "5. decembrī PACIENTU DATU ..." -> the course name
    .replace(/\s*\|?\s*\d{1,2}\.\d{1,2}\.\d{4}\.?\s*$/, "")
    .replace(/\s*\d{4}\.\s*gada\s+\d{1,2}\.\s*\p{L}+\.?\s*$/u, "")
    .replace(/\s+attālināti\.?$/iu, "")
    .trim();
  return {
    id: `lza:${row.url.replace(/\/+$/, "").split("/").pop()}:${row.date}`,
    kind: "event",
    source: "lza",
    title: sentenceCase(title || row.title),
    url: row.url,
    startDate: row.date,
    endDate: null,
    availableUntil: null,
    format: online && city && city !== "Online" ? "hybrid" : online ? "online_live" : "in_person",
    location: place,
    time: page?.time ?? null,
    city: city ?? (online ? "Online" : null),
    tip: page?.tip ?? null,
    minutes: null,
    audience: "Zobārsti",
    allSpecialties: false,
    organizer: /^\s*LZA\b/u.test(row.title) ? LZA : null,
    approvalId: null,
    annexItem: null,
    price: page?.price ?? null,
    free: false,
  };
}

export async function fetchLza(): Promise<Course[]> {
  const rows = parseLzaList(await fetchText(LZA_LIST));
  const out: Course[] = [];
  for (const [i, row] of rows.entries()) {
    let page: LzaPage | null = null;
    if (i < MAX_DETAILS) {
      await sleep(400); // be polite: one request at a time
      page = await fetchText(row.url, 10_000).then(parseLzaPage, () => null);
    }
    const c = toLzaCourse(row, page);
    if (c) out.push(c);
  }
  return out;
}
