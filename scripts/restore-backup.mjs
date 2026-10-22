#!/usr/bin/env node
/**
 * Restore one weekly backup snapshot (lib/backup.ts) from R2: uploaded files into a Vercel Blob store or a local
 * folder, and records into Upstash Redis or a local records file.
 *
 * Each snapshot YYYY-MM-DD/ in the bucket is a full copy: YYYY-MM-DD/manifest.json lists every file with its size,
 * sha256 and content type, and (since records moved to Redis) the record dump YYYY-MM-DD/records.json with its sha256.
 * Only what the manifest lists is restored, and each object is checked against its sha256 before it is written.
 *
 * Dry run by default: it reads the manifest, checks every listed object exists in R2 with the right size, checks the
 * record dump, and (with a Blob token) lists the target store to show what would be overwritten or left behind.
 * Nothing is written without --write.
 *
 * Env (e.g. from a local file: node --env-file=.env.restore scripts/restore-backup.mjs ...):
 *   BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY  (source)
 *   BLOB_READ_WRITE_TOKEN                                (target for files; not needed with --out)
 *   KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *                                                        (target for records; not needed with --records-out)
 *
 * Usage:
 *   node scripts/restore-backup.mjs                       list snapshots, dry run of the newest
 *   node scripts/restore-backup.mjs --snapshot 2026-10-18 dry run of that snapshot
 *   node scripts/restore-backup.mjs --only users/<id>/    restrict files and records to a key prefix (one account)
 *   node scripts/restore-backup.mjs --out ./.data --records-out ./.data-records.json --write
 *                                                         write to the local dev stores
 *   node scripts/restore-backup.mjs --write               write files into Blob and records into Redis
 *   --files-only / --records-only                         restore just one of the two
 *
 * Files and records in the target that are not in the snapshot are left alone; restore into empty stores for an
 * exact copy. Writing into the production stores overwrites live data: take a fresh backup first.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (flag("--help") || flag("-h")) {
  console.log("Usage: node scripts/restore-backup.mjs [--snapshot YYYY-MM-DD] [--only <prefix>] [--out <dir>] [--write]");
  process.exit(0);
}
const write = flag("--write");
const only = opt("--only") ?? "";
const outDir = opt("--out");
const recordsOut = opt("--records-out");
const doFiles = !flag("--records-only");
const doRecords = !flag("--files-only");
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};
const endpoint = env("BACKUP_S3_ENDPOINT").replace(/\/+$/, "");
const bucket = env("BACKUP_S3_BUCKET");
const aws = new AwsClient({
  accessKeyId: env("BACKUP_S3_ACCESS_KEY_ID"),
  secretAccessKey: env("BACKUP_S3_SECRET_ACCESS_KEY"),
  service: "s3",
  region: "auto",
});
const encodeKey = (key) => key.split("/").map(encodeURIComponent).join("/");
const url = (key = "", query = "") => `${endpoint}/${bucket}${key ? `/${encodeKey(key)}` : ""}${query}`;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const decodeXml = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

async function ok(res, what) {
  if (!res.ok) throw new Error(`${what}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function listKeys(prefix, delimiter) {
  const keys = new Map();
  const prefixes = [];
  let token;
  do {
    const q = new URLSearchParams({ "list-type": "2", prefix, "max-keys": "1000" });
    if (delimiter) q.set("delimiter", delimiter);
    if (token) q.set("continuation-token", token);
    const xml = await (await ok(await aws.fetch(url("", `?${q}`)), "list")).text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = decodeXml(m[1].match(/<Key>([\s\S]*?)<\/Key>/)[1]);
      keys.set(key, Number(m[1].match(/<Size>(\d+)<\/Size>/)?.[1] ?? -1));
    }
    for (const m of xml.matchAll(/<CommonPrefixes>\s*<Prefix>([\s\S]*?)<\/Prefix>/g)) prefixes.push(decodeXml(m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] : undefined;
  } while (token);
  return { keys, prefixes };
}

async function pool(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// snapshots: dated prefixes; one without a manifest is an unfinished run
const dated = (await listKeys("", "/")).prefixes.map((p) => p.replace(/\/$/, "")).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)).sort();
console.log(`Snapshots in ${bucket}: ${dated.join(", ") || "none"}`);
const getManifest = async (d) => {
  const res = await aws.fetch(url(`${d}/manifest.json`));
  return res.status === 404 ? null : (await ok(res, `get ${d}/manifest.json`)).json();
};
let snapshot = opt("--snapshot");
let manifest;
if (snapshot) {
  manifest = await getManifest(snapshot);
  if (!manifest) throw new Error(`${snapshot} has no manifest.json: unfinished run or no such snapshot`);
} else {
  for (const d of [...dated].reverse()) if ((manifest = await getManifest(d))) { snapshot = d; break; }
  if (!manifest) throw new Error("No complete snapshot found");
}
const files = doFiles ? manifest.files.filter((f) => f.path.startsWith(only)) : [];
const bytes = files.reduce((a, f) => a + f.size, 0);
console.log(`Snapshot ${snapshot} (created ${manifest.createdAt}): ${manifest.files.length} files, restoring ${files.length}${only ? ` under "${only}"` : ""}, ${(bytes / 1e6).toFixed(1)} MB`);

// every listed object must be in R2 with the size the manifest records
const { keys } = await listKeys(`${snapshot}/${only}`);
const bad = files.filter((f) => keys.get(`${snapshot}/${f.path}`) !== f.size);
if (bad.length) {
  for (const f of bad.slice(0, 20)) console.error(`  missing or wrong size in R2: ${f.path}`);
  throw new Error(`${bad.length} files in the manifest are missing or the wrong size in R2`);
}
console.log(`R2 check: all ${files.length} objects present with the manifest size`);

// records: one dump per snapshot, checked against the manifest's sha256 before anything is written
let records = [];
if (doRecords) {
  if (!manifest.records) console.log("No record dump in this snapshot (taken before records moved to Redis): files only");
  else {
    const raw = Buffer.from(await (await ok(await aws.fetch(url(`${snapshot}/${manifest.records.path}`)), `get ${manifest.records.path}`)).arrayBuffer());
    if (sha(raw) !== manifest.records.sha256) throw new Error(`sha256 mismatch for ${manifest.records.path}: not restoring a damaged dump`);
    records = Object.entries(JSON.parse(raw.toString("utf8")).records).filter(([k]) => k.startsWith(only));
    console.log(`Records: ${manifest.records.count} in the dump (sha256 checked), restoring ${records.length}${only ? ` under "${only}"` : ""}`);
    if (!recordsOut && !(redisUrl && redisToken)) {
      if (write && records.length) throw new Error("Set KV_REST_API_URL + KV_REST_API_TOKEN (target Redis) or pass --records-out <file>");
      console.log("No Redis env vars and no --records-out: skipping the record target");
    }
  }
}

let blob;
if (files.length && !outDir) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (write) throw new Error("Set BLOB_READ_WRITE_TOKEN (target store) or pass --out <dir>");
    console.log("No BLOB_READ_WRITE_TOKEN: skipping the target store check");
  } else {
    blob = await import("@vercel/blob");
    const target = new Set();
    let cursor;
    do {
      const page = await blob.list({ prefix: only, cursor, limit: 1000 });
      for (const b of page.blobs) target.add(b.pathname);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    const wanted = new Set(files.map((f) => f.path));
    const overwrite = files.filter((f) => target.has(f.path)).length;
    const extra = [...target].filter((p) => !wanted.has(p));
    console.log(`Target store: ${target.size} files; ${overwrite} would be overwritten, ${files.length - overwrite} created, ${extra.length} not in the snapshot (left as is)`);
  }
}

if (!write) {
  const fileTarget = outDir ? path.resolve(outDir) : "the Blob store";
  const recordTarget = recordsOut ? path.resolve(recordsOut) : "Redis";
  console.log(`Dry run: nothing written. Add --write to restore files into ${fileTarget} and records into ${recordTarget}.`);
  process.exit(0);
}

let done = 0;
await pool(files, 4, async (f) => {
  const data = Buffer.from(await (await ok(await aws.fetch(url(`${snapshot}/${f.path}`)), `get ${f.path}`)).arrayBuffer());
  if (sha(data) !== f.sha256) throw new Error(`sha256 mismatch for ${f.path}: not restoring a damaged file`);
  if (outDir) {
    const p = path.join(outDir, f.path);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  } else {
    await blob.put(f.path, data, { access: "private", contentType: f.contentType, addRandomSuffix: false, allowOverwrite: true });
  }
  if (++done % 100 === 0) console.log(`  ${done}/${files.length}`);
});
console.log(`Restored ${done} files from ${snapshot}, each sha256-verified.`);

if (records.length) {
  if (recordsOut) {
    // the local store's format (lib/records.ts localFile): key -> { s } for a string, { h } for a hash, exp in ms
    let store = {};
    try {
      store = JSON.parse(await readFile(recordsOut, "utf8"));
    } catch {}
    const now = Date.now();
    for (const [k, r] of records) {
      const exp = r.ttl ? { exp: now + r.ttl * 1000 } : {};
      store[k] = r.type === "hash" ? { h: r.value, ...exp } : { s: r.value, ...exp };
    }
    await mkdir(path.dirname(path.resolve(recordsOut)), { recursive: true });
    await writeFile(recordsOut, JSON.stringify(store));
  } else {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url: redisUrl, token: redisToken, automaticDeserialization: false });
    await pool(records, 4, async ([k, r]) => {
      if (r.type === "hash") {
        await redis.del(k);
        await redis.hset(k, r.value);
      } else if (r.ttl) await redis.set(k, r.value, { ex: r.ttl });
      else await redis.set(k, r.value);
    });
  }
  console.log(`Restored ${records.length} records from ${snapshot} into ${recordsOut ? path.resolve(recordsOut) : "Redis"}.`);
}
