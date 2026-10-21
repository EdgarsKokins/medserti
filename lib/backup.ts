import "server-only";
import { createHash } from "crypto";
import { AwsClient } from "aws4fetch";
import { getBytes, listPaths } from "./storage";

/**
 * Weekly off-site copy of the whole Blob store (accounts, certificates, files, settings)
 * into a Cloudflare R2 bucket in the EU, under YYYY-MM-DD/<pathname>.
 * Every object is read back and its sha256 compared, so a finished run is a tested restore source.
 * The last KEEP copies are kept; older ones are deleted, so deleted accounts drop out within KEEP weeks.
 */
export const KEEP = 8;

const sha = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");

function client() {
  const endpoint = process.env.BACKUP_S3_ENDPOINT?.replace(/\/+$/, "");
  const bucket = process.env.BACKUP_S3_BUCKET;
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const url = (key = "", query = "") => `${endpoint}/${bucket}${key ? `/${key.split("/").map(encodeURIComponent).join("/")}` : ""}${query}`;
  return { aws, url };
}

async function ok(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** All keys (or common prefixes, with a delimiter) under a prefix, following continuation tokens */
async function listKeys(c: NonNullable<ReturnType<typeof client>>, prefix: string, delimiter?: string) {
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

export interface BackupResult {
  date: string;
  files: number;
  bytes: number;
  verified: number;
  pruned: string[];
}

export async function runBackup(now = new Date()): Promise<BackupResult> {
  const c = client();
  if (!c) throw new Error("Backup is not configured (BACKUP_S3_* env vars)");
  const date = now.toISOString().slice(0, 10);

  const paths = await listPaths("");
  const manifest: { path: string; size: number; sha256: string; contentType: string }[] = [];
  for (const path of paths) {
    const file = await getBytes(path);
    if (!file) continue; // deleted between list and read
    const hash = sha(file.data);
    await ok(
      await c.aws.fetch(c.url(`${date}/${path}`), {
        method: "PUT",
        body: new Uint8Array(file.data),
        headers: { "Content-Type": file.contentType || "application/octet-stream" },
      }),
      `put ${path}`,
    );
    manifest.push({ path, size: file.data.length, sha256: hash, contentType: file.contentType });
  }

  // read every object back: a copy we have not read is not a backup
  let verified = 0;
  for (const m of manifest) {
    const back = new Uint8Array(await (await ok(await c.aws.fetch(c.url(`${date}/${m.path}`)), `get ${m.path}`)).arrayBuffer());
    if (sha(back) !== m.sha256) throw new Error(`verify failed for ${m.path}`);
    verified++;
  }
  await ok(
    await c.aws.fetch(c.url(`${date}/manifest.json`), {
      method: "PUT",
      body: JSON.stringify({ createdAt: now.toISOString(), files: manifest }, null, 1),
      headers: { "Content-Type": "application/json" },
    }),
    "put manifest",
  );

  // keep the newest KEEP dated copies
  const { prefixes } = await listKeys(c, "", "/");
  const dated = prefixes.map((p) => p.replace(/\/$/, "")).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)).sort();
  const pruned = dated.slice(0, Math.max(0, dated.length - KEEP));
  for (const old of pruned) {
    const { keys } = await listKeys(c, `${old}/`);
    for (const k of keys) await ok(await c.aws.fetch(c.url(k), { method: "DELETE" }), `delete ${k}`);
  }

  return { date, files: manifest.length, bytes: manifest.reduce((a, m) => a + m.size, 0), verified, pruned };
}
