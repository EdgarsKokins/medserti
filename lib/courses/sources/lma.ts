import type { Course, CourseFormat } from "../types";
import { cityOf, decodeEntities, fetchText, lvLongDate, textOf, tipIn, titleKey } from "../util";
import { todayLv } from "../../format";

/**
 * Latvijas Māsu asociācija (LMA) lists upcoming courses for nurses in one WordPress table: title (linked to a
 * poster or programme), organiser, then date, place, audience, LMA approval number and "EUR / TIP" in loosely
 * used columns. So each row is read as one block of text. The approval register on the same site has no
 * event dates and is only linked (LMA_REGISTER_URL). robots.txt allows everything.
 */
const LIST = "https://www.masuasociacija.lv/konferences-seminari-kursi/";

/** "LMa apstiprinājuma nr: IZV5/NTI/P056_0526/06052026", "LMa Nr. NTI/S -1055"; "LMa Nr.(sekos)" = not yet approved */
const APPROVAL = /LMa\s+(?:apstiprinājuma\s+)?nr\.?\s*:?\s*([A-Z0-9][A-Z0-9/_]*(?:\s*[-–]\s*\d+|[A-Z0-9/_]*))/iu;
const ANYTIME = /jebkurā\s+(?:sev\s+)?piemērotā\s+laikā|ieraksts|tālmācīb/iu;
const ONLINE = /zoom|tiešsaist|vebinār|webinār|online|teams/iu;
const IN_PERSON = /klātien/iu;

export function parseLma(html: string, today = todayLv()): Course[] {
  const start = html.indexOf("<tbody");
  if (start < 0) return [];
  const body = html.slice(start, html.indexOf("</tbody>", start));
  const out: Course[] = [];
  for (const row of body.split(/<tr[\s>]/i).slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 4) continue;
    const title = textOf(cells[0]).replace(/^[‘’'"“”„]+|[‘’'"“”„]+$/g, "").trim();
    if (!title) continue;
    const organizer = textOf(cells[1]) || null;
    const rest = cells.slice(2, 5).map((c) => textOf(c, true)).join("\n");
    const date = lvLongDate(rest.replace(/(\d{4})\.\s*gada/iu, "$1. gada"));
    const anytime = !date && ANYTIME.test(rest);
    if (date ? date < today : !anytime) continue;

    const online = ONLINE.test(rest);
    const inPerson = IN_PERSON.test(rest) || /iela\s+\d/iu.test(rest);
    const format: CourseFormat = anytime ? "recorded" : online && inPerson ? "hybrid" : online ? "online_live" : "in_person";
    const address = /[\p{Lu}][\p{L}.]*\s+iela\s+\d+[a-z]?(?:,\s*[\p{Lu}][\p{L}]+)?|Rīga,\s*[\p{Lu}][\p{L}]+\s+iela\s+\d+/u.exec(rest)?.[0] ?? null;
    const city = address ? cityOf(address).city : online ? "Online" : null;
    const approval = APPROVAL.exec(rest)?.[1]?.replace(/\s+/g, "").replace(/–/g, "-") ?? null;
    const audienceLine = /mērķauditorija:\s*([^\n]+)/iu.exec(rest)?.[1] ?? /\n?(māsas[^\n]*)/iu.exec(rest)?.[1] ?? "";
    const prices = [...rest.matchAll(/(\d+(?:[.,]\d{1,2})?)\s*(?:EUR|eur)/gu)].map((m) => Number(m[1].replace(",", ".")));
    const eur = (n: number) => n.toFixed(2).replace(".", ",");
    const sorted = [...new Set(prices)].sort((a, b) => a - b);
    // the sign-up button links to the organiser's own page; a "#course-form" popup only works on LMA's site
    const apply = /class="btn-outline[^"]*"\s+href="([^"#][^"]*)"/i.exec(row)?.[1];

    out.push({
      id: `lma:${titleKey(title).slice(0, 40)}:${date ?? "anytime"}`,
      kind: anytime ? "recorded" : "event",
      source: "lma",
      title,
      url: apply ? decodeEntities(apply) : LIST,
      startDate: date,
      endDate: null,
      availableUntil: null,
      format,
      location: format === "online_live" ? "Zoom" : address,
      city,
      tip: tipIn(rest),
      minutes: null,
      audience: audienceLine.trim().replace(/\s*LMa.*$/iu, "") || "Māsas",
      allSpecialties: false,
      organizer,
      approvalId: approval,
      annexItem: null,
      price: sorted.length ? `EUR ${sorted.map(eur).join(" - ")}` : null,
      free: sorted.length > 0 && sorted.every((p) => p === 0),
    });
  }
  return out;
}

export async function fetchLma(): Promise<Course[]> {
  return parseLma(await fetchText(LIST));
}
