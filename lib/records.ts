import "server-only";
import { Redis } from "@upstash/redis";
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import path from "path";

/**
 * JSON records: accounts, certificates, settings, caches and logs. Files stay in Vercel Blob (lib/storage.ts).
 *
 * Production: Upstash Redis over REST (env KV_REST_API_URL + KV_REST_API_TOKEN from the Vercel Marketplace
 * integration, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Every function below is one Redis command,
 * except deleteRecordsUnder / listRecordKeys (one SCAN per 1000 keys, plus one DEL).
 * Local without those vars: one JSON file, ./.data-records.json (RECORDS_FILE overrides), with the same semantics.
 *
 * Keys mirror the old Blob paths (users/<id>/user.json, courses/index.json, ...). A record is a Redis string holding
 * JSON, except hashes (setHashFields): a user's certificates live in one hash users/<id>/certs, field = certificate id,
 * so a save or delete touches only its own field and two concurrent saves cannot drop each other.
 */

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/** Raw string commands; the remote (Upstash) and local (file) backends implement the same set */
interface Backend {
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  /** Write only if the current value equals `expected` (null: only if the key does not exist). Keeps no TTL unless given. */
  setIfEquals(key: string, value: string, expected: string | null, ttlSec?: number): Promise<boolean>;
  del(keys: string[]): Promise<void>;
  scan(prefix: string): Promise<string[]>;
  type(key: string): Promise<"string" | "hash" | "none">;
  ttl(key: string): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, fields: Record<string, string>): Promise<void>;
  /** HSET of one field only if it still equals `expected` (null: only if the field does not exist) */
  hsetIfEquals(key: string, field: string, value: string, expected: string | null): Promise<boolean>;
  hdel(key: string, fields: string[]): Promise<void>;
  /** INCR; the first increment of a fresh key also sets its expiry */
  incrWindow(key: string, ttlSec: number): Promise<number>;
}

/* ---------- Upstash ---------- */

/*
 * Compare-and-set in one round trip: Redis runs a script atomically, and WATCH/MULTI is not available over REST.
 * Values are compared whole (no redis.sha1hex), which needs only the core Lua API.
 */
const SET_IF_EQUALS = `
local cur = redis.call('GET', KEYS[1])
if ARGV[2] == '0' then
  if cur then return 0 end
elseif cur ~= ARGV[3] then
  return 0
end
if ARGV[4] ~= '' then redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4]) else redis.call('SET', KEYS[1], ARGV[1]) end
return 1`;

const HSET_IF_EQUALS = `
local cur = redis.call('HGET', KEYS[1], ARGV[1])
if ARGV[3] == '0' then
  if cur then return 0 end
elseif cur ~= ARGV[4] then
  return 0
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 1`;

const INCR_WINDOW = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

