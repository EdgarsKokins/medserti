#!/usr/bin/env node
/**
 * Restore one weekly backup snapshot (lib/backup.ts) from R2 into a Vercel Blob store or a local folder.
 *
 * Each snapshot YYYY-MM-DD/ in the bucket is a full copy of the store; YYYY-MM-DD/manifest.json lists
 * every file with its size, sha256 and content type. Only files in the manifest are restored, and each
 * one is checked against its sha256 before it is written.
 *
 * Dry run by default: it reads the manifest, checks every listed object exists in R2 with the right size,
 * and (with a Blob token) lists the target store to show what would be overwritten or left behind.
 * Nothing is written without --write.
 *
 * Env (e.g. from a local file: node --env-file=.env.restore scripts/restore-backup.mjs ...):
 *   BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY  (source)
 *   BLOB_READ_WRITE_TOKEN  (target store; not needed with --out)
 *
 * Usage:
 *   node scripts/restore-backup.mjs                       list snapshots, dry run of the newest
 *   node scripts/restore-backup.mjs --snapshot 2026-10-18 dry run of that snapshot
 *   node scripts/restore-backup.mjs --only users/<id>/    restrict to paths under a prefix (one account)
 *   node scripts/restore-backup.mjs --out ./.data --write write files to a folder (the local dev store)
 *   node scripts/restore-backup.mjs --write               write into the Blob store of BLOB_READ_WRITE_TOKEN
 *
 * Files in the target that are not in the snapshot are left alone; restore into an empty store for an
 * exact copy. Writing into the production store overwrites live data: take a fresh backup first.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
const files = manifest.files.filter((f) => f.path.startsWith(only));
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

let blob;
if (!outDir) {
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
  console.log(`Dry run: nothing written. Add --write to restore into ${outDir ? path.resolve(outDir) : "the Blob store"}.`);
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
