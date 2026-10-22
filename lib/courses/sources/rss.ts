import type { Course, CourseSource } from "../types";
import { decodeEntities, dmy, fetchText, lvLongDate, sleep, textOf, tipIn, todayIso } from "../util";

/**
 * kursiarstiem.lv and medicinaskursi.lv are WordPress LMS sites whose REST APIs are broken,
 * but both publish a course RSS feed (?post_type=course, 10 items per page).
 */
interface FeedItem {
  title: string;
  link: string;
  description: string;
}

export function parseFeed(xml: string): FeedItem[] {
  return (xml.match(/<item>[\s\S]*?<\/item>/g) ?? []).map((it) => {
    const get = (tag: string) =>
      decodeEntities((new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(it)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "")).trim();
    return { title: textOf(get("title")), link: get("link"), description: textOf(get("description")) };
  });
}

async function fetchFeed(site: string, pages: number): Promise<FeedItem[]> {
  const items: FeedItem[] = [];
  for (let p = 1; p <= pages; p++) {
    let xml: string;
    try {
      xml = await fetchText(`https://${site}/feed/?post_type=course${p > 1 ? `&paged=${p}` : ""}`);
    } catch (e) {
      if (p > 1) break; // past the last page the feed returns 404
      throw e;
    }
    const page = parseFeed(xml);
    items.push(...page);
    if (page.length < 10) break;
    await sleep(300);
  }
  return items;
}

/** kursiarstiem.lv: LĀB's paid e-learning shop - conference recordings and pre-sales of upcoming conferences */
export function toKursiarstiem(items: FeedItem[], today = todayIso()): Course[] {
  const out: Course[] = [];
  for (const it of items) {
    const date = lvLongDate(it.title);
    const happened = /notikusi/i.test(it.title);
    const presale = /iepriekšpārdošan/i.test(it.title);
    const recording = /ieraksts|ieraksta/i.test(it.title + " " + it.description) || happened;
    // keep upcoming events and pre-sales; skip recordings of events more than ~2 years ago
    if (date && date < today && !recording) continue;
    if (date && happened && date < shiftYears(today, -2)) continue;
    const title = it.title.replace(/^IEPRIEKŠPĀRDOŠANĀ\s*/i, "").trim();
    out.push({
      id: `kursiarstiem:${slug(it.link)}`,
      kind: date && date >= today ? "event" : "recorded",
      source: "kursiarstiem",
      title,
      url: it.link,
      startDate: date && date >= today ? date : null,
      endDate: null,
      availableUntil: null,
      format: date && date >= today ? (presale ? "hybrid" : "online_live") : "recorded",
      location: "kursiarstiem.lv",
      city: "Online",
      tip: tipIn(it.title),
      minutes: null,
      audience: "",
      allSpecialties: /starpdisciplinār/i.test(it.title),
      organizer: "Latvijas Ārstu biedrība",
      approvalId: null,
      annexItem: null,
      price: null,
      free: false,
    });
  }
  return out;
}

/** medicinaskursi.lv: free recorded lectures, TIP in the title, "Lekcija būs pieejama līdz dd.mm.yyyy" */
export function toMedicinaskursi(items: FeedItem[], today = todayIso()): Course[] {
  const out: Course[] = [];
  for (const it of items) {
    const until = dmy(/pieejama\s+līdz\s+([\d.]+)/i.exec(it.description)?.[1] ?? "");
    if (until && until < today) continue;
    out.push({
      id: `medicinaskursi:${slug(it.link)}`,
      kind: "recorded",
      source: "medicinaskursi",
      title: it.title.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*TIP\s*\)\s*$/i, "").trim(),
      url: it.link,
      startDate: null,
      endDate: null,
      availableUntil: until,
      format: "recorded",
      location: "medicinaskursi.lv",
      city: "Online",
      tip: tipIn(it.title),
      minutes: null,
      audience: "",
      allSpecialties: false,
      organizer: "Latvijas Ārstu biedrība",
      approvalId: null,
      annexItem: 7,
      price: "Bez maksas",
      free: true,
    });
  }
  return out;
}

const slug = (link: string) => link.replace(/\/+$/, "").split("/").pop() ?? link;
function shiftYears(iso: string, years: number) {
  return `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;
}

/**
 * kursiarstiem.lv course page: the shop's buy button carries the price,
 * `<span class="amount">45.00&euro;</span> - Nopirkt šo kursu`. No button, no price: we show none rather than guess.
 */
export function parseKursiarstiemPrice(html: string): Pick<Course, "price" | "free"> {
  const m = /class="amount"[^>]*>\s*(?:<[^>]+>\s*)*([\d\s.,]+?)\s*(?:&euro;|€|EUR)/i.exec(html);
  const n = m ? Number(m[1].replace(/\s/g, "").replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return { price: null, free: false };
  if (n === 0) return { price: "Bez maksas", free: true };
  return { price: `EUR ${n.toFixed(2).replace(".", ",")}`, free: false };
}

/** The feed has no prices: read each course page, one at a time. A page that fails keeps the course without a price. */
async function withKursiarstiemPrices(courses: Course[]): Promise<Course[]> {
  for (const c of courses) {
    try {
      Object.assign(c, parseKursiarstiemPrice(await fetchText(c.url, 10_000)));
    } catch {
      // no price shown; the course stays listed
    }
    await sleep(250);
  }
  return courses;
}

export async function fetchRss(source: Extract<CourseSource, "kursiarstiem" | "medicinaskursi">): Promise<Course[]> {
  if (source === "kursiarstiem") return withKursiarstiemPrices(toKursiarstiem(await fetchFeed("kursiarstiem.lv", 3)));
  return toMedicinaskursi(await fetchFeed("medicinaskursi.lv", 5));
}
