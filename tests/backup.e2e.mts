// End-to-end test of lib/backup.ts and scripts/restore-backup.mjs against an in-memory S3 server,
// with the local ./.data storage mode standing in for Vercel Blob and the local records file for Redis.
// Runs in a fresh temp dir, so it never touches this checkout's .data. No network, no real credentials.
//   npx tsx --conditions=react-server tests/backup.e2e.mts
import http from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync, utimesSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// storage.ts picks its root from the cwd at import time, so move first
const tmp = mkdtempSync(path.join(os.tmpdir(), "backup-e2e-"));
process.chdir(tmp);
delete process.env.BLOB_READ_WRITE_TOKEN;
const ROOT = path.join(tmp, ".data");
const RECORDS = path.join(tmp, ".data-records.json");
process.env.RECORDS_FILE = RECORDS;
/** only uploaded files are backed up from Blob; JSON left there from before Redis is not */
const IS_FILE = /^users\/[^/]+\/files\//;

/* ---------- fake S3 (path-style, one bucket) ---------- */
const objects = new Map<string, { body: Buffer; type: string }>();
const ops = { put: 0, copy: 0, get: 0, list: 0, del: 0 };
let corruptNextCopy = false;
const PAGE = 3; // tiny pages to exercise continuation tokens
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url!, "http://x");
  const parts = u.pathname.split("/").slice(1);
  assert.equal(parts[0], "bkt");
  assert.match(String(req.headers.authorization), /^AWS4-HMAC-SHA256/);
  const key = parts.slice(1).map(decodeURIComponent).join("/");
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = Buffer.concat(chunks);
  if (req.method === "GET" && !key) {
    ops.list++;
    const prefix = u.searchParams.get("prefix") ?? "";
    const delim = u.searchParams.get("delimiter");
    const start = Number(u.searchParams.get("continuation-token") ?? 0);
    const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    const items: { k: string; p: boolean }[] = [];
    const seen = new Set<string>();
    for (const k of all) {
      const rest = k.slice(prefix.length);
      const i = delim ? rest.indexOf(delim) : -1;
      if (i >= 0) {
        const p = prefix + rest.slice(0, i + 1);
        if (!seen.has(p)) (seen.add(p), items.push({ k: p, p: true }));
      } else items.push({ k, p: false });
    }
    const page = items.slice(start, start + PAGE);
    const more = start + PAGE < items.length;
    res.end(
      `<ListBucketResult><IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${start + PAGE}</NextContinuationToken>` : ""}` +
        page.map((i) => (i.p ? `<CommonPrefixes><Prefix>${esc(i.k)}</Prefix></CommonPrefixes>` : `<Contents><Key>${esc(i.k)}</Key><Size>${objects.get(i.k)!.body.length}</Size></Contents>`)).join("") +
        `</ListBucketResult>`,
    );
  } else if (req.method === "PUT" && req.headers["x-amz-copy-source"]) {
    ops.copy++;
    const src = String(req.headers["x-amz-copy-source"]).split("/").slice(2).map(decodeURIComponent).join("/");
    const o = objects.get(src);
    if (!o) return ((res.statusCode = 404), res.end("<Error><Code>NoSuchKey</Code></Error>"));
    objects.set(key, corruptNextCopy ? { body: Buffer.from("corrupt"), type: o.type } : { ...o });
    corruptNextCopy = false;
    res.end("<CopyObjectResult/>");
  } else if (req.method === "PUT") {
    ops.put++;
    assert.equal(Number(req.headers["content-length"]), body.length);
    objects.set(key, { body, type: String(req.headers["content-type"]) });
    res.end();
  } else if (req.method === "GET") {
    ops.get++;
    const o = objects.get(key);
    if (!o) return ((res.statusCode = 404), res.end("<Error><Code>NoSuchKey</Code></Error>"));
    res.setHeader("content-type", o.type);
    res.end(o.body);
  } else if (req.method === "DELETE") {
    ops.del++;
    objects.delete(key);
    res.statusCode = 204;
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
Object.assign(process.env, {
  BACKUP_S3_ENDPOINT: `http://127.0.0.1:${port}/`,
  BACKUP_S3_BUCKET: "bkt",
  BACKUP_S3_ACCESS_KEY_ID: "test",
  BACKUP_S3_SECRET_ACCESS_KEY: "test",
  STORAGE_TRACE: "1",
});

