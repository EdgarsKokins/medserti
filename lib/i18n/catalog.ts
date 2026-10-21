import { baseDict, LOCALES, type Locale } from "../i18n";
import { baseCourseStrings } from "@/components/courses/strings";
import type { RuntimeOverrides } from "./overrides";
import { GENERIC, LABELS, PARAM_NAMES, SECTION_NAMES } from "./catalog-labels";

/**
 * Catalog of every UI text for the /admin editor, built from the code dictionaries.
 *
 * Each text is one of:
 * - "text": a plain string, editable as is
 * - "template": a function that only drops its arguments into the sentence. Editable with {named} placeholders.
 *   Detected by running the function, not by reading code, so a function that later gains plural or if/else logic
 *   turns read-only by itself and its old override stops applying.
 * - "code": a function with plural forms or conditions ("1 diena / 2 dienas"). Read-only, changed in code.
 *
 * Stored overrides use named placeholders ({n}, {date}); compileOverrides() turns them into the positional form
 * the runtime applies ({0}, {0.points}).
 */

export type CellKind = "text" | "template" | "code";
export type Cell = {
  kind: CellKind;
  /** default text; for a template with {named} placeholders, for code a sample output */
  def: string;
  /** allowed placeholders, in order */
  params: string[];
  /** example outputs with sample values (template and code) */
  samples: string[];
};
export type Entry = { key: string; block: BlockId; section: string; label: string } & Record<Locale, Cell>;
export type StoredOverrides = Record<Locale, Record<string, string>>;
export const emptyOverrides = (): StoredOverrides => ({ lv: {}, en: {}, ru: {} });

export type BlockId =
  | "nav" | "landing" | "dashboard" | "certs" | "upload" | "courses" | "profile" | "auth" | "errors" | "export" | "about" | "legal" | "other";

export const BLOCKS: { id: BlockId; name: string; href?: string }[] = [
  { id: "nav", name: "Navigācija", href: "/" },
  { id: "landing", name: "Sākumlapa", href: "/" },
  { id: "dashboard", name: "Pārskats", href: "/dashboard" },
  { id: "certs", name: "Sertifikāti", href: "/certificates" },
  { id: "upload", name: "Augšupielāde", href: "/certificates" },
  { id: "courses", name: "Kursi", href: "/courses" },
  { id: "profile", name: "Profils", href: "/profile" },
  { id: "auth", name: "Pieslēgšanās un reģistrācija", href: "/login" },
  { id: "errors", name: "Kļūdas un paziņojumi" },
  { id: "export", name: "Resertifikācijas dokumenti", href: "/export" },
  { id: "about", name: "Par mums", href: "/par-mums" },
  { id: "legal", name: "Privātums, noteikumi un konta dzēšana", href: "/privatums" },
  { id: "other", name: "Citi teksti" },
];

/** top-level dictionary key -> block */
const BLOCK_OF: Record<string, BlockId> = {
  brand: "nav", lang: "nav", theme: "nav", nav: "nav", common: "nav",
  landingA: "landing", landing: "landing",
  dashboard: "dashboard", chart: "dashboard", checks: "dashboard",
  certs: "certs", review: "certs", status: "certs", categories: "certs", parseNotes: "certs",
  upload: "upload",
  courses: "courses",
  profile: "profile", professions: "profile", rules: "profile",
  auth: "auth", reset: "auth", demo: "auth",
  api: "errors", notFound: "errors", error: "errors",
  exportDocs: "export",
  about: "about",
  legal: "legal",
};

/** Texts not shown to users, or not words (locale codes). Editing them would do nothing or break something. */
const HIDDEN = (key: string) =>
  key === "landing.ogLocale" ||
  // the old landing page: only these "landing" texts are still on screen (meta, FAQ heading, footer)
  (key.startsWith("landing.") &&
    !["metaTitle", "metaDescription", "faqTitle", "footerContact", "footerNav", "footerRules", "online"].includes(key.slice(8)));

export const MAX_LEN = 4000;
const NAMED = /\{([A-Za-z_]\w*)\}/g;
export const placeholdersIn = (s: string) => [...new Set([...s.matchAll(NAMED)].map((m) => m[1]))];

/* ---------- template detection ---------- */

