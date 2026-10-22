// End-to-end test of lib/backup.ts and scripts/restore-backup.mjs against an in-memory S3 server,
// with the local ./.data storage mode standing in for Vercel Blob. Runs in a fresh temp dir, so it never
// touches this checkout's .data. No network, no real credentials.
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
console.log = (...a: unknown[]) => (String(a[0]).startsWith("[storage] get") ? blobGets++ : String(a[0]).startsWith("[storage]") ? 0 : log(...a));
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
  const keys = [...objects.keys()].filter((k) => k.startsWith(`${date}/`) && k !== `${date}/manifest.json`);
  assert.equal(keys.length, store.size, "no stray objects in snapshot");
};
const day = (n: number) => new Date(Date.UTC(2026, 0, 4 + 7 * n, 1)); // Sundays
const ds = (n: number) => day(n).toISOString().slice(0, 10);
const reset = () => ((blobGets = 0), Object.keys(ops).forEach((k) => (ops[k as keyof typeof ops] = 0)));

const { runBackup } = await import(path.join(repo, "lib/backup.ts"));
const results: string[] = [];
const run = async (n: number, label: string) => {
  reset();
  const r = await runBackup(day(n));
  assert.equal(r.blobReads, blobGets, "reported reads = actual storage reads");
  results.push(`${label}: ${JSON.stringify(r)} | blob gets ${blobGets} | r2 ${JSON.stringify(ops)}`);
  return r;
};

/* ---------- seed: 20 files incl. awkward names ---------- */
console.warn = () => {}; // the expected copy-fallback warning in step 6
for (let i = 0; i < 18; i++) write(`users/u${i % 4}/certs/c${i}.json`, JSON.stringify({ i }));
write("users/u1/files/āž b & c.pdf", Buffer.from([0, 1, 2, 255]));
write("settings/admin.json", "{}");

// 1. pre-incremental manifest (old format, no version) as week 0: first run must read everything
objects.set(`${ds(0)}/manifest.json`, { body: Buffer.from(JSON.stringify({ createdAt: "x", files: [...storeFiles()].map(([p, b]) => ({ path: p, size: b.length, sha256: sha(b), contentType: "application/json" })) })), type: "application/json" });
for (const [p, b] of storeFiles()) objects.set(`${ds(0)}/${p}`, { body: b, type: "application/json" });
let r = await run(1, "1 full (old manifest)");
assert.equal(r.base, ds(0));
assert.deepEqual([r.files, r.blobReads, r.uploaded, r.unchanged, r.verified], [20, 20, 20, 0, 20]);
assertSnapshotEqualsStore(ds(1));

// 2. nothing changed: zero Blob reads, everything copied inside R2 and verified
r = await run(2, "2 no change");
assert.deepEqual([r.files, r.blobReads, r.uploaded, r.unchanged, r.verified, ops.copy, ops.put], [20, 0, 0, 20, 20, 20, 1]);
assertSnapshotEqualsStore(ds(2));

// 3. one changed, one new, one deleted
write("users/u0/certs/c0.json", JSON.stringify({ i: 0, edited: true }));
write("users/u9/certs/new.json", "{}");
rmSync(path.join(ROOT, "users/u3/certs/c3.json"));
r = await run(3, "3 1 changed, 1 new, 1 deleted");
assert.deepEqual([r.files, r.blobReads, r.uploaded, r.unchanged, r.verified], [20, 2, 2, 18, 20]);
assertSnapshotEqualsStore(ds(3));
assert.ok(objects.has(`${ds(2)}/users/u3/certs/c3.json`), "older snapshot still restorable as it was");

// 4. same-day rerun: no reads, no copies (objects already in place), still verified
r = await run(3, "4 same-day rerun");
assert.deepEqual([r.blobReads, r.unchanged, r.verified, ops.copy], [0, 20, 20, 0]);

// 5. an unfinished newer run (no manifest) is skipped as a base
objects.set(`${ds(4)}/users/u0/certs/c0.json`, { body: Buffer.from("partial"), type: "application/json" });
r = await run(5, "5 after unfinished run");
assert.equal(r.base, ds(3));
assert.equal(r.blobReads, 0);
assertSnapshotEqualsStore(ds(5));

// 6. a copy source missing in R2 falls back to a Blob read
objects.delete(`${ds(5)}/settings/admin.json`);
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
assert.ok(![...objects.keys()].some((k) => k.endsWith("users/u3/certs/c3.json")), "deleted file gone from R2 within 8 weeks");
assert.equal(r.blobReads, 0);
assertSnapshotEqualsStore(ds(12));
results.push(`retention: prefixes left ${left.join(", ")}; c3.json (deleted before week 3) in none`);

/* ---------- restore script ---------- */
const script = path.join(repo, "scripts/restore-backup.mjs");
const env = { ...process.env, BLOB_READ_WRITE_TOKEN: "", STORAGE_TRACE: "" };
const sh = async (args: string[]) => (await promisify(execFile)("node", [script, ...args], { env, encoding: "utf8" })).stdout;
const out = path.join(process.cwd(), "restored");
rmSync(out, { recursive: true, force: true });
const dry = await sh(["--out", out]);
results.push("restore dry run:\n" + dry);
assert.match(dry, new RegExp(`Snapshot ${ds(12)}`));
assert.throws(() => statSync(out), "dry run wrote nothing");
results.push("restore --write:\n" + await sh(["--out", out, "--write"]));
const restored = new Map<string, Buffer>();
const walk = (d: string) => readdirSync(d).forEach((e) => (statSync(path.join(d, e)).isDirectory() ? walk(path.join(d, e)) : restored.set(path.relative(out, path.join(d, e)).split(path.sep).join("/"), readFileSync(path.join(d, e)))));
walk(out);
const store = storeFiles();
assert.deepEqual([...restored.keys()].sort(), [...store.keys()].sort());
for (const [p, b] of store) assert.ok(restored.get(p)!.equals(b), p);
results.push(`restore --write: ${restored.size} files byte-identical to the store`);
// older snapshot, one account only
const out2 = out + "-u3";
await sh(["--snapshot", ds(5), "--only", "users/u3/", "--out", out2, "--write"]);
assert.equal(readdirSync(path.join(out2, "users/u3/certs")).length, 3);
results.push(`restore --snapshot ${ds(5)} --only users/u3/: 3 files (c3 was deleted before that week)`);
// tampered object is refused
objects.set(`${ds(12)}/settings/admin.json`, { body: Buffer.from("[]"), type: "application/json" });
await assert.rejects(sh(["--out", out + "-bad", "--write"]), /sha256 mismatch/);
results.push("restore of a tampered object (same size): refused with sha256 mismatch");
objects.delete(`${ds(12)}/settings/admin.json`);
await assert.rejects(sh(["--out", out + "-bad"]), /missing or the wrong size/);
results.push("dry run with an object missing in R2: fails with 'missing or the wrong size'");

server.close();
log(results.join("\n"));
rmSync(tmp, { recursive: true, force: true });
log("\nALL TESTS PASSED");
