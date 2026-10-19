import type { Course, CourseFormat } from "../types";
import { cityOf, dmy, fetchText, sleep, textOf, todayIso } from "../util";

/**
 * LĀB "Apstiprināto TIP saraksts": every event approved for TIP by the Latvian Medical Association.
 * Sorted by approval date (newest first), 50 rows per page. We page back until approvals are older than
 * LOOKBACK_DAYS and keep events that have not ended yet.
 * Contact persons' names, phones and emails are deliberately not stored.
 */
const BASE = "https://is.arstubiedriba.lv/tip_list_approved";
const LOOKBACK_DAYS = 400;
const MAX_PAGES = 40;

export function parseLabTipPage(html: string, today = todayIso()): { courses: Course[]; oldestDecision: string | null; rows: number } {
  const body = html.slice(html.indexOf("<tbody"), html.lastIndexOf("</tbody>"));
  const courses: Course[] = [];
  let oldestDecision: string | null = null;
  let rows = 0;

  for (const tr of body.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length !== 12) continue;
    rows++;
    const [, nr, decision, basis, name, audience, when, fmt, place, minutes, tip, org] = cells.map((c, i) =>
      i === 11 ? c : textOf(c),
    );
    const decisionIso = dmy(decision);
    if (decisionIso && (!oldestDecision || decisionIso < oldestDecision)) oldestDecision = decisionIso;

    const dates = [...when.matchAll(/\d{1,2}\.\d{1,2}\.\d{4}/g)].map((m) => dmy(m[0])).filter((d): d is string => !!d);
    if (!dates.length) continue;
    const start = dates[0];
    const end = dates[dates.length - 1];

    const recordedFmt = /tālmācīb/i.test(fmt);
    const liveFmt = /reāllaik/i.test(fmt);
    const { city, online } = cityOf(place);
    const format: CourseFormat =
      liveFmt && recordedFmt ? "hybrid" : recordedFmt ? "recorded" : online ? "online_live" : "in_person";

    // distance learning lists an availability period (often 2 years); a live event lists its days
    const spanDays = (Date.parse(end) - Date.parse(start)) / 86_400_000;
    // a long approval period on a live event = a programme repeated on request, not a one-off date
    const kind = format === "recorded" ? "recorded" : spanDays > 31 ? (format === "hybrid" ? "recorded" : "ongoing") : "event";
    const availableUntil = kind === "event" ? null : end;
    const lastDay = availableUntil ?? end;
    if (lastDay < today) continue;

    const ref = /data-type="(application|publication)"[^>]*data-id="(\d+)"/.exec(cells[0]);
    const organizer = textOf(/<strong>([\s\S]*?)<\/strong>/.exec(org)?.[1] ?? org.split(/<br\s*\/?>/)[0] ?? "");
    const annex = /(\d+)\.\s*p/.exec(basis);
    courses.push({
      id: `lab_tip:${nr}`,
      kind,
      source: "lab_tip",
      title: name,
      url: `${BASE}?type=all`,
      startDate: kind === "event" ? start : null,
      endDate: kind === "event" && end !== start ? end : null,
      availableUntil,
      format,
      location: place ? place.slice(0, 140) : null,
      city: city ?? (format === "recorded" ? "Online" : null),
      tip: tip ? Number(tip.replace(",", ".")) || null : null,
      minutes: minutes ? Number(minutes) || null : null,
      audience,
      allSpecialties: /visu\s+specialitāšu|visām\s+specialitātēm|visi\s+ārsti/i.test(audience),
      organizer: organizer || null,
      approvalId: nr || null,
      annexItem: annex ? Number(annex[1]) : null,
      price: null,
      free: false,
      detailRef: ref ? `${ref[1]}:${ref[2]}` : null,
    });
  }
  return { courses, oldestDecision, rows };
}

export async function fetchLabTip(): Promise<Course[]> {
  const today = todayIso();
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const out: Course[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchText(`${BASE}?type=all&page=${page}`);
    const { courses, oldestDecision, rows } = parseLabTipPage(html, today);
    out.push(...courses);
    if (!rows || (oldestDecision && oldestDecision < cutoff)) break;
    await sleep(400); // be polite: one request at a time
  }
  return out;
}
