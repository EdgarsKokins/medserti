import type { Course } from "../types";
import { cityOf, dmy, fetchText, textOf, tipIn, todayIso } from "../util";

/** LĀB's own course catalogue: price, date and a registration link. TIP is merged in from the approved TIP list. */
const ORIGIN = "https://is.arstubiedriba.lv";
const LIST = `${ORIGIN}/events/kursi/list`;

export function parseLabCourses(html: string, today = todayIso()): Course[] {
  const body = html.slice(html.indexOf("<tbody"), html.lastIndexOf("</tbody>"));
  const out: Course[] = [];
  for (const tr of body.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 5) continue;
    const price = textOf(cells[0]);
    const date = dmy(textOf(cells[1]));
    const title = textOf(cells[2]);
    if (!date || !title || date < today) continue;
    const apply = /href="([^"]*apply[^"]*)"/.exec(cells[4])?.[1] ?? /href="([^"]+)"/.exec(cells[3])?.[1];
    const eventId = /event_id=(\d+)/.exec(apply ?? "")?.[1] ?? title.slice(0, 30);
    const { city, online } = cityOf(title);
    const remote = online || /attālināti|vebinār|webinār|tiešsaist/i.test(title);
    out.push({
      id: `lab_courses:${eventId}`,
      kind: "event",
      source: "lab_courses",
      title,
      url: apply ? new URL(apply.replace(/&amp;/g, "&"), ORIGIN).toString() : LIST,
      startDate: date,
      endDate: null,
      availableUntil: null,
      format: remote ? "online_live" : "in_person",
      location: remote ? "Tiešsaistē" : null,
      city: city ?? (remote ? "Online" : "Rīga"),
      tip: tipIn(title),
      minutes: null,
      audience: "",
      allSpecialties: false,
      organizer: "Latvijas Ārstu biedrība",
      approvalId: null,
      annexItem: null,
      price: price || null,
      free: /bez\s+maksas|^eur\s*0+[,.]?0*$/i.test(price),
    });
  }
  return out;
}

export async function fetchLabCourses(): Promise<Course[]> {
  return parseLabCourses(await fetchText(LIST));
}
