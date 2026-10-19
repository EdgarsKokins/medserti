import type { Course, CourseFormat } from "../types";
import { cityOf, dmy, fetchText, textOf, tipIn, titleKey, todayIso } from "../util";

/**
 * LUMPII (Medicīniskās pēcdiploma izglītības institūts) lists its doctor courses in one hand-edited Joomla
 * article: no feed, no detail pages. Each course starts with a "SEMINĀRS ..." / "KURSI: ..." heading; the
 * dates, price and venue follow in free text and tables. Contact phones/emails on the page are not kept.
 */
const LIST = "https://www.lumpii.lv/arstniecibas-personam/kursi";
const ORGANIZER = "Medicīniskās pēcdiploma izglītības institūts";
/** headings are written in capitals; "Kursi ietver ..." in body text is not one */
const HEADING = /^(SEMINĀRS|SEMINĀRI|KURSI|KONFERENCE|VEBINĀRS|LEKCIJA|MEISTARKLASE)\b/u;
/** footer of the article: patient notices, contacts */
const END = /^(Klientu ievērībai|Papildu informācija par kursiem|Kursus rīkojam arī)/iu;

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** "NEATLIEKAMĀ MEDICĪNISKĀ PALĪDZĪBA" -> "Neatliekamā medicīniskā palīdzība" (all-caps titles only) */
function sentenceCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  const low = s.toLowerCase();
  return low.charAt(0).toUpperCase() + low.slice(1);
}

function titleOf(lines: string[]): string | null {
  for (const l of lines.slice(0, 3)) {
    const q = /[“"„«]([^“”"„«»]{8,})[”"»]/u.exec(l);
    if (q) return sentenceCase(q[1].trim());
  }
  return null;
}

export function parseLumpii(html: string, today = todayIso()): Course[] {
  const start = html.indexOf('itemprop="articleBody"');
  if (start < 0) return [];
  const article = html.slice(start, html.indexOf("</article>", start) > 0 ? html.indexOf("</article>", start) : undefined);
  const text = textOf(article.replace(/<\/(p|h\d|tr|td|li|div)>/gi, "\n"), true)
    .split("\n")
    .map((l) => l.replace(/^itemprop="articleBody">\s*/, "").trim())
    .filter(Boolean);

  const sections: string[][] = [];
  for (const line of text) {
    if (END.test(line)) break;
    if (HEADING.test(line)) sections.push([line]);
    else sections.at(-1)?.push(line);
  }

  const out: Course[] = [];
  for (const lines of sections) {
    const title = titleOf(lines);
    if (!title) continue;
    const body = lines.join("\n");
    // session dates; "līdz 25.10.2026" is a registration / self-study deadline
    const dates = [...body.matchAll(/(līdz\s+)?(\d{1,2}\.\d{1,2}\.\d{4})/giu)]
      .filter((m) => !m[1])
      .map((m) => dmy(m[2]))
      .filter((d): d is string => !!d);
    const uniq = [...new Set(dates)].sort();
    // a practical day right after the online part belongs to the same session
    const sessions: { start: string; end: string | null }[] = [];
    for (const d of uniq) {
      const last = sessions.at(-1);
      if (last && !last.end && addDays(last.start, 1) === d) last.end = d;
      else sessions.push({ start: d, end: null });
    }

    const online = /zoom|vebinār|webinār|tiešsaist|attālināt/iu.test(body);
    const inPerson = /klātien|prakse|praktizē/iu.test(body);
    const format: CourseFormat = online && inPerson ? "hybrid" : online ? "online_live" : "in_person";
    const address = /[\p{Lu}][\p{L}.]*\s+iela\s+\d+[a-z]?,\s*[\p{Lu}][\p{L}]+/u.exec(body)?.[0] ?? null;
    const location = format === "online_live" ? "Zoom" : format === "hybrid" ? `Zoom; ${address ?? "klātienē"}` : address;
    const city = (address && cityOf(address).city) ?? (online ? "Online" : null);
    const tip = tipIn(body) ?? (Number(/\bTIP\s+(\d{1,3}(?:[.,]\d)?)\b/u.exec(body)?.[1]?.replace(",", ".")) || null);
    const prices = [...new Set([...body.matchAll(/(\d+(?:[.,]\d{2})?)\s*,?-?\s*EUR/giu)].map((m) => Number(m[1].replace(",", "."))))].sort(
      (a, b) => a - b,
    );
    const eur = (n: number) => n.toFixed(2).replace(".", ",");
    const price = prices.length ? `EUR ${prices.map(eur).join(" - ")}` : null;
    const all = /visu\s+specialitāšu/iu.test(body);

    for (const s of sessions) {
      if ((s.end ?? s.start) < today) continue;
      out.push({
        id: `lumpii:${titleKey(title).slice(0, 40)}:${s.start}`,
        kind: "event",
        source: "lumpii",
        title,
        url: LIST,
        startDate: s.start,
        endDate: s.end,
        availableUntil: null,
        format,
        location,
        city,
        tip,
        minutes: null,
        audience: all ? "Visu specialitāšu ārstniecības personas" : "",
        allSpecialties: all,
        organizer: ORGANIZER,
        approvalId: null,
        annexItem: null,
        price,
        free: prices.length > 0 && prices.every((p) => p === 0),
      });
    }
  }
  return out;
}

export async function fetchLumpii(): Promise<Course[]> {
  return parseLumpii(await fetchText(LIST));
}
