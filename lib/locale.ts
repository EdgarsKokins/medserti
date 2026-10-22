import type { Dict } from "./i18n/en";

/*
 * Locale basics with no dictionary inside: safe for any client component.
 * Strings come from the server (t() in lib/i18n.ts) or, in client components, from useDict() (components/i18n/DictProvider.tsx).
 */

export type Locale = "lv" | "en" | "ru";
export const LOCALES: readonly Locale[] = ["lv", "en", "ru"];
export const DEFAULT_LOCALE: Locale = "lv";
export const LOCALE_COOKIE = "lang";

export const isLocale = (v: unknown): v is Locale => v === "lv" || v === "en" || v === "ru";

/** Russian: 1, 21 день; 2-4, 22-24 дня; 5-20, 25-30 дней. Fractions take the "few" form: 1,5 дня */
export const ruPl = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n);
  if (!Number.isInteger(a)) return few;
  const d = a % 10, h = a % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
};

// sections that show a progress unit; texts that explain the conversion keep the word TIP
const HOURS_SECTIONS = ["dashboard", "checks", "chart", "profile", "certs", "review"] as const;
const KEEP_TIP = new Set(["nurseRule", "functionalTransition"]);

/** Swap the word TIP for another unit; "akad. st." already ends a sentence, so "100 TIP." becomes "100 akad. st." */
export const swapUnit = (text: string, unit: string) =>
  text.replace(/\bTIP\b(\.?)/g, (_, dot: string) => (unit.endsWith(".") ? unit : unit + dot));

const HOURS_CACHE = new WeakMap<Dict, Dict>();

/**
 * Nurses count academic hours, not TIP (Cabinet Regulation No. 630 Annex 6: "Viena akadēmiskā stunda, kuras ilgums ir
 * 45 minūtes, atbilst vienam tālākizglītības punktam"). Same numbers, so this only swaps the unit word in progress texts.
 */
export function inHours(d: Dict): Dict {
  // one copy per dictionary object: t() returns the same object per language until the /admin overrides change
  const hit = HOURS_CACHE.get(d);
  if (hit) return hit;
  const unit = d.dashboard.hoursUnit;
  const swap = (v: string) => swapUnit(v, unit);
  const map = (v: unknown, key = ""): unknown => {
    if (KEEP_TIP.has(key)) return v;
    if (typeof v === "string") return swap(v);
    if (typeof v === "function") return (...a: unknown[]) => swap(String(v(...a)));
    if (Array.isArray(v)) return v.map((x) => map(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, map(x, k)]));
    return v;
  };
  const out = { ...d };
  for (const s of HOURS_SECTIONS) (out as Record<string, unknown>)[s] = map(d[s]);
  HOURS_CACHE.set(d, out);
  return out;
}