function upstash(): Backend {
  // raw strings in and out: JSON is (de)serialized here, so what is compared in the scripts is exactly what was stored
  const r = new Redis({ url: url!, token: token!, automaticDeserialization: false });
  return {
    get: (k) => r.get<string>(k),
    mget: async (keys) => (keys.length ? r.mget<(string | null)[]>(...keys) : []),
    set: async (k, v, ttl) => {
      await (ttl ? r.set(k, v, { ex: ttl }) : r.set(k, v));
    },
    setIfEquals: async (k, v, expected, ttl) =>
      Number(await r.eval(SET_IF_EQUALS, [k], [v, expected === null ? "0" : "1", expected ?? "", ttl ? String(ttl) : ""])) === 1,
    del: async (keys) => {
      if (keys.length) await r.del(...keys);
    },
    scan: async (prefix) => {
      const out: string[] = [];
      let cursor = "0";
      do {
        const [next, keys] = await r.scan(cursor, { match: `${prefix.replace(/[*?[\]\\]/g, "\\$&")}*`, count: 1000 });
        // MATCH is a glob; the prefix check keeps a key with glob characters from matching more than its literal prefix
        out.push(...keys.filter((k) => k.startsWith(prefix)));
        cursor = String(next);
      } while (cursor !== "0");
      return [...new Set(out)];
    },
    type: async (k) => (await r.type(k)) as "string" | "hash" | "none",
    ttl: (k) => r.ttl(k),
    hgetall: async (k) => {
      // without automatic deserialization the REST API's flat [field, value, ...] array comes through as is
      const raw = (await r.hgetall(k)) as unknown;
      if (!raw) return {};
      if (!Array.isArray(raw)) return raw as Record<string, string>;
      const out: Record<string, string> = {};
      for (let i = 0; i < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
      return out;
    },
    hget: (k, f) => r.hget<string>(k, f),
    hset: async (k, fields) => {
      if (Object.keys(fields).length) await r.hset(k, fields);
    },
    hsetIfEquals: async (k, f, v, expected) =>
      Number(await r.eval(HSET_IF_EQUALS, [k], [f, v, expected === null ? "0" : "1", expected ?? ""])) === 1,
    hdel: async (k, fields) => {
      if (fields.length) await r.hdel(k, ...fields);
    },
    incrWindow: async (k, ttl) => Number(await r.eval(INCR_WINDOW, [k], [String(ttl)])),
  };
}

/* ---------- local file ---------- */

type LocalEntry = { s: string; exp?: number } | { h: Record<string, string>; exp?: number };

/*
 * The whole store in memory, written through to one JSON file. Every operation runs synchronously between awaits,
 * so a compare-and-set is atomic within the process, like a Lua script in Redis. The file is re-read when another
 * process (a script, the dev server) changed it.
 */
function localFile(): Backend {
  // a deployment without the Redis env vars must fail loudly, not keep records in a file the next instance never sees
  if (process.env.VERCEL) throw new Error("Records store: KV_REST_API_URL and KV_REST_API_TOKEN are not set on this deployment");
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.RECORDS_FILE || path.join(process.cwd(), ".data-records.json"));
  let data = new Map<string, LocalEntry>();
  let mtime = -1;

  const load = () => {
    let m = 0;
    try {
      m = statSync(/*turbopackIgnore: true*/ file).mtimeMs;
    } catch {
      m = 0;
    }
    if (m === mtime) return;
    data = m ? new Map(Object.entries(JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as Record<string, LocalEntry>)) : new Map();
    mtime = m;
  };
  const save = () => {
    // local development only: the file is never part of a deployment
    mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(/*turbopackIgnore: true*/ tmp, JSON.stringify(Object.fromEntries(data)));
    renameSync(/*turbopackIgnore: true*/ tmp, file);
    mtime = statSync(/*turbopackIgnore: true*/ file).mtimeMs;
  };
  const live = (k: string): LocalEntry | undefined => {
    load();
    const e = data.get(k);
    if (e?.exp && e.exp <= Date.now()) {
      data.delete(k);
      return undefined;
    }
    return e;
  };
  const str = (k: string) => {
    const e = live(k);
    if (e && "h" in e) throw new Error(`WRONGTYPE ${k} is a hash`);
    return e ? e.s : null;
  };
  const hash = (k: string) => {
    const e = live(k);
    if (e && "s" in e) throw new Error(`WRONGTYPE ${k} is not a hash`);
    return e ? e.h : null;
  };
  const exp = (ttl?: number) => (ttl ? Date.now() + ttl * 1000 : undefined);

  return {
    get: async (k) => str(k),
    mget: async (keys) => keys.map((k) => {
      const e = live(k);
      return e && "s" in e ? e.s : null;
    }),
    set: async (k, v, ttl) => {
      load();
      data.set(k, { s: v, exp: exp(ttl) });
      save();
    },
    setIfEquals: async (k, v, expected, ttl) => {
      if (str(k) !== expected) return false;
      data.set(k, { s: v, exp: exp(ttl) });
      save();
      return true;
    },
    del: async (keys) => {
      load();
      for (const k of keys) data.delete(k);
      save();
    },
    scan: async (prefix) => {
      load();
      return [...data.keys()].filter((k) => k.startsWith(prefix) && live(k));
    },
    type: async (k) => {
      const e = live(k);
      return !e ? "none" : "h" in e ? "hash" : "string";
    },
    ttl: async (k) => {
      const e = live(k);
      return !e ? -2 : e.exp ? Math.ceil((e.exp - Date.now()) / 1000) : -1;
    },
    hgetall: async (k) => ({ ...(hash(k) ?? {}) }),
    hget: async (k, f) => hash(k)?.[f] ?? null,
    hset: async (k, fields) => {
      const h = hash(k) ?? {};
      data.set(k, { h: { ...h, ...fields } });
      save();
    },
    hsetIfEquals: async (k, f, v, expected) => {
      const h = hash(k) ?? {};
      if ((h[f] ?? null) !== expected) return false;
      data.set(k, { h: { ...h, [f]: v } });
      save();
      return true;
    },
    hdel: async (k, fields) => {
      const h = hash(k);
      if (!h) return;
      const next = { ...h };
      for (const f of fields) delete next[f];
      if (Object.keys(next).length) data.set(k, { h: next });
      else data.delete(k);
      save();
    },
    incrWindow: async (k, ttl) => {
      const e = live(k);
      const n = (e && "s" in e ? Number(e.s) : 0) + 1;
      data.set(k, { s: String(n), exp: e ? e.exp : exp(ttl) });
      save();
      return n;
    },
  };
}

