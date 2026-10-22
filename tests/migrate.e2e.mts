// End-to-end test of scripts/migrate-blob-to-redis.ts: a local ./.data store in the old Blob layout is copied into the
// local records file, then a rerun picks up what the old app wrote in between without undoing what the new app did.
// Runs in a fresh temp dir; never touches this checkout's stores or any real one.
//   npx tsx --conditions=react-server tests/migrate.e2e.mts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(path.join(os.tmpdir(), "migrate-e2e-"));
const DATA = path.join(tmp, ".data");
const RECORDS = path.join(tmp, ".data-records.json");
const env = { ...process.env, BLOB_READ_WRITE_TOKEN: "", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", RECORDS_FILE: RECORDS };
/** stdout + stderr (conflicts are warnings) */
const migrate = async (...args: string[]) => {
  const r = await promisify(execFile)("node", ["--conditions=react-server", "--import", import.meta.resolve("tsx"), path.join(repo, "scripts/migrate-blob-to-redis.ts"), ...args], { cwd: tmp, env, encoding: "utf8" });
  return r.stdout + r.stderr;
};

let tick = Date.now() - 1e7;
const write = (p: string, v: unknown) => {
  const f = path.join(DATA, p);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, typeof v === "string" ? v : JSON.stringify(v));
  const t = new Date((tick += 1000));
  utimesSync(f, t, t);
};
const store = () => JSON.parse(readFileSync(RECORDS, "utf8")) as Record<string, { s?: string; h?: Record<string, string>; exp?: number }>;
const str = (k: string) => {
  const e = store()[k];
  return e?.s === undefined ? undefined : JSON.parse(e.s);
};
const hash = (k: string) => Object.fromEntries(Object.entries(store()[k]?.h ?? {}).map(([f, v]) => [f, JSON.parse(v)]));
const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/* ---------- the old layout ---------- */
const A = "aaaaaaaa-0000-4000-8000-000000000001"; // has a manifest
const B = "bbbbbbbb-0000-4000-8000-000000000002"; // from before the manifest
const c = (u: string, n: number, title = `Kurss ${n}`) => ({ id: `${u.slice(0, 8)}-c${n}`, userId: u, title, points: n });
write(`users/${A}/user.json`, { id: A, email: "a@example.test", profile: { fullName: "Ā Ž" } });
write(`users/index/${"a".repeat(64)}.json`, { userId: A });
write(`users/${A}/certs/${A.slice(0, 8)}-c1.json`, c(A, 1));
write(`users/${A}/certs/${A.slice(0, 8)}-c2.json`, c(A, 2));
write(`users/${A}/certs/${A.slice(0, 8)}-c3.json`, c(A, 3, "deleted: record left behind"));
write(`users/${A}/certs.json`, { v: 1, certs: { [`${A.slice(0, 8)}-c1`]: "x", [`${A.slice(0, 8)}-c2`]: "y" } });
write(`users/${A}/files/${A.slice(0, 8)}-c1/a.pdf`, "%PDF");
write(`users/${B}/user.json`, { id: B, email: "b@example.test" });
write(`users/${B}/certs/${B.slice(0, 8)}-c1.json`, c(B, 1));
write("i18n/overrides.json", { lv: { k: "jauns" }, en: {}, ru: {} });
write("i18n/overrides.prev.json", { lv: { k: "vecs" }, en: {}, ru: {} });
write("courses/index.json", { courses: [{ id: 1 }] });
write("courses/details/application-1.json", { fetchedAt: new Date(Date.now() - 86_400_000).toISOString() });
write("courses/details/application-2.json", { fetchedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() });
write(`reset-tokens/${"r".repeat(64)}.json`, { userId: A, expiresAt: new Date(Date.now() + 1_800_000).toISOString() });
write(`reset-tokens/${"s".repeat(64)}.json`, { userId: A, expiresAt: new Date(Date.now() - 1_000).toISOString() });
write(`rate-limits/${"q".repeat(64)}.json`, { count: 2, windowStart: Date.now() });
write(`errors/${days(1)}.json`, { day: days(1), items: {} });
write(`errors/${days(40)}.json`, { day: days(40), items: {} });
write(`feedback/${days(0)}.json`, { day: days(0), entries: [{ message: "ziņa" }], bySender: {} });
write("users/00000000-0000-4000-8000-0000000de300/demo.json", { version: 1 });

/* ---------- 1. dry run: counts, writes nothing ---------- */
const dry = await migrate("--dry-run");
assert.match(dry, /Listed 21 blobs in 1 list call/);
assert.match(dry, /Dry run: 18 records to copy/);
assert.throws(() => statSync(RECORDS), "dry run wrote nothing");

