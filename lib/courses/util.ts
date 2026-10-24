/** Shared helpers for course scrapers. No package dependencies so the same code runs in Node scripts and on Vercel. */
import { fold } from "../text";

const USER_AGENT = "MedsertiBot/0.1 (+https://medserti.lv; course listings with links back to the source)";

export async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "lv,en;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", ndash: "-", mdash: "-",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", bdquo: "„", lsquo: "‘", rsquo: "’", hellip: "…",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** HTML fragment -> plain text on one line (line breaks kept as \n when keepBreaks) */
export function textOf(fragment: string, keepBreaks = false): string {
  let s = fragment.replace(/<br\s*\/?>/gi, "\n").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "");
  s = decodeEntities(s.replace(/<[^>]+>/g, " "));
  if (keepBreaks)
    return s
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  return s.replace(/\s+/g, " ").trim();
}

/** "27.11.2026" -> "2026-11-27" */
export function dmy(s: string): string | null {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null; // source has typos like 24.03.0208
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const LV_MONTHS = ["janvār", "februār", "mart", "aprīl", "maij", "jūnij", "jūlij", "august", "septembr", "oktobr", "novembr", "decembr"];

/** "2026. gada 7. novembrī" -> "2026-11-07" */
export function lvLongDate(s: string): string | null {
  const m = /(\d{4})\.\s*g(?:ada|\.)?\s*(\d{1,2})\.\s*([a-zāčēģīķļņšūž]+)/iu.exec(s);
  if (!m) return null;
  const mo = LV_MONTHS.findIndex((p) => m[3].toLowerCase().startsWith(p));
  if (mo < 0) return null;
  return `${m[1]}-${String(mo + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** "(1,4 TIP)", "16 TIP" -> number */
export function tipIn(s: string): number | null {
  const m = /(\d{1,3}(?:[.,]\d{1,2})?)\s*TIP(?![\p{L}])/iu.exec(s);
  return m ? Number(m[1].replace(",", ".")) : null;
}

const CITIES = [
  "Rīga", "Daugavpils", "Liepāja", "Jelgava", "Jūrmala", "Ventspils", "Rēzekne", "Valmiera", "Ogre", "Cēsis",
  "Sigulda", "Tukums", "Kuldīga", "Talsi", "Saldus", "Bauska", "Dobele", "Madona", "Jēkabpils", "Gulbene",
  "Alūksne", "Krāslava", "Ludza", "Smiltene", "Limbaži", "Aizkraukle", "Preiļi", "Balvi", "Salaspils", "Mārupe",
  "Ķekava", "Olaine", "Vecumnieki", "Iecava", "Kandava", "Līvāni", "Valka", "Ādaži", "Carnikava", "Baldone",
];
/** strip Latvian diacritics so "Riga" matches "Rīga" */
// match the stem so locative forms ("Rīgā", "Liepājā", "Cēsīs") also hit
const CITY_RX = CITIES.map((c) => [c, new RegExp(`(?<![a-z])${fold(c).slice(0, Math.max(4, c.length - 1))}[a-z]*`)] as const);
/** large Riga hospitals and venues that are often written without the city */
const RIGA_VENUES =
  /stradiņa|stradina|rakus|gaiļezer|gailezer|linezer|bērnu klīniskā universitātes|bkus|psihiskās veselības centrs|tvaika iela|pilsonu iela|hipokrāta|dzirciema|krasta iela|skolas iela 3|turība|gradu iel|anniņmuiž|ķīpsal|wellton|grebenščikov|infektoloģijas centrs|dzelzceļš|\bnmpd\b|amerikas acu centrs|\bmitc\b/iu;
/** venues outside Riga that are written without the town */
const VENUE_CITY: [RegExp, string][] = [[/ziemeļkurzemes reģionālā slimnīca/iu, "Ventspils"]];
const ONLINE_RX = /tiešsaist|attālināt|online|zoom|teams|meet|webex|webinār|vebinār|www\.|https?:\/\/|platform|tālmācīb|video\s*lekcij|moodle/iu;
const WHOLE_LATVIA = /vis[aā]\s+latvij|dažād\p{L}*\s+(?:latvijas\s+)?(?:pilsēt|viet)|latvijas\s+pilsēt|^[lļ]atvija$|pēc\s+pieprasījuma/iu;

export function cityOf(location: string): { city: string | null; online: boolean } {
  const online = ONLINE_RX.test(location);
  const f = fold(location);
  for (const [name, rx] of CITY_RX) if (rx.test(f)) return { city: name, online };
  for (const [rx, name] of VENUE_CITY) if (rx.test(location)) return { city: name, online };
  if (RIGA_VENUES.test(location)) return { city: "Rīga", online };
  if (online) return { city: "Online", online };
  if (WHOLE_LATVIA.test(location.trim())) return { city: "Latvija", online };
  return { city: null, online };
}

/**
 * Normalised key for de-duplication: letters and digits of any script (diacritics folded, so "Rīga" = "riga"),
 * lowercase, first 60 chars. A Cyrillic title keeps its letters instead of collapsing to "".
 */
export function titleKey(title: string): string {
  return fold(title).replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60);
}

/** Below this length a key is too generic ("kurss", "") to merge two rows by prefix */
const MIN_PREFIX_KEY = 10;
const PREFIX = 30;

/** Same course if one key starts with the other's first 30 chars; never for short keys */
export function samePrefix(a: string, b: string): boolean {
  if (a.length < MIN_PREFIX_KEY || b.length < MIN_PREFIX_KEY) return false;
  return a.startsWith(b.slice(0, PREFIX)) || b.startsWith(a.slice(0, PREFIX));
}