/* one backend per process: route bundles can hold separate copies of this module, and the local one caches the file */
type Holder = { backend?: Backend };
const holder: Holder = ((globalThis as { __medsertiRecords?: Holder }).__medsertiRecords ??= {});
const db = (): Backend => (holder.backend ??= url && token ? upstash() : localFile());

/** "redis" in production, "local" with the file fallback */
export const recordsBackend = () => (url && token ? "redis" : "local");

/** STORAGE_TRACE=1 logs every record command, as lib/storage.ts does for Blob operations */
const trace = (cmd: string, key: string) => {
  if (process.env.STORAGE_TRACE) console.log(`[records] ${cmd} ${key}`);
};

const parse = <T>(s: string | null): T | null => (s === null ? null : (JSON.parse(s) as T));

/* ---------- plain records ---------- */

export type RecordOpts = { ttlSec?: number };

export async function getRecord<T>(key: string): Promise<T | null> {
  trace("get", key);
  return parse<T>(await db().get(key));
}

/** Several records in one command (MGET); null where missing */
export async function getRecords<T>(keys: string[]): Promise<(T | null)[]> {
  if (!keys.length) return [];
  trace("mget", `${keys[0]} (${keys.length})`);
  return (await db().mget(keys)).map((s) => parse<T>(s));
}

export async function setRecord(key: string, value: unknown, opts: RecordOpts = {}): Promise<void> {
  trace("set", key);
  await db().set(key, JSON.stringify(value), opts.ttlSec);
}

export async function deleteRecords(keys: string[]): Promise<void> {
  if (!keys.length) return;
  trace("del", `${keys[0]} (${keys.length})`);
  await db().del(keys);
}

/** Keys under a prefix (SCAN; for scripts, deletes and the backup, never on a page view) */
export async function listRecordKeys(prefix: string): Promise<string[]> {
  trace("scan", prefix);
  return (await db().scan(prefix)).sort();
}

/** Delete every record whose key starts with prefix (a whole account) */
export async function deleteRecordsUnder(prefix: string): Promise<void> {
  if (!prefix) throw new Error("deleteRecordsUnder: empty prefix");
  await deleteRecords(await listRecordKeys(prefix));
}

/* ---------- conditional writes ---------- */

/** A record plus an opaque tag of the version read, for setRecordIfMatch */
export async function getRecordTagged<T>(key: string): Promise<{ value: T; tag: string } | null> {
  trace("get", key);
  const s = await db().get(key);
  return s === null ? null : { value: JSON.parse(s) as T, tag: s };
}

/**
 * Write only if the record still has the version read (tag from getRecordTagged), or with tag null, only if it does
 * not exist yet. Returns false when another write got there first: read again and retry.
 */
