import "server-only";
import { createHash } from "crypto";
import { AwsClient } from "aws4fetch";
import { getBytes, listVersions } from "./storage";

/**
 * Weekly off-site copy of the whole Blob store (accounts, certificates, files, settings)
 * into a Cloudflare R2 bucket in the EU, under YYYY-MM-DD/<pathname>, plus YYYY-MM-DD/manifest.json.
 *
 * Incremental: the store is listed once (listVersions), and only paths whose version is new or changed
 * since the last complete snapshot are read from Vercel Blob. Unchanged paths are copied inside R2
 * (CopyObject from last week's prefix), which costs no Vercel reads. So every dated prefix is still a
 * full, self-contained copy of the store, restorable on its own (scripts/restore-backup.mjs).
 *
 * Every object in the new snapshot is read back from R2 and its sha256 compared, so a finished run is a
 * tested restore source. The manifest is written last: a prefix without one is an unfinished run and is
 * never used as a copy source. The last KEEP prefixes are kept; older ones are deleted whole, so deleted
 * accounts drop out within KEEP weeks.
 */
const KEEP = 8;
/** objects copied or verified in parallel */
const CONCURRENCY = 8;

const sha = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");
const DATED = /^\d{4}-\d{2}-\d{2}$/;

type Client = { aws: AwsClient; bucket: string; url: (key?: string, query?: string) => string };

function client(): Client | null {
  const endpoint = process.env.BACKUP_S3_ENDPOINT?.replace(/\/+$/, "");
  const bucket = process.env.BACKUP_S3_BUCKET;
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const url = (key = "", query = "") => `${endpoint}/${bucket}${key ? `/${encodeKey(key)}` : ""}${query}`;
  return { aws, bucket, url };
}

const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