/* ---------- local "Blob store" helpers, with a read counter from STORAGE_TRACE ---------- */
let blobGets = 0;
const log = console.log;
console.log = (...a: unknown[]) => (String(a[0]).startsWith("[storage] get") ? blobGets++ : /^\[(storage|records)\]/.test(String(a[0])) ? 0 : log(...a));
let tick = Date.now() - 1e9;
const write = (p: string, data: string | Buffer) => {
  const f = path.join(ROOT, p);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, data);
  const t = new Date((tick += 1000)); // distinct mtimes, as uploadedAt would be
  utimesSync(f, t, t);
};
const storeFiles = (): Map<string, Buffer> => {
  const out = new Map<string, Buffer>();
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const f = path.join(d, e);
      if (statSync(f).isDirectory()) walk(f);
      else out.set(path.relative(ROOT, f).split(path.sep).join("/"), readFileSync(f));
    }
  };
  walk(ROOT);
  for (const k of [...out.keys()]) if (!IS_FILE.test(k)) out.delete(k);
  return out;
};
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
/** the snapshot under `date` holds exactly the store, byte for byte, and its manifest agrees */
const assertSnapshotEqualsStore = (date: string) => {
  const store = storeFiles();
  const manifest = JSON.parse(objects.get(`${date}/manifest.json`)!.body.toString());
  assert.deepEqual(manifest.files.map((f: { path: string }) => f.path).sort(), [...store.keys()].sort());
  for (const f of manifest.files) {
    assert.ok(f.version, `version recorded for ${f.path}`);
    assert.equal(f.sha256, sha(store.get(f.path)!));
    assert.ok(objects.get(`${date}/${f.path}`)!.body.equals(store.get(f.path)!), `${date}/${f.path} matches store`);
  }
  const keys = [...objects.keys()].filter((k) => k.startsWith(`${date}/`) && k !== `${date}/manifest.json` && k !== `${date}/records.json`);
  assert.equal(keys.length, store.size, "no stray objects in snapshot");
  // the record dump: every record but the short-lived ones, as stored, sha-checked in the manifest
  const dump = objects.get(`${date}/records.json`)!.body;
  assert.equal(manifest.records.sha256, sha(dump));
  assert.equal(manifest.records.size, dump.length);
  const rec = JSON.parse(dump.toString()).records;
  assert.deepEqual(Object.keys(rec).sort(), wantRecords());
  assert.equal(manifest.records.count, wantRecords().length);
};
const day = (n: number) => new Date(Date.UTC(2026, 0, 4 + 7 * n, 1)); // Sundays
const ds = (n: number) => day(n).toISOString().slice(0, 10);
const reset = () => ((blobGets = 0), Object.keys(ops).forEach((k) => (ops[k as keyof typeof ops] = 0)));