export async function setRecordIfMatch(key: string, value: unknown, tag: string | null, opts: RecordOpts = {}): Promise<boolean> {
  trace("cas", key);
  return db().setIfEquals(key, JSON.stringify(value), tag, opts.ttlSec);
}

const TRIES = 10;

/**
 * Read-modify-write that never drops a concurrent update: `change` gets the current value (null when missing) and
 * returns the new one, or undefined to leave the record as it is. Retried on a conflict. Returns what is stored.
 */
export async function updateRecord<T>(key: string, change: (cur: T | null) => T | undefined, opts: RecordOpts = {}): Promise<T | null> {
  for (let i = 0; i < TRIES; i++) {
    const cur = await getRecordTagged<T>(key);
    const next = change(cur?.value ?? null);
    if (next === undefined) return cur?.value ?? null;
    if (await setRecordIfMatch(key, next, cur?.tag ?? null, opts)) return next;
    await new Promise((r) => setTimeout(r, 10 + Math.random() * 30 * (i + 1)));
  }
  throw new Error(`updateRecord ${key}: too many concurrent writes`);
}

/* ---------- hashes: many small records under one key, each field written on its own ---------- */

export async function getHash<T>(key: string): Promise<Record<string, T>> {
  trace("hgetall", key);
  const h = await db().hgetall(key);
  return Object.fromEntries(Object.entries(h).map(([f, s]) => [f, JSON.parse(s) as T]));
}

export async function getHashField<T>(key: string, field: string): Promise<T | null> {
  trace("hget", `${key} ${field}`);
  return parse<T>(await db().hget(key, field));
}

export async function setHashFields(key: string, fields: Record<string, unknown>): Promise<void> {
  if (!Object.keys(fields).length) return;
  trace("hset", key);
  await db().hset(key, Object.fromEntries(Object.entries(fields).map(([f, v]) => [f, JSON.stringify(v)])));
}

export async function deleteHashFields(key: string, fields: string[]): Promise<void> {
  if (!fields.length) return;
  trace("hdel", key);
  await db().hdel(key, fields);
}

/* ---------- counters ---------- */

/** Increment a counter that expires ttlSec after its first increment (a fixed window); returns the new count */
export async function incrementWindow(key: string, ttlSec: number): Promise<number> {
  trace("incr", key);
  return db().incrWindow(key, Math.max(1, Math.ceil(ttlSec)));
}

/* ---------- raw access for the backup, the restore and the migration ---------- */

export type RawRecord = { type: "string"; value: string; ttl?: number } | { type: "hash"; value: Record<string, string>; ttl?: number };

/** One key as stored, with its remaining TTL in seconds (absent when it has none); null when missing */
export async function readRaw(key: string): Promise<RawRecord | null> {
  const b = db();
  const [type, ttl] = await Promise.all([b.type(key), b.ttl(key)]);
  const t = ttl > 0 ? { ttl } : {};
  if (type === "string") {
    const value = await b.get(key);
    return value === null ? null : { type, value, ...t };
  }
  if (type === "hash") return { type, value: await b.hgetall(key), ...t };
  return null;
}

/** Write one key as stored (replacing it whole) */
export async function writeRaw(key: string, rec: RawRecord): Promise<void> {
  const b = db();
  if (rec.type === "string") return b.set(key, rec.value, rec.ttl);
  await b.del([key]);
  await b.hset(key, rec.value);
}

/** Raw compare-and-set for the migration: write a string or a hash field only if it still holds `expected` */
export async function setRawIfEquals(key: string, field: string | null, value: string, expected: string | null, ttlSec?: number): Promise<boolean> {
  return field === null ? db().setIfEquals(key, value, expected, ttlSec) : db().hsetIfEquals(key, field, value, expected);
}

/** Raw read of a string or one hash field */
export async function getRaw(key: string, field: string | null): Promise<string | null> {
  return field === null ? db().get(key) : db().hget(key, field);
}

/** Raw delete of a string or one hash field */
export async function deleteRaw(key: string, field: string | null): Promise<void> {
  return field === null ? db().del([key]) : db().hdel(key, [field]);
}
