import type { CertStatus, CmeCertificate } from "@/lib/types";
import { formatDate as fmtDate, formatNumber as fmtNum, type Locale } from "@/lib/i18n";

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
