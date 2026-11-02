import type { Course } from "../types";
import { cityOf, decodeEntities, fetchText, sleep } from "../util";
import { todayLv } from "../../format";

/**
 * kosmetologs.lv, "Semināri": seminars for cosmetologists with TIP approved by LĀPPOS (Kārlis Stirāns #14,
 * November 2026). The seminars page links each event; each event page carries a schema.org Event (name, start and
 * end, place, attendance mode) whose description names the LĀPPOS TIP and the price.
 */
const ORIGIN = "https://www.kosmetologs.lv";
export const KOSMETOLOGS_LIST = `${ORIGIN}/lv/seminars`;
const MAX_DETAILS = 15;
const ORGANIZER = "kosmetologs.lv";

/** Event page links on the seminars page; ones with a date from today on in the address first */
export function parseKosmetologsList(html: string, today = todayLv()): string[] {
  const links = [...new Set([...html.matchAll(/https:\/\/www\.kosmetologs\.lv\/lv\/blank-1\/[a-z0-9-]+/g)].map((m) => m[0]))];
  const dateOf = (u: string) => /-(\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}(?:-\d+)?$/.exec(u);
  return links
    .filter((u) => {
      const d = dateOf(u);
      return !d || `${d[1]}-${d[2]}-${d[3]}` >= today;
    })
    .sort((a, b) => Number(!dateOf(a)) - Number(!dateOf(b)));
}

interface LdEvent {
  "@type"?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  eventAttendanceMode?: string;
  location?: { name?: string; address?: string } | string;
}

/** "+ 8 LĀPPOS tālākizglītības punkti" or "TIP2025/652 TIP8"; never the approval number itself */
export function kosmetologsTip(description: string): number | null {
  const m =
    /(\d{1,2}(?:[.,]\d)?)\s*(?:LĀPPOS\s+)?tālākizglītības\s+punkt/iu.exec(description) ??
    /TIP\s?\d{4}\/\d+\s*TIP\s?(\d{1,2})\b/iu.exec(description);
  return m ? Number(m[1].replace(",", ".")) : null;
}

export function parseKosmetologsEvent(html: string, url: string, today = todayLv()): Course | null {
  let ev: LdEvent | null = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]) as LdEvent;
      if (j["@type"] === "Event") ev = j;
    } catch {
      // another block, or broken JSON: skip it
    }
  }
  if (!ev?.name || !ev.startDate) return null;
  const date = ev.startDate.slice(0, 10);
  if (date < today) return null;
  const end = ev.endDate?.slice(0, 10) ?? null;
  const description = decodeEntities(ev.description ?? "");
  const loc = typeof ev.location === "string" ? ev.location : [ev.location?.address ?? ev.location?.name].filter(Boolean).join(", ");
  const online = /OnlineEventAttendanceMode/.test(ev.eventAttendanceMode ?? "") || /online|tiešsaist/iu.test(ev.name) || /-online(?:-|$)/.test(url);
  const place = online ? null : loc || null;
  const { city } = place ? cityOf(place) : { city: null };
  const price = /(?:semināra\s+)?cena\s*:?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:eiro|eur|€)/iu.exec(description);
  const t = (iso?: string) => iso?.slice(11, 16) || null;
  return {
    id: `kosmetologs:${url.split("/").pop()}`,
    kind: "event",
    source: "kosmetologs",
    title: decodeEntities(ev.name).trim(),
    url,
    startDate: date,
    endDate: end && end !== date ? end : null,
    availableUntil: null,
    format: online ? "online_live" : "in_person",
    location: place,
    time: t(ev.startDate) ? `${t(ev.startDate)}${t(ev.endDate) && end === date ? `-${t(ev.endDate)}` : ""}` : null,
    city: online ? "Online" : city,
    tip: kosmetologsTip(description),
    minutes: null,
    audience: "Kosmetologi",
    allSpecialties: false,
    organizer: ORGANIZER,
    approvalId: /TIP\s?\d{4}\/\d+/iu.exec(description)?.[0]?.replace(/\s/g, "") ?? null,
    annexItem: null,
    price: price ? `${price[1]} EUR` : null,
    free: false,
  };
}

export async function fetchKosmetologs(): Promise<Course[]> {
  const urls = parseKosmetologsList(await fetchText(KOSMETOLOGS_LIST)).slice(0, MAX_DETAILS);
  const out: Course[] = [];
  for (const url of urls) {
    await sleep(400); // be polite: one request at a time
    const c = await fetchText(url, 15_000).then((html) => parseKosmetologsEvent(html, url), () => null);
    if (c) out.push(c);
  }
  return out;
}