type Fn = (...args: unknown[]) => unknown;
const S = (slot: string) => `${slot}`;
const SENT = /([^]*)/g;
/** values that expose plural forms and conditions: 1 vs 2, 11 vs 21, empty vs filled */
const VARIANTS: unknown[] = [0, 1, 2, 3, 5, 11, 12, 21, 22, 100, 101, 1234.5, -1, "", "a", "1"];

/** sample values by placeholder name, for previews */
const SAMPLES: Record<string, Record<Locale, unknown>> = {
  n: { lv: 12, en: 12, ru: 12 }, count: { lv: 7, en: 7, ru: 7 }, years: { lv: 5, en: 5, ru: 5 }, pct: { lv: 40, en: 40, ru: 40 },
  date: { lv: "14.03.2028.", en: "14 Mar 2028", ru: "14.03.2028" }, ago: { lv: 3, en: 3, ru: 3 }, status: { lv: 413, en: 413, ru: 413 },
  points: { lv: "42.5", en: "42.5", ru: "42.5" }, mine: { lv: 200, en: 200, ru: 200 }, rule: { lv: 250, en: 250, ru: 250 },
  counted: { lv: "50", en: "50", ru: "50" }, raw: { lv: "62.5", en: "62.5", ru: "62.5" }, cap: { lv: "50", en: "50", ru: "50" }, lost: { lv: "12.5", en: "12.5", ru: "12.5" },
  h: { lv: "6", en: "6", ru: "6" }, days: { lv: 2, en: 2, ru: 2 }, list: { lv: "12; 16", en: "12; 16", ru: "12; 16" }, academic: { lv: true, en: true, ru: true },
  name: { lv: "Kardioloģijas kongress 2026", en: "Cardiology congress 2026", ru: "Конгресс кардиологов 2026" },
  specialty: { lv: "Kardioloģija", en: "Cardiology", ru: "Кардиолог" }, s: { lv: "Kardioloģija", en: "Cardiology", ru: "Кардиолог" },
  reasons: { lv: "2 ārpus sertifikāta perioda", en: "2 outside your certificate period", ru: "2 вне периода сертификата" },
  title: { lv: "Kardioloģijas kongress 2026", en: "Cardiology congress 2026", ru: "Конгресс кардиологов 2026" },
  done: { lv: 3, en: 3, ru: 3 }, total: { lv: 8, en: 8, ru: 8 },
  firstName: { lv: "Anna", en: "Anna", ru: "Анна" },
  link: { lv: "https://medserti.lv/atjaunot-paroli?token=…", en: "https://medserti.lv/atjaunot-paroli?token=…", ru: "https://medserti.lv/atjaunot-paroli?token=…" },
};
const sample = (name: string, locale: Locale): unknown => SAMPLES[name]?.[locale] ?? "…";

function safeCall(fn: Fn, args: unknown[]): string | null {
  try {
    const out = fn(...args);
    return typeof out === "string" ? out : null;
  } catch {
    return null;
  }
}

/** Which fields of an object argument the function reads (parser notes take one object) */
function objectFields(fn: Fn): string[] | null {
  const seen: string[] = [];
  const proxy = new Proxy({} as Record<string, unknown>, {
    get(_, prop) {
      if (typeof prop !== "string") return undefined;
      if (!seen.includes(prop)) seen.push(prop);
      return S(prop);
    },
  });
  return safeCall(fn, [proxy]) !== null && seen.length ? seen : null;
}

type Shape = { mode: "pos"; names: string[] } | { mode: "obj"; names: string[] };

function shapeOf(key: string, fn: Fn): Shape {
  const named = PARAM_NAMES[key];
  if (fn.length === 1 && named?.[0] === "p") {
    const fields = objectFields(fn);
    if (fields) return { mode: "obj", names: fields };
  }
  const n = Math.max(fn.length, named?.length ?? 0);
  return { mode: "pos", names: Array.from({ length: n }, (_, i) => named?.[i] ?? `arg${i + 1}`) };
}

function argsFor(shape: Shape, value: (name: string, i: number) => unknown): unknown[] {
  if (shape.mode === "obj") return [Object.fromEntries(shape.names.map((nm, i) => [nm, value(nm, i)]))];
  return shape.names.map((nm, i) => value(nm, i));
}