const { runBackup } = await import(path.join(repo, "lib/backup.ts"));
const records = await import(path.join(repo, "lib/records.ts"));
/** record keys a snapshot should hold: all but errors/, feedback/, rate-limits/, reset-tokens/ */
const wantRecords = () => JSON.parse(readFileSync(RECORDS, "utf8")) && Object.keys(JSON.parse(readFileSync(RECORDS, "utf8"))).filter((k) => !/^(errors|feedback|rate-limits|reset-tokens)\//.test(k)).sort();
const results: string[] = [];
const run = async (n: number, label: string) => {
  reset();
  const r = await runBackup(day(n));
  assert.equal(r.blobReads, blobGets, "reported reads = actual storage reads");
  results.push(`${label}: ${JSON.stringify(r)} | blob gets ${blobGets} | r2 ${JSON.stringify(ops)}`);
  return r;
};

/* ---------- seed: 20 files incl. awkward names, legacy JSON blobs, records ---------- */
console.warn = () => {}; // the expected copy-fallback warning in step 6
for (let i = 0; i < 18; i++) write(`users/u${i % 4}/files/c${i}.pdf`, JSON.stringify({ i }));
write("users/u1/files/āž b & c.pdf", Buffer.from([0, 1, 2, 255]));
write("users/u3/files/c99/scan.jpg", "{}");
// left in Blob from before Redis: never backed up again
write("users/u0/user.json", "{}");
write("i18n/overrides.json", "{}");
await records.setRecord("users/u0/user.json", { id: "u0", email: "a@b.lv" });
await records.setRecord("users/index/abc.json", { userId: "u0" });
await records.setHashFields("users/u0/certs", { c0: { id: "c0", title: "Ā ж" }, c1: { id: "c1" } });
await records.setRecord("users/u3/user.json", { id: "u3" });
await records.setHashFields("users/u3/certs", { c3: { id: "c3" } });
await records.setRecord("i18n/overrides.json", { lv: { "x.y": "Teksts" }, en: {}, ru: {} });
await records.setRecord("courses/details/application-1.json", { fetchedAt: "x" }, { ttlSec: 86_400 });
await records.setRecord("errors/2026-01-04.json", { day: "2026-01-04" }, { ttlSec: 86_400 });
await records.setRecord("reset-tokens/t.json", { userId: "u0" }, { ttlSec: 3600 });
await records.incrementWindow("rate-limits/r", 3600);

// 1. pre-incremental manifest (old format, no version) as week 0: first run must read everything
objects.set(`${ds(0)}/manifest.json`, { body: Buffer.from(JSON.stringify({ createdAt: "x", files: [...storeFiles()].map(([p, b]) => ({ path: p, size: b.length, sha256: sha(b), contentType: "application/json" })) })), type: "application/json" });
for (const [p, b] of storeFiles()) objects.set(`${ds(0)}/${p}`, { body: b, type: "application/json" });
let r = await run(1, "1 full (old manifest)");
assert.equal(r.base, ds(0));
assert.deepEqual([r.files, r.blobReads, r.uploaded, r.unchanged, r.verified], [20, 20, 20, 0, 20]);
assertSnapshotEqualsStore(ds(1));

// 2. nothing changed: zero Blob reads, everything copied inside R2 and verified; 2 puts: the record dump and the manifest
r = await run(2, "2 no change");
assert.deepEqual([r.files, r.blobReads, r.uploaded, r.unchanged, r.verified, ops.copy, ops.put], [20, 0, 0, 20, 20, 20, 2]);
assertSnapshotEqualsStore(ds(2));

// 3. one changed, one new, one deleted
write("users/u0/files/c0.pdf", JSON.stringify({ i: 0, edited: true }));
write("users/u9/files/new.pdf", "{}");
rmSync(path.join(ROOT, "users/u3/files/c3.pdf"));
await records.setRecord("users/u9/user.json", { id: "u9" });
r = await run(3, "3 1 changed, 1 new, 1 deleted");
assert.deepEqual([r.files, r.blobReads, r.uploaded, r.unchanged, r.verified], [20, 2, 2, 18, 20]);
assertSnapshotEqualsStore(ds(3));
assert.ok(objects.has(`${ds(2)}/users/u3/files/c3.pdf`), "older snapshot still restorable as it was");

// 4. same-day rerun: no reads, no copies (objects already in place), still verified
r = await run(3, "4 same-day rerun");
assert.deepEqual([r.blobReads, r.unchanged, r.verified, ops.copy], [0, 20, 20, 0]);

// 5. an unfinished newer run (no manifest) is skipped as a base
objects.set(`${ds(4)}/users/u0/files/c0.pdf`, { body: Buffer.from("partial"), type: "application/json" });
r = await run(5, "5 after unfinished run");
assert.equal(r.base, ds(3));
assert.equal(r.blobReads, 0);
assertSnapshotEqualsStore(ds(5));

// 6. a copy source missing in R2 falls back to a Blob read
objects.delete(`${ds(5)}/users/u2/files/c2.pdf`);
r = await run(6, "6 missing copy source");
assert.deepEqual([r.blobReads, r.uploaded, r.unchanged, r.copyFallbacks], [1, 1, 19, 1]);
assertSnapshotEqualsStore(ds(6));

// 7. a damaged copy fails the run and writes no manifest
corruptNextCopy = true;
await assert.rejects(runBackup(day(7)), /verify failed/);
assert.ok(!objects.has(`${ds(7)}/manifest.json`));
results.push("7 corrupted copy: run rejected with 'verify failed', no manifest written");

// 8. retention: keep running weekly; only the newest 8 prefixes remain, and the deleted c3 is gone
for (let n = 8; n <= 12; n++) r = await run(n, `${n} weekly`);
const left = [...new Set([...objects.keys()].map((k) => k.split("/")[0]))].sort();
assert.deepEqual(left, [5, 6, 7, 8, 9, 10, 11, 12].map(ds));
assert.ok(![...objects.keys()].some((k) => k.endsWith("users/u3/files/c3.pdf")), "deleted file gone from R2 within 8 weeks");
assert.equal(r.blobReads, 0);
assertSnapshotEqualsStore(ds(12));
results.push(`retention: prefixes left ${left.join(", ")}; c3.pdf (deleted before week 3) in none`);

/* ---------- restore script ---------- */
const script = path.join(repo, "scripts/restore-backup.mjs");
const env = { ...process.env, BLOB_READ_WRITE_TOKEN: "", STORAGE_TRACE: "" };
const sh = async (args: string[]) => (await promisify(execFile)("node", [script, ...args], { env, encoding: "utf8" })).stdout;
const out = path.join(process.cwd(), "restored");
rmSync(out, { recursive: true, force: true });
const recOut = path.join(process.cwd(), "restored-records.json");
const dry = await sh(["--out", out, "--records-out", recOut]);
results.push("restore dry run:\n" + dry);
assert.match(dry, new RegExp(`Snapshot ${ds(12)}`));
assert.throws(() => statSync(out), "dry run wrote nothing");
assert.throws(() => statSync(recOut), "dry run wrote no records");
results.push("restore --write:\n" + await sh(["--out", out, "--records-out", recOut, "--write"]));
const restored = new Map<string, Buffer>();
const walk = (d: string) => readdirSync(d).forEach((e) => (statSync(path.join(d, e)).isDirectory() ? walk(path.join(d, e)) : restored.set(path.relative(out, path.join(d, e)).split(path.sep).join("/"), readFileSync(path.join(d, e)))));
walk(out);
const store = storeFiles();
assert.deepEqual([...restored.keys()].sort(), [...store.keys()].sort());
for (const [p, b] of store) assert.ok(restored.get(p)!.equals(b), p);
results.push(`restore --write: ${restored.size} files byte-identical to the store`);
// records come back exactly as stored, readable through lib/records.ts, TTL kept
const origRec = JSON.parse(readFileSync(RECORDS, "utf8"));
const backRec = JSON.parse(readFileSync(recOut, "utf8"));
assert.deepEqual(Object.keys(backRec).sort(), wantRecords());
for (const k of wantRecords()) {
  assert.deepEqual(backRec[k].s ?? backRec[k].h, origRec[k].s ?? origRec[k].h, k);
  assert.equal(!!backRec[k].exp, !!origRec[k].exp, `${k} TTL kept`);
}
results.push(`restore --records-out: ${Object.keys(backRec).length} records identical to the store, TTLs kept`);
// older snapshot, one account only
const out2 = out + "-u3";
await sh(["--snapshot", ds(5), "--only", "users/u3/", "--out", out2, "--records-out", out2 + ".json", "--write"]);
assert.deepEqual(readdirSync(path.join(out2, "users/u3/files")).sort(), ["c11.pdf", "c15.pdf", "c7.pdf", "c99"]);
assert.deepEqual(Object.keys(JSON.parse(readFileSync(out2 + ".json", "utf8"))).sort(), ["users/u3/certs", "users/u3/user.json"]);
results.push(`restore --snapshot ${ds(5)} --only users/u3/: 4 files (c3 was deleted before that week) and the account's 2 records`);
// a damaged record dump is refused before anything is written
const goodDump = objects.get(`${ds(12)}/records.json`)!;
objects.set(`${ds(12)}/records.json`, { ...goodDump, body: Buffer.from(goodDump.body.toString().replace("Teksts", "Tekstz")) });
await assert.rejects(sh(["--out", out + "-badrec", "--records-out", out + "-badrec.json", "--write"]), /sha256 mismatch for records.json/);
assert.throws(() => statSync(out + "-badrec.json"));
objects.set(`${ds(12)}/records.json`, goodDump);
results.push("restore of a tampered records.json: refused with sha256 mismatch, nothing written");
// tampered object is refused
objects.set(`${ds(12)}/users/u3/files/c99/scan.jpg`, { body: Buffer.from("[]"), type: "image/jpeg" });
await assert.rejects(sh(["--out", out + "-bad", "--files-only", "--write"]), /sha256 mismatch/);
results.push("restore of a tampered object (same size): refused with sha256 mismatch");
objects.delete(`${ds(12)}/users/u3/files/c99/scan.jpg`);
await assert.rejects(sh(["--out", out + "-bad", "--files-only"]), /missing or the wrong size/);
results.push("dry run with an object missing in R2: fails with 'missing or the wrong size'");

server.close();
log(results.join("\n"));
rmSync(tmp, { recursive: true, force: true });
log("\nALL TESTS PASSED");
