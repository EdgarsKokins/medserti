import type { CertStatus, CmeCertificate, ParseNote } from "@/lib/types";
import { formatDate as fmtDate, formatNumber as fmtNum, type Locale } from "@/lib/locale";
import type { Dict } from "@/lib/i18n";

/** YYYY-MM-DD -> LV "27.11.2026.", EN "27 Nov 2026"; "" for no date */
export const formatDate = (iso: string | null, locale: Locale): string => (iso ? fmtDate(iso, locale) : "");

export function formatRange(c: Pick<CmeCertificate, "date" | "endDate">, locale: Locale): string {
  if (!c.date) return "";
  return c.endDate && c.endDate !== c.date
    ? `${formatDate(c.date, locale)} - ${formatDate(c.endDate, locale)}`
    : formatDate(c.date, locale);
}

export const STATUS_CLASS: Record<CertStatus, string> = {
  parsing: "badge",
  needs_review: "badge badge-warn",
  confirmed: "badge badge-ok",
  failed: "badge badge-bad",
};

export const formatNumber = (n: number | null, locale: Locale) => (n == null ? "" : fmtNum(n, locale));

/** Abbreviations that stay uppercase when an ALL CAPS organizer name is converted for display */
const KEEP_UPPER = new Set([
  "SIA", "AS", "VSIA", "BO", "NVO", "LĀB", "LĀS", "LĀPB", "LĶA", "RSU", "LU", "RTU", "LSPA",
  "PSKUS", "BKUS", "RAKUS", "VM", "NVD", "VI", "SPKC", "NMPD", "ESC", "ERC", "ESMO", "EAU", "EU", "ES", "LR", "TIP", "CME",
]);
/** Short joining words that read better in lowercase mid-name */
const LOWER = new Set(["un", "ar", "par", "no", "uz", "pie", "of", "and", "the", "for", "in", "on", "at", "to"]);
/** Latvian institution nouns are written in lowercase after the first word ("Rīgas Stradiņa universitāte") */
const LV_COMMON = /^(universitāte|universitātes|biedrība|biedrības|asociācija|asociācijas|slimnīca|slimnīcas|klīnika|klīnikas|klīniskā|klīniskās|centrs|centra|koledža|koledžas|akadēmija|akadēmijas|institūts|institūta|fakultāte|fakultātes|katedra|katedras|nodaļa|nodaļas|apvienība|apvienības|sabiedrība|sabiedrības|skola|skolas|dienests|dienesta|ministrija|ministrijas|biroja|birojs|kongress|konference|konferences|savienība|savienības)$/;

/**
 * Display-only: "RĪGAS STRADIŅA UNIVERSITĀTE" -> "Rīgas Stradiņa universitāte"-style casing.
 * Only rewrites names typed mostly in capitals; mixed-case names are shown as stored.
 * Words longer than 3 letters are title-cased (Latvian institution nouns lowercased after the first word);
 * known abbreviations and other short words stay as they are.
 */
export function displayOrganizer(name: string): string {
  const letters = name.match(/\p{L}/gu) ?? [];
  if (letters.length < 4) return name;
  const upper = letters.filter((ch) => ch === ch.toLocaleUpperCase("lv") && ch !== ch.toLocaleLowerCase("lv")).length;
  if (upper / letters.length < 0.8) return name;
  let first = true;
  return name.replace(/\p{L}+/gu, (word) => {
    const isFirst = first;
    first = false;
    if (KEEP_UPPER.has(word)) return word;
    const lower = word.toLocaleLowerCase("lv");
    if (!isFirst && (LOWER.has(lower) || LV_COMMON.test(lower))) return lower;
    if (word.length <= 3) return word;
    return lower.charAt(0).toLocaleUpperCase("lv") + lower.slice(1);
  });
}

/** Countries offered in the review panel: Latvia first, then the ones the parser recognises */
export const COUNTRY_CODES = [
  "LV", "LT", "EE", "FI", "SE", "NO", "DK", "IS", "PL", "DE", "AT", "CH", "NL", "BE", "LU", "FR", "ES", "PT", "IT", "GR",
  "CY", "MT", "CZ", "SK", "HU", "SI", "HR", "RO", "BG", "RS", "IE", "GB", "UA", "GE", "TR", "IL", "US", "CA", "AE",
  "UZ", "KZ",
] as const;

/** English names the parser stored before countries became ISO codes (Oct 2026) */
const LEGACY_COUNTRY: Record<string, string> = {
  latvia: "LV", lithuania: "LT", estonia: "EE", finland: "FI", sweden: "SE", norway: "NO", denmark: "DK", iceland: "IS",
  poland: "PL", germany: "DE", austria: "AT", switzerland: "CH", netherlands: "NL", belgium: "BE", luxembourg: "LU",
  france: "FR", spain: "ES", portugal: "PT", italy: "IT", greece: "GR", cyprus: "CY", malta: "MT", czechia: "CZ",
  slovakia: "SK", hungary: "HU", slovenia: "SI", croatia: "HR", romania: "RO", bulgaria: "BG", serbia: "RS",
  ireland: "IE", "united kingdom": "GB", ukraine: "UA", georgia: "GE", turkey: "TR", israel: "IL",
  "united states": "US", canada: "CA", "united arab emirates": "AE", latvija: "LV", lietuva: "LT", igaunija: "EE",
};

/** Stored country (ISO code or a legacy English name) -> ISO code; null when empty or unknown */
export function countryCode(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return LEGACY_COUNTRY[v.toLowerCase()] ?? null;
}

/** ISO code -> "Latvija" / "Latvia" / "Латвия" in the UI language */
export function countryName(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale === "en" ? "en-GB" : locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Parser notes in the UI language. New certificates store a JSON array of codes; older ones a plain
 * English sentence, which is returned as-is with `legacy: true` so the panel can label it.
 */
export function parseNoteLines(raw: string | null, dict: Dict): { lines: string[]; legacy: boolean } {
  if (!raw) return { lines: [], legacy: false };
  let notes: ParseNote[] | null = null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) notes = v;
  } catch {
    // plain text from before notes were codes
  }
  if (!notes) return { lines: [raw], legacy: true };
  const render = dict.parseNotes as Record<string, ((p: Record<string, string | number | boolean>) => string) | undefined>;
  const lines: string[] = [];
  for (const n of notes) {
    const fn = n && typeof n.code === "string" ? render[n.code] : undefined;
    if (!fn) continue;
    // "Check before confirming" reads as the end of the note before it
    if (n.code === "checkBeforeConfirming" && lines.length) lines[lines.length - 1] += ` ${fn({})}`;
    else lines.push(fn(n.p ?? {}));
  }
  return { lines, legacy: false };
}