function analyse(key: string, fn: Fn, locale: Locale): Cell {
  const shape = shapeOf(key, fn);
  const samples: string[] = [];
  const ex = safeCall(fn, argsFor(shape, (nm) => sample(nm, locale)));
  if (ex !== null) samples.push(ex);
  const code = (): Cell => {
    // a second example with the count at 1 shows the plural logic
    if (shape.names.length) {
      const one = safeCall(fn, argsFor(shape, (nm, i) => (i === 0 || nm === "n" ? 1 : sample(nm, locale))));
      if (one !== null && !samples.includes(one)) samples.push(one);
    }
    return { kind: "code", def: samples[0] ?? "", params: shape.names, samples };
  };

  const base = safeCall(fn, argsFor(shape, (nm) => S(nm)));
  if (base === null) return code();
  // every sentinel must come back intact, and nothing but sentinels may depend on the arguments
  for (const nm of shape.names) {
    for (const v of VARIANTS) {
      const got = safeCall(fn, argsFor(shape, (x) => (x === nm ? v : S(x))));
      if (got !== base.split(S(nm)).join(String(v))) return code();
    }
  }
  const used = new Set<string>();
  const def = base.replace(SENT, (_, nm: string) => (used.add(nm), `{${nm}}`));
  if (/[]/.test(def)) return code();
  // a placeholder name that also appears as literal "{name}" would be ambiguous
  if (placeholdersIn(def).some((p) => !used.has(p))) return code();
  return { kind: "template", def, params: shape.names.filter((nm) => used.has(nm)), samples };
}

function cellOf(key: string, v: unknown, locale: Locale): Cell | null {
  if (typeof v === "string") return { kind: "text", def: v, params: placeholdersIn(v), samples: [] };
  if (typeof v === "function") return analyse(key, v as Fn, locale);
  return null;
}

function leaves(node: unknown, path: string, out: Map<string, unknown>) {
  if (typeof node === "string" || typeof node === "function") out.set(path, node);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) leaves(v, path ? `${path}.${k}` : k, out);
}

function humanize(key: string): string {
  const last = key.split(".").filter((p) => !/^\d+$/.test(p)).pop() ?? key;
  const words = last.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Label: explicit, else the label of the key with array indexes turned into "1.", "2." */
function labelOf(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const idx = [...key.matchAll(/\.(\d+)(?=\.|$)/g)].map((m) => Number(m[1]) + 1);
  const generic = key.replace(/\.\d+(?=\.|$)/g, ".#");
  if (LABELS[generic]) return LABELS[generic].replace(/#/g, () => String(idx.shift() ?? ""));
  const last = key.split(".").pop() ?? "";
  return GENERIC[last] ?? humanize(key);
}

function sectionOf(key: string): string {
  const parts = key.split(".");
  const two = parts.slice(0, 2).join(".");
  return SECTION_NAMES[two] ?? SECTION_NAMES[parts[0]] ?? humanize(parts[0]);
}

let memo: { entries: Entry[]; byKey: Map<string, Entry> } | null = null;

export function catalog(): { entries: Entry[]; byKey: Map<string, Entry> } {
  if (memo) return memo;
  const maps = {} as Record<Locale, Map<string, unknown>>;
  for (const l of LOCALES) {
    maps[l] = new Map<string, unknown>();
    leaves(baseDict(l), "", maps[l]);
    leaves(baseCourseStrings(l), "courses", maps[l]);
  }
  const entries: Entry[] = [];
  for (const [key, lvV] of maps.lv) {
    if (HIDDEN(key)) continue;
    const lv = cellOf(key, lvV, "lv");
    const en = cellOf(key, maps.en.get(key), "en");
    const ru = cellOf(key, maps.ru.get(key), "ru");
    if (!lv || !en || !ru) continue;
    const top = key.split(".")[0];
    entries.push({ key, block: BLOCK_OF[top] ?? "other", section: sectionOf(key), label: labelOf(key), lv, en, ru });
  }
  memo = { entries, byKey: new Map(entries.map((e) => [e.key, e])) };
  return memo;
}

/* ---------- validation ---------- */

export type Problem = { key: string; locale: Locale; message: string };

/** Problem with one value, or null. Messages are shown to the admin in Latvian. */
export function checkValue(cell: Cell, value: string): string | null {
  if (cell.kind === "code") return "Šis teksts ir iestatīts kodā, to nevar labot šeit.";
  if (!value.trim()) return "Teksts nevar būt tukšs. Lai atgrieztu sākotnējo, spiediet “Atjaunot noklusējumu”.";
  if (value.length > MAX_LEN) return `Teksts ir par garu (maks. ${MAX_LEN} rakstzīmes).`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) return "Tekstā ir neatļautas rakstzīmes.";
  const want = cell.kind === "template" ? cell.params : placeholdersIn(cell.def);
  if (cell.kind === "template" || want.length) {
    const got = placeholdersIn(value);
    const unknown = got.filter((p) => !want.includes(p));
    const missing = want.filter((p) => !got.includes(p));
    if (unknown.length) return `Nezināms lauks: ${unknown.map((p) => `{${p}}`).join(", ")}. Atļauti: ${want.map((p) => `{${p}}`).join(", ") || "nav"}.`;
    if (missing.length) return `Trūkst lauka: ${missing.map((p) => `{${p}}`).join(", ")}. Tajā vietā lapā tiek ievietota vērtība.`;
  }
  return null;
}

/**
 * Validate a full overrides object from the admin. Drops values equal to the default.
 * Unknown keys and read-only texts are errors, so a typo never saves silently.
 */
export function validateOverrides(input: unknown): { ok: true; value: StoredOverrides } | { ok: false; problems: Problem[] } {
  const { byKey } = catalog();
  const problems: Problem[] = [];
  const value = emptyOverrides();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, problems: [{ key: "", locale: "lv", message: "Nederīgs formāts." }] };
  }
  for (const k of Object.keys(input)) {
    if (!(LOCALES as readonly string[]).includes(k)) problems.push({ key: k, locale: "lv", message: "Nezināma valoda." });
  }
  for (const locale of LOCALES) {
    const m = (input as Record<string, unknown>)[locale];
    if (m === undefined) continue;
    if (!m || typeof m !== "object" || Array.isArray(m)) {
      problems.push({ key: "", locale, message: "Nederīgs formāts." });
      continue;
    }
    for (const [key, v] of Object.entries(m)) {
      const entry = byKey.get(key);
      if (!entry) {
        problems.push({ key, locale, message: "Šāda teksta vairs nav." });
        continue;
      }
      if (typeof v !== "string") {
        problems.push({ key, locale, message: "Vērtībai jābūt tekstam." });
        continue;
      }
      const cell = entry[locale];
      if (v === cell.def) continue;
      const err = checkValue(cell, v);
      if (err) problems.push({ key, locale, message: err });
      else value[locale][key] = v;
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, value };
}

