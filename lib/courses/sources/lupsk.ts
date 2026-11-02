import type { Course } from "../types";
import { cityOf, decodeEntities, dmy, fetchText, sentenceCase, sleep, textOf, tipIn } from "../util";
import { todayLv } from "../../format";

/**
 * LU P. Stradiņa medicīnas koledža (psk.lu.lv): paid continuing-education courses for nurses, physician assistants,
 * radiographers, laboratory staff, podologists and others, with TIP approved by LMA or LĀPPOS (Kārlis Stirāns #14,
 * November 2026). The site's news feed tags them "Tālākizglītība" and puts the date in the title; each post gives
 * date and time, place, audience, TIP and fee under fixed labels. Lecturers and contact details are not kept.
 */
const ORIGIN = "https://psk.lu.lv";
export const LUPSK_FEED = `${ORIGIN}/blog-feed.xml`;
/** posts read per refresh, nearest first; one at a time */
const MAX_DETAILS = 10;
const LUPSK = "LU P. Stradiņa medicīnas koledža";

export interface PskRow {
  date: string;
  endDate: string | null;
  /** the feed title without its date and "(tiešsaistē)" */
  title: string;
  url: string;
  online: boolean;
}

/** "12.-13.11.2026." -> 2026-11-12 .. 2026-11-13; "14.11.2026." -> one day */
function titleDates(title: string): { start: string; end: string | null } | null {
  const range = /(\d{1,2})\.\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(title);
  if (range) {
    const start = dmy(`${range[1]}.${range[3]}.${range[4]}`);
    const end = dmy(`${range[2]}.${range[3]}.${range[4]}`);
    return start ? { start, end } : null;
  }
  const one = dmy(title);
  return one ? { start: one, end: null } : null;
}

export function parsePskFeed(xml: string, today = todayLv()): PskRow[] {
  const out: PskRow[] = [];
  for (const item of xml.split("<item>").slice(1)) {
    const cdata = (tag: string) => (new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(item)?.[1] ?? "").trim();
    const categories = [...item.matchAll(/<category><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)].map((m) => m[1].trim());
    if (!categories.includes("Tālākizglītība")) continue;
    const raw = decodeEntities(cdata("title"));
    const url = /<link>([^<]+)<\/link>/.exec(item)?.[1]?.trim();
    const when = titleDates(raw);
    if (!url || !when || (when.end ?? when.start) < today || /noslēgusies/iu.test(raw)) continue;
    const title = raw
      .replace(/\(tiešsaistē\)/iu, "")
      .replace(/,?\s*(?:\d{1,2}\.\s*[-–]\s*)?\d{1,2}\.\d{1,2}\.\d{4}\.?/, "")
      .replace(/\s+/g, " ")
      .trim();
    out.push({ date: when.start, endDate: when.end, title, url, online: /tiešsaist/iu.test(raw) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The value after a "Label:" line, on the same line or the next one */
const field = (lines: string[], label: RegExp) => {
  const i = lines.findIndex((l) => label.test(l));
  if (i < 0) return null;
  const same = lines[i].replace(label, "").replace(/^[\s:]+/, "").trim();
  return (same || lines[i + 1]?.trim() || "").slice(0, 200) || null;
};

export interface PskPost {
  /** the programme's name in quotes, when the feed title is generic ("Neformālās izglītības programma") */
  name: string | null;
  time: string | null;
  location: string | null;
  audience: string | null;
  tip: number | null;
  price: string | null;
  free: boolean;
}

export function parsePskPost(html: string): PskPost {
  const text = textOf(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<\/(p|div|li|h\d|span)>/gi, "\n"), true);
  // the post runs from "Lasīts 1 min" to the tags line; the menus around it are left out. Posts word their labels
  // differently ("Norises datums" / "Norises laiks", "Kursu apjoms" / "Tālākizglītības punkti"), so each has variants.
  const start = text.search(/Lasīts\s+\d+\s+min/iu);
  const stop = text.indexOf("Tagi:", start);
  const body = start < 0 ? "" : text.slice(start, stop > start ? stop : undefined);
  const lines = body.split("\n");
  const when = field(lines, /^\s*Norises\s+(?:datums|laiks)\s*:?/iu) ?? "";
  const range = /plkst\.?\s*(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})/iu.exec(when);
  const from = /plkst\.?\s*(\d{1,2})[.:](\d{2})/iu.exec(when);
  const fee = field(lines, /^\s*Dalības\s+maksa\s*:?/iu);
  const volume = field(lines, /^\s*(?:Kursu\s+apjoms|Tālākizglītības\s+punkti|Apmācību\s+apjoms)\s*:?/iu) ?? "";
  return {
    name: /[“"„]([^”"]{6,160})[”"]/.exec(lines.slice(0, 6).join(" "))?.[1]?.trim() ?? null,
    time: range
      ? `${range[1].padStart(2, "0")}:${range[2]}-${range[3].padStart(2, "0")}:${range[4]}`
      : from
        ? `${from[1].padStart(2, "0")}:${from[2]}`
        : null,
    location: field(lines, /^\s*(?:Norises\s+vieta|Kursu\s+norise)\s*:?/iu),
    audience: field(lines, /^\s*(?:Dalībnieki\s*\()?Mērķauditorija\)?\s*:?/iu),
    // TIP only where the post states them; "16 akadēmiskās stundas" is a course for social workers, not TIP
    tip: tipIn(volume),
    // "30 EUR (ar PVN), maksājums jāveic līdz 09.11.2026." -> the amount, not the payment deadline
    price: fee ? (/\d+(?:[.,]\d{1,2})?\s*(?:EUR|eiro|€)(?:\s*\(ar PVN\))?/iu.exec(fee)?.[0] ?? fee.slice(0, 60)) : null,
    free: !!fee && /bez\s+maksas/iu.test(fee),
  };
}


const GENERIC = /^(?:neformālās izglītības programma|tālākizglītības kursi profesionāļiem)$/iu;

export function toPskCourse(row: PskRow, post: PskPost | null): Course {
  const place = post?.location ?? null;
  const { city, online } = place ? cityOf(place) : { city: null, online: row.online };
  const slug = row.url.replace(/\/+$/, "").split("/").pop();
  return {
    id: `lupsk:${slug}:${row.date}`,
    kind: "event",
    source: "lupsk",
    title: GENERIC.test(row.title) && post?.name ? sentenceCase(post.name) : row.title,
    url: row.url,
    startDate: row.date,
    endDate: row.endDate,
    availableUntil: null,
    format: online && city && city !== "Online" ? "hybrid" : online || row.online ? "online_live" : "in_person",
    location: place,
    time: post?.time ?? null,
    city: city ?? (online || row.online ? "Online" : null),
    tip: post?.tip ?? null,
    minutes: null,
    audience: post?.audience ?? "",
    allSpecialties: false,
    organizer: LUPSK,
    approvalId: null,
    annexItem: null,
    price: post?.price ?? null,
    free: post?.free ?? false,
  };
}

export async function fetchLupsk(): Promise<Course[]> {
  const rows = parsePskFeed(await fetchText(LUPSK_FEED));
  const out: Course[] = [];
  for (const [i, row] of rows.entries()) {
    let post: PskPost | null = null;
    if (i < MAX_DETAILS) {
      await sleep(400); // be polite: one request at a time
      post = await fetchText(row.url, 15_000).then(parsePskPost, () => null);
    }
    // only courses that state TIP: the college also runs courses for social workers and teachers
    if (post?.tip) out.push(toPskCourse(row, post));
  }
  return out;
}
