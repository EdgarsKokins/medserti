import type { Locale } from "../i18n";

/**
 * Text overrides edited at /admin, applied on top of the code dictionaries. Client-safe.
 *
 * Runtime form (already compiled on the server by lib/i18n/overrides-server.ts):
 *   { lv: { "dashboard.chartTitle": "…", "courses.needLine": "Jums vēl jāsavāc {0} TIP." }, en: {…} }
 * Dot paths, array items by index ("landingA.steps.0.title"). Keys under "courses." apply to courseStrings().
 * For a function entry the value is a template: "{0}" is the first argument, "{0.points}" a field of it.
 */
export type RuntimeOverrides = Partial<Record<Locale, Record<string, string>>>;

let current: RuntimeOverrides = {};
let currentKey = "{}";
let cache = new Map<string, unknown>();

/** Swap the active overrides. Idempotent; cheap to call on every render. */
export function setI18nOverrides(o: RuntimeOverrides | null | undefined): void {
  const next = o ?? {};
  const key = JSON.stringify(next);
  if (key === currentKey) return;
  current = next;
  currentKey = key;
  cache = new Map();
}

export function getI18nOverrides(): RuntimeOverrides {
  return current;
}

const TOKEN = /\{(\d+)(?:\.([A-Za-z_]\w*))?\}/g;

/** Fill a compiled template with call arguments */
export function fillTemplate(tpl: string, args: unknown[]): string {
  return tpl.replace(TOKEN, (_, i: string, prop: string | undefined) => {
    let v: unknown = args[Number(i)];
    if (prop !== undefined) v = v && typeof v === "object" ? (v as Record<string, unknown>)[prop] : undefined;
    return v === undefined || v === null ? "" : String(v);
  });
}

function apply(node: unknown, path: string, flat: Record<string, string>, prefixes: Set<string>): unknown {
  if (typeof node === "string") {
    const o = flat[path];
    return typeof o === "string" ? o : node;
  }
  if (typeof node === "function") {
    const o = flat[path];
    return typeof o === "string" ? (...args: unknown[]) => fillTemplate(o, args) : node;
  }
  // skip subtrees with no override inside
  if (!node || typeof node !== "object" || (path && !prefixes.has(path))) return node;
  const sep = path ? "." : "";
  if (Array.isArray(node)) {
    let changed = false;
    const out = node.map((v, i) => {
      const n = apply(v, `${path}${sep}${i}`, flat, prefixes);
      if (n !== v) changed = true;
      return n;
    });
    return changed ? out : node;
  }
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(node)) {
    const n = apply(v, `${path}${sep}${k}`, flat, prefixes);
    if (n !== v) (out ??= { ...(node as Record<string, unknown>) })[k] = n;
  }
  return out ?? node;
}

/**
 * Overlay the active overrides on a dictionary. ns "" for the main dictionary, "courses" for courseStrings.
 * Memoized per (ns, locale); returns `base` itself when nothing applies.
 */
export function overlay<T>(ns: string, locale: Locale, base: T): T {
  const all = current[locale];
  if (!all) return base;
  const id = `${ns}|${locale}`;
  if (cache.has(id)) return cache.get(id) as T;
  const pre = ns ? `${ns}.` : "";
  const flat: Record<string, string> = {};
  const prefixes = new Set<string>();
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(pre) || typeof v !== "string") continue;
    const rel = k.slice(pre.length);
    flat[rel] = v;
    const parts = rel.split(".");
    for (let i = 1; i < parts.length; i++) prefixes.add(parts.slice(0, i).join("."));
  }
  const out = Object.keys(flat).length ? (apply(base, "", flat, prefixes) as T) : base;
  cache.set(id, out);
  return out;
}
