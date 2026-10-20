import "server-only";
import { getJson, putJson } from "../storage";
import { compileOverrides, type StoredOverrides } from "./catalog";
import { setI18nOverrides, type RuntimeOverrides } from "./overrides";

/** Overrides edited at /admin, in the private Blob store. The previous version is kept for undo. */
const CURRENT = "i18n/overrides.json";
const PREVIOUS = "i18n/overrides.prev.json";
const TTL_MS = 60_000;

const empty = (): StoredOverrides => ({ lv: {}, en: {} });

function normalize(v: unknown): StoredOverrides {
  const out = empty();
  if (!v || typeof v !== "object") return out;
  for (const l of ["lv", "en"] as const) {
    const m = (v as Record<string, unknown>)[l];
    if (m && typeof m === "object" && !Array.isArray(m))
      for (const [k, s] of Object.entries(m)) if (typeof s === "string") out[l][k] = s;
  }
  return out;
}

export async function readStoredOverrides(): Promise<StoredOverrides> {
  return normalize(await getJson<unknown>(CURRENT));
}

export async function readPreviousOverrides(): Promise<StoredOverrides | null> {
  const v = await getJson<unknown>(PREVIOUS);
  return v ? normalize(v) : null;
}

/* one cache per server process: route bundles can hold separate copies of this module, and a save must reach all of them */
type Cache = { mem: { at: number; runtime: RuntimeOverrides } | null; inflight: Promise<RuntimeOverrides> | null };
const cache: Cache = ((globalThis as { __medsertiI18n?: Cache }).__medsertiI18n ??= { mem: null, inflight: null });

/**
 * Overrides in runtime form, cached for 60 s per server instance, and applied to t() / courseStrings() on the server.
 * Never throws: if the store is unreachable the site shows the code texts (or the last good overrides).
 */
export async function loadRuntimeOverrides(): Promise<RuntimeOverrides> {
  const { mem } = cache;
  if (mem && Date.now() - mem.at < TTL_MS) {
    setI18nOverrides(mem.runtime);
    return mem.runtime;
  }
  cache.inflight ??= (async () => {
    let next: RuntimeOverrides;
    try {
      next = compileOverrides(await readStoredOverrides());
      cache.mem = { at: Date.now(), runtime: next };
    } catch {
      // keep serving what we had; retry after a short pause
      next = cache.mem?.runtime ?? {};
      cache.mem = { at: Date.now() - TTL_MS + 5_000, runtime: next };
    } finally {
      cache.inflight = null;
    }
    return next;
  })();
  const runtime = await cache.inflight;
  setI18nOverrides(runtime);
  return runtime;
}

/** Save a validated overrides object; the old one becomes the "previous" version */
export async function saveStoredOverrides(next: StoredOverrides): Promise<void> {
  const prev = await readStoredOverrides();
  await putJson(PREVIOUS, prev);
  await putJson(CURRENT, next);
  cache.mem = null;
}

/** Swap the current and the previous version (undo the last save; pressing again redoes it) */
export async function restorePreviousOverrides(): Promise<StoredOverrides | null> {
  const prev = await readPreviousOverrides();
  if (!prev) return null;
  const cur = await readStoredOverrides();
  await putJson(CURRENT, prev);
  await putJson(PREVIOUS, cur);
  cache.mem = null;
  return prev;
}