/* ---------- 2. the real run ---------- */
const run1 = await migrate();
assert.match(run1, /Copied 14 records, each read back and verified \(14\)/);
assert.match(run1, /Skipped: 3 expired, 1 certificate records not in their manifest, 1 rate-limit counters, 1 files/);
assert.match(run1, /Blob 1 list \(advanced\) \+ 18 reads/, "each record and manifest read once; the orphan not at all");
assert.deepEqual(str(`users/${A}/user.json`).profile.fullName, "Ā Ž");
assert.deepEqual(Object.keys(hash(`users/${A}/certs`)).sort(), [`${A.slice(0, 8)}-c1`, `${A.slice(0, 8)}-c2`], "only what the manifest lists");
assert.deepEqual(Object.keys(hash(`users/${B}/certs`)), [`${B.slice(0, 8)}-c1`], "no manifest: every record");
assert.equal(store()[`users/${A}/certs.json`], undefined, "the manifest itself is not copied");
assert.equal(str("i18n/overrides.prev.json").lv.k, "vecs");
const s = store();
const left = (k: string) => Math.round(((s[k].exp ?? 0) - Date.now()) / 86_400_000);
assert.equal(left("courses/details/application-1.json"), 13);
assert.equal(s["courses/details/application-2.json"], undefined, "older than 14 days: expired");
assert.equal(Math.round(((s[`reset-tokens/${"r".repeat(64)}.json`].exp ?? 0) - Date.now()) / 60_000), 30);
assert.equal(s[`reset-tokens/${"s".repeat(64)}.json`], undefined);
assert.equal(left(`errors/${days(1)}.json`), 30);
assert.equal(s[`errors/${days(40)}.json`], undefined);
assert.equal(s["courses/index.json"].exp, undefined, "no TTL on lasting records");
assert.ok(!Object.keys(s).some((k) => k.startsWith("rate-limits/")));

/* ---------- 3. rerun with nothing changed: no record reads ---------- */
const run2 = await migrate();
assert.match(run2, /Copied 0 records/);
assert.match(run2, /Blob 1 list \(advanced\) \+ 0 reads/);
assert.match(run2, /Complete: true\. Read-through off \(done flag set\): true/);
assert.ok(store()["meta/blob-migration-done"], "done flag set");

/* ---------- 4. the deploy gap: the old app and the new app both wrote ---------- */
// old app (Blob): edits A's c1, adds a user, deletes A's c2 (manifest first), edits B's c1
write(`users/${A}/certs/${A.slice(0, 8)}-c1.json`, c(A, 1, "edited in Blob"));
const C = "cccccccc-0000-4000-8000-000000000003";
write(`users/${C}/user.json`, { id: C, email: "c@example.test" });
write(`users/${A}/certs.json`, { v: 1, certs: { [`${A.slice(0, 8)}-c1`]: "x2" } });
write(`users/${B}/certs/${B.slice(0, 8)}-c1.json`, c(B, 1, "edited in Blob"));
// new app (Redis): edits the admin texts, deletes the old token, edits B's c1 too
const st = store();
st["i18n/overrides.json"].s = JSON.stringify({ lv: { k: "no jaunās lietotnes" }, en: {}, ru: {} });
delete st[`reset-tokens/${"r".repeat(64)}.json`];
st[`users/${B}/certs`].h![`${B.slice(0, 8)}-c1`] = JSON.stringify(c(B, 1, "edited in Redis"));
writeFileSync(RECORDS, JSON.stringify(st));

const run3 = await migrate();
assert.match(run3, /Copied 2 records/, "A's c1 and the new user");
assert.match(run3, /Removed from Redis: 1/, "A's c2, deleted in Blob");
assert.match(run3, /conflict: users\/bbbbbbbb-0000-4000-8000-000000000002\/certs\/bbbbbbbb-c1\.json: changed in Blob and in Redis since the last run; Redis kept/);
assert.equal(hash(`users/${A}/certs`)[`${A.slice(0, 8)}-c1`].title, "edited in Blob");
assert.equal(hash(`users/${A}/certs`)[`${A.slice(0, 8)}-c2`], undefined);
assert.equal(str(`users/${C}/user.json`).id, C);
assert.equal(hash(`users/${B}/certs`)[`${B.slice(0, 8)}-c1`].title, "edited in Redis", "the new app's write wins");
assert.equal(str("i18n/overrides.json").lv.k, "no jaunās lietotnes", "unchanged in Blob: Redis kept");
assert.equal(store()[`reset-tokens/${"r".repeat(64)}.json`], undefined, "deleted by the new app: not brought back");
assert.match(run3, /Blob 1 list \(advanced\) \+ 4 reads/, "only the changed records and the changed manifest");

/* ---------- 5. a lost state file: nothing is overwritten, matching records are adopted ---------- */
const lost = store();
delete lost["meta/blob-migration-state"];
writeFileSync(RECORDS, JSON.stringify(lost));
const before = readFileSync(RECORDS, "utf8");
const run4 = await migrate();
assert.match(run4, /Copied 1 records/, "only the token the new app deleted is a free slot again");
assert.match(run4, /already written by the app \(kept\)/);
const after = store();
assert.equal(JSON.parse(after["i18n/overrides.json"].s!).lv.k, "no jaunās lietotnes");
assert.equal(JSON.parse(after[`users/${B}/certs`].h![`${B.slice(0, 8)}-c1`]).title, "edited in Redis");
assert.ok(before.length > 0);

rmSync(tmp, { recursive: true, force: true });
console.log("ALL MIGRATION TESTS PASSED");