/** Stored (named placeholders) -> runtime (positional). Anything that no longer validates is skipped. */
export function compileOverrides(stored: Partial<StoredOverrides> | null | undefined): RuntimeOverrides {
  const { byKey } = catalog();
  const out: RuntimeOverrides = {};
  for (const locale of LOCALES) {
    const m = stored?.[locale];
    if (!m || typeof m !== "object") continue;
    const flat: Record<string, string> = {};
    for (const [key, v] of Object.entries(m)) {
      const entry = byKey.get(key);
      if (!entry || typeof v !== "string") continue;
      const cell = entry[locale];
      if (v === cell.def || checkValue(cell, v)) continue;
      if (cell.kind === "text") flat[key] = v;
      else {
        const fn = lookup(key, locale) as Fn;
        const obj = typeof fn === "function" && shapeOf(key, fn).mode === "obj";
        const names = typeof fn === "function" ? shapeOf(key, fn).names : cell.params;
        flat[key] = v.replace(NAMED, (whole, nm: string) => {
          const i = names.indexOf(nm);
          return i < 0 ? whole : obj ? `{0.${nm}}` : `{${i}}`;
        });
      }
    }
    if (Object.keys(flat).length) out[locale] = flat;
  }
  return out;
}

function lookup(key: string, locale: Locale): unknown {
  const [root, rest] = key.startsWith("courses.") ? [baseCourseStrings(locale), key.slice(8)] : [baseDict(locale), key];
  return rest.split(".").reduce<unknown>((node, p) => (node && typeof node === "object" ? (node as Record<string, unknown>)[p] : undefined), root);
}

/** Fill a {named} template with sample values, for the editor preview */
export function previewTemplate(tpl: string, params: string[], locale: Locale): string {
  return tpl.replace(NAMED, (whole, nm: string) => (params.includes(nm) ? String(sample(nm, locale)) : whole));
}

export const SAMPLE_VALUES = Object.fromEntries(Object.entries(SAMPLES).map(([k, v]) => [k, { lv: String(v.lv), en: String(v.en), ru: String(v.ru) }]));