async function ok(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** All keys (or common prefixes, with a delimiter) under a prefix, following continuation tokens */
async function listKeys(c: Client, prefix: string, delimiter?: string) {
  const keys: string[] = [];
  const prefixes: string[] = [];
  let token: string | undefined;
  do {
    const q = new URLSearchParams({ "list-type": "2", prefix, "max-keys": "1000" });
    if (delimiter) q.set("delimiter", delimiter);
    if (token) q.set("continuation-token", token);
    const xml = await (await ok(await c.aws.fetch(c.url("", `?${q}`)), "list")).text();
    for (const m of xml.matchAll(/<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>/g)) keys.push(decodeXml(m[1]));
    for (const m of xml.matchAll(/<CommonPrefixes>\s*<Prefix>([\s\S]*?)<\/Prefix>/g)) prefixes.push(decodeXml(m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] : undefined;
  } while (token);
  return { keys, prefixes };
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

async function put(c: Client, key: string, body: Uint8Array<ArrayBuffer>, contentType: string) {
  await ok(
    await c.aws.fetch(c.url(key), {
      method: "PUT",
      body,
      // R2 rejects uploads without an explicit length
      headers: { "Content-Type": contentType || "application/octet-stream", "Content-Length": String(body.length) },
    }),
    `put ${key}`,
  );
}

/** Server-side copy inside the bucket: no bytes pass through us and Vercel Blob is not touched */
async function copy(c: Client, from: string, to: string) {
  const res = await ok(
    await c.aws.fetch(c.url(to), {
      method: "PUT",
      headers: { "x-amz-copy-source": `/${c.bucket}/${encodeKey(from)}`, "Content-Length": "0" },
    }),
    `copy ${from}`,
  );
  // S3 can report a failed copy as 200 with an <Error> body
  const body = await res.text();
  if (/<Error>/.test(body)) throw new Error(`copy ${from}: ${body.slice(0, 200)}`);
}

/** Runs fn over items with at most `limit` in flight; rejects on the first failure */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

interface ManifestEntry {
  path: string;
  /** listVersions tag (`<uploadedAt ms>:<size>`) the copy was taken at; absent in pre-incremental manifests */
  version?: string;
  size: number;
  sha256: string;
  contentType: string;
}

interface Manifest {
  createdAt: string;
  files: ManifestEntry[];
}

/** Newest complete snapshot (one with a manifest) older than or equal to `date` */
async function previousSnapshot(c: Client, dated: string[], date: string): Promise<{ date: string; byPath: Map<string, ManifestEntry> } | null> {
  for (const d of [...dated].filter((p) => p <= date).sort().reverse()) {
    const res = await c.aws.fetch(c.url(`${d}/manifest.json`));
    if (res.status === 404) continue; // unfinished run
    const m = (await (await ok(res, `get ${d}/manifest.json`)).json()) as Manifest;
    return { date: d, byPath: new Map(m.files.map((f) => [f.path, f])) };
  }
  return null;
}

async function datedPrefixes(c: Client) {
  const { prefixes } = await listKeys(c, "", "/");
  return prefixes.map((p) => p.replace(/\/$/, "")).filter((p) => DATED.test(p)).sort();
}

interface BackupResult {
  date: string;
  /** snapshot unchanged files were copied from; null on a full run */
  base: string | null;
  files: number;
  bytes: number;
  /** files read from Vercel Blob this run (each is one simple operation) */
  blobReads: number;
  /** read from Vercel Blob and uploaded: new or changed since `base` */
  uploaded: number;
  /** copied inside R2 from `base` */
  unchanged: number;
  /** unchanged files whose R2 copy failed and were read from Blob instead (counted in uploaded); should be 0 */
  copyFallbacks: number;
  verified: number;
  pruned: string[];
}

export async function runBackup(now = new Date()): Promise<BackupResult> {
  const c = client();
  if (!c) throw new Error("Backup is not configured (BACKUP_S3_* env vars)");
  const date = now.toISOString().slice(0, 10);

  // error and feedback logs are kept 30 days (lib/monitoring); a backup kept 8 weeks would outlive that
  const current = (await listVersions("")).filter(({ path }) => !/^(errors|feedback)\//.test(path));
  const prev = await previousSnapshot(c, await datedPrefixes(c), date);

  const files: ManifestEntry[] = [];
  let blobReads = 0;
  let uploaded = 0;
  let unchanged = 0;
  let copyFallbacks = 0;

  const upload = async (path: string, version: string) => {
    blobReads++;
    const file = await getBytes(path);
    if (!file) return; // deleted between list and read
    await put(c, `${date}/${path}`, new Uint8Array(file.data), file.contentType);
    files.push({ path, version, size: file.data.length, sha256: sha(file.data), contentType: file.contentType });
    uploaded++;
  };

  await pool(current, CONCURRENCY, async ({ path, version }) => {
    const old = prev?.byPath.get(path);
    if (!prev || !old || old.version !== version) return upload(path, version);
    // a rerun on the same day finds its own objects already in place
    if (prev.date !== date) {
      try {
        await copy(c, `${prev.date}/${path}`, `${date}/${path}`);
      } catch (err) {
        // source missing or unreadable in R2: take it from Blob instead of failing the run
        console.warn("backup: copy failed, reading from Blob", path, err);
        copyFallbacks++;
        return upload(path, version);
      }
    }
    files.push(old);
    unchanged++;
  });

  // read every object back: a copy we have not read is not a backup. R2 reads cost no Vercel quota.
  let verified = 0;
  await pool(files, CONCURRENCY, async (f) => {
    const back = new Uint8Array(await (await ok(await c.aws.fetch(c.url(`${date}/${f.path}`)), `get ${f.path}`)).arrayBuffer());
    if (sha(back) !== f.sha256) throw new Error(`verify failed for ${f.path}`);
    verified++;
  });

  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest: Manifest = { createdAt: now.toISOString(), files };
  await put(c, `${date}/manifest.json`, new Uint8Array(Buffer.from(JSON.stringify(manifest, null, 1))), "application/json");

  // keep the newest KEEP dated copies; each is self-contained, so whole prefixes can go
  const dated = await datedPrefixes(c);
  const pruned = dated.slice(0, Math.max(0, dated.length - KEEP));
  for (const old of pruned) {
    const { keys } = await listKeys(c, `${old}/`);
    await pool(keys, CONCURRENCY, async (k) => {
      await ok(await c.aws.fetch(c.url(k), { method: "DELETE" }), `delete ${k}`);
    });
  }

  return {
    date,
    base: prev?.date ?? null,
    files: files.length,
    bytes: files.reduce((a, f) => a + f.size, 0),
    blobReads,
    uploaded,
    unchanged,
    copyFallbacks,
    verified,
    pruned,
  };
}
