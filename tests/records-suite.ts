// Record store (lib/records.ts) and what is built on it (lib/db.ts, rate limits, feedback). Shared by
// records-local.test.ts (file fallback) and records-redis.test.ts (Upstash backend against a fake REST API), so both
// backends must pass the same checks. Runs in a fresh temp dir: never touches this checkout's .data or any real store.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CmeCertificate, UserRecord } from "../lib/types";

export function recordsSuite(expectBackend: "local" | "redis") {
  // storage.ts picks its root from the cwd at import time, so move first
  const tmp = mkdtempSync(path.join(os.tmpdir(), `records-${expectBackend}-`));
  process.chdir(tmp);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.RECORDS_FILE = path.join(tmp, "records.json");

  let records: typeof import("../lib/records");
  let db: typeof import("../lib/db");
  let storage: typeof import("../lib/storage");
  let reset: typeof import("../lib/password-reset");
  let feedback: typeof import("../lib/monitoring/feedback");
  // imported after the chdir (no top-level await: the tests compile to CommonJS)
  before(async () => {
    records = await import("../lib/records");
    db = await import("../lib/db");
    storage = await import("../lib/storage");
    reset = await import("../lib/password-reset");
    feedback = await import("../lib/monitoring/feedback");
  });

  /** Blob operations and record commands a call makes, from the STORAGE_TRACE log lines */
  async function ops<T>(fn: () => Promise<T>): Promise<{ result: T; blob: string[]; records: string[] }> {
    const blob: string[] = [];
    const rec: string[] = [];
    const orig = console.log;
    process.env.STORAGE_TRACE = "1";
    console.log = (...a: unknown[]) => {
      const line = a.join(" ");
      if (line.startsWith("[storage] ")) blob.push(line.slice(10).split(" ")[0]);
      else if (line.startsWith("[records] ")) rec.push(line.slice(10).split(" ")[0]);
      else orig(...a);
    };
    try {
      return { result: await fn(), blob, records: rec };
    } finally {
      delete process.env.STORAGE_TRACE;
      console.log = orig;
    }
  }

  function cert(userId: string, extra: Partial<CmeCertificate> = {}): CmeCertificate {
    const id = randomUUID();
    return {
      id,
      userId,
      fileName: "a.pdf",
      filePath: `users/${userId}/files/${id}/a.pdf`,
      contentType: "application/pdf",
      uploadedAt: new Date().toISOString(),
      status: "confirmed",
      title: "Course",
      date: "2026-03-01",
      points: 6,
      parseNotes: null,
      ...extra,
    } as CmeCertificate;
  }
  const user = (id = randomUUID()) => ({ id, email: `${id}@Example.com`, passwordHash: "x", createdAt: new Date().toISOString() }) as UserRecord;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  test(`backend is ${expectBackend}`, () => {
    assert.equal(records.recordsBackend(), expectBackend);
  });

  /* ---------- record layer ---------- */

  test("get, set, mget, list by prefix, delete", async () => {
    await records.setRecord("t/a.json", { n: 1 });
    await records.setRecord("t/b.json", { n: 2, s: "ā ж \"q\"" });
    await records.setRecord("u/c.json", [1, 2]);
    assert.deepEqual(await records.getRecord("t/b.json"), { n: 2, s: "ā ж \"q\"" });
    assert.equal(await records.getRecord("t/missing.json"), null);
    assert.deepEqual(await records.getRecords(["t/a.json", "t/missing.json", "u/c.json"]), [{ n: 1 }, null, [1, 2]]);
    assert.deepEqual(await records.listRecordKeys("t/"), ["t/a.json", "t/b.json"]);
    await records.deleteRecordsUnder("t/");
    assert.deepEqual(await records.listRecordKeys("t/"), []);
    assert.deepEqual(await records.getRecord("u/c.json"), [1, 2], "other prefixes stay");
  });

  test("a prefix with glob characters matches literally", async () => {
    await records.setRecord("g/x*y.json", 1);
    await records.setRecord("g/xzy.json", 2);
    assert.deepEqual(await records.listRecordKeys("g/x*"), ["g/x*y.json"]);
  });

  test("conditional write: create-only and stale tag both refuse, current tag wins", async () => {
    const k = "cas/one.json";
    assert.equal(await records.setRecordIfMatch(k, { n: 1 }, null), true);
    assert.equal(await records.setRecordIfMatch(k, { n: 2 }, null), false, "create-only on an existing record");
    const cur = await records.getRecordTagged<{ n: number }>(k);
    assert.equal(cur!.value.n, 1);
    assert.equal(await records.setRecordIfMatch(k, { n: 2 }, cur!.tag), true);
    assert.equal(await records.setRecordIfMatch(k, { n: 3 }, cur!.tag), false, "tag from before the last write");
    assert.equal((await records.getRecord<{ n: number }>(k))!.n, 2);
    await records.deleteRecords([k]);
    assert.equal(await records.setRecordIfMatch(k, { n: 4 }, cur!.tag), false, "tag of a record deleted since");
  });

  test("concurrent read-modify-writes: none is lost", async () => {
    const k = "cas/counter.json";
    await Promise.all(Array.from({ length: 25 }, (_, i) => records.updateRecord<{ ids: number[] }>(k, (c) => ({ ids: [...(c?.ids ?? []), i] }))));
    const final = await records.getRecord<{ ids: number[] }>(k);
    assert.deepEqual([...final!.ids].sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
  });

  test("updateRecord: undefined leaves the record unwritten", async () => {
    const k = "cas/nochange.json";
    await records.setRecord(k, { n: 1 });
    const r = await ops(() => records.updateRecord(k, () => undefined));
    assert.deepEqual(r.result, { n: 1 });
    assert.deepEqual(r.records, ["get"]);
  });

  test("TTL: a record expires, and a conditional write sets one", async () => {
    await records.setRecord("ttl/a.json", 1, { ttlSec: 1 });
    await records.setRecordIfMatch("ttl/b.json", 1, null, { ttlSec: 100 });
    const raw = await records.readRaw("ttl/b.json");
    assert.ok(raw?.ttl && raw.ttl > 90 && raw.ttl <= 100, `ttl ${raw?.ttl}`);
    assert.equal((await records.readRaw("u/c.json"))?.ttl, undefined, "no TTL unless asked");
    await sleep(1_200);
    assert.equal(await records.getRecord("ttl/a.json"), null);
  });

  test("hash fields: written and deleted one at a time", async () => {
    await records.setHashFields("h/one", { a: { n: 1 }, b: { n: 2 } });
    await records.setHashFields("h/one", { c: { n: 3 } });
    await records.deleteHashFields("h/one", ["a"]);
    assert.deepEqual(await records.getHash("h/one"), { b: { n: 2 }, c: { n: 3 } });
    assert.deepEqual(await records.getHashField("h/one", "c"), { n: 3 });
    assert.equal(await records.getHashField("h/one", "a"), null);
    assert.deepEqual(await records.getHash("h/none"), {});
    assert.equal((await records.readRaw("h/one"))?.type, "hash");
  });

  test("raw compare-and-set on strings and hash fields (the migration's writes)", async () => {
    assert.equal(await records.setRawIfEquals("raw/s", null, "v1", null), true);
    assert.equal(await records.setRawIfEquals("raw/s", null, "v2", "other"), false);
    assert.equal(await records.setRawIfEquals("raw/s", null, "v2", "v1", 50), true);
    assert.equal(await records.getRaw("raw/s", null), "v2");
    assert.equal(await records.setRawIfEquals("raw/h", "f", "x1", null), true);
    assert.equal(await records.setRawIfEquals("raw/h", "f", "x2", null), false, "field exists");
    assert.equal(await records.setRawIfEquals("raw/h", "g", "y1", null), true, "another field of the same hash");
    assert.equal(await records.setRawIfEquals("raw/h", "f", "x2", "x1"), true);
    assert.deepEqual((await records.readRaw("raw/h"))?.value, { f: "x2", g: "y1" });
  });

  test("windowed counter: counts, and the window starts at the first hit", async () => {
    assert.equal(await records.incrementWindow("cnt/a", 60), 1);
    assert.equal(await records.incrementWindow("cnt/a", 60), 2);
    assert.equal(await records.getRecord<number>("cnt/a"), 2);
    const ttl = (await records.readRaw("cnt/a"))?.ttl ?? 0;
    assert.ok(ttl > 50 && ttl <= 60, `ttl ${ttl}`);
    assert.equal(await records.incrementWindow("cnt/b", 1), 1);
    await sleep(1_200);
    assert.equal(await records.incrementWindow("cnt/b", 1), 1, "a new window after expiry");
  });

  /* ---------- accounts and certificates (lib/db.ts) ---------- */

  test("account: create, find by email (case-insensitive), save", async () => {
    const u = user();
    await db.createUser(u);
    assert.equal((await db.getUserByEmail(u.email.toUpperCase()))?.id, u.id);
    await db.saveUser({ ...u, fullName: "Edited" } as UserRecord);
    assert.equal(((await db.getUser(u.id)) as UserRecord & { fullName?: string }).fullName, "Edited");
  });

  test("listing a user's certificates: one record command, no Blob operation", async () => {
    const u = user();
    await db.saveCertificates([cert(u.id), cert(u.id, { date: "2026-05-01" })]);
    const r = await ops(() => db.listCertificates(u.id));
    assert.equal(r.result.length, 2);
    assert.equal(r.result[0].date, "2026-05-01", "newest first");
    assert.deepEqual(r.records, ["hgetall"]);
    assert.deepEqual(r.blob, []);
  });

  test("concurrent saves of different certificates keep every one", async () => {
    const u = user();
    await db.saveCertificate(cert(u.id));
    const many = Array.from({ length: 12 }, () => cert(u.id));
    await Promise.all(many.map((c) => db.saveCertificate(c)));
    assert.equal((await db.listCertificates(u.id)).length, 13);
  });

  test("concurrent edits and deletes of different certificates do not undo each other", async () => {
    const u = user();
    const all = Array.from({ length: 10 }, () => cert(u.id));
    await db.saveCertificates(all);
    await Promise.all([
      ...all.slice(0, 5).map((c) => db.saveCertificate({ ...c, title: "Edited" })),
      ...all.slice(5).map((c) => db.deleteCertificate(u.id, c.id)),
    ]);
    const left = await db.listCertificates(u.id);
    assert.deepEqual(left.map((c) => c.id).sort(), all.slice(0, 5).map((c) => c.id).sort());
    assert.ok(left.every((c) => c.title === "Edited"));
  });

  test("a stale 'parsing' record reads as failed", async () => {
    const u = user();
    const c = cert(u.id, { status: "parsing", uploadedAt: new Date(Date.now() - 10 * 60_000).toISOString() } as Partial<CmeCertificate>);
    await db.saveCertificate(c);
    assert.equal((await db.getCertificate(u.id, c.id))?.status, "failed");
  });

  test("delete a certificate: gone from the listing, its file removed, other files stay", async () => {
    const u = user();
    const keep = cert(u.id);
    const drop = cert(u.id);
    await db.saveCertificates([keep, drop]);
    await storage.putBytes(drop.filePath, Buffer.from("%PDF"), "application/pdf");
    await storage.putBytes(keep.filePath, Buffer.from("%PDF"), "application/pdf");
    const del = await ops(() => db.deleteCertificate(u.id, drop.id));
    assert.equal(del.blob.filter((o) => o === "list").length, 1, "one Blob list for the file folder");
    assert.deepEqual((await db.listCertificates(u.id)).map((c) => c.id), [keep.id]);
    assert.equal(await db.getCertificate(u.id, drop.id), null);
    assert.equal(existsSync(path.join(tmp, ".data", drop.filePath)), false);
    assert.equal(existsSync(path.join(tmp, ".data", keep.filePath)), true);
  });

  test("delete an account: records, email index and files all gone, other accounts untouched", async () => {
    const u = user();
    const other = user();
    await db.createUser(u);
    await db.createUser(other);
    const c = cert(u.id);
    await db.saveCertificate(c);
    await db.saveCertificate(cert(other.id));
    await storage.putBytes(c.filePath, Buffer.from("%PDF"), "application/pdf");
    await db.deleteUserData(u);
    assert.equal(await db.getUser(u.id), null);
    assert.equal(await db.getUserByEmail(u.email), null);
    assert.deepEqual(await db.listCertificates(u.id), []);
    assert.deepEqual(await records.listRecordKeys(`users/${u.id}/`), []);
    assert.equal(existsSync(path.join(tmp, ".data", c.filePath)), false);
    assert.equal((await db.getUserByEmail(other.email))?.id, other.id);
    assert.equal((await db.listCertificates(other.id)).length, 1);
  });

  /* ---------- password reset and rate limits ---------- */

  test("reset token: readable until deleted, expires with a 1 hour TTL", async () => {
    const token = await reset.createResetToken("u1", 3);
    assert.equal((await reset.readResetToken(token))?.sessionVersion, 3);
    const key = (await records.listRecordKeys("reset-tokens/"))[0];
    const ttl = (await records.readRaw(key))?.ttl ?? 0;
    assert.ok(ttl > 3590 && ttl <= 3600, `ttl ${ttl}`);
    await reset.deleteResetToken(token);
    assert.equal(await reset.readResetToken(token), null);
  });

  test("rate limit: allows max hits per window, then refuses; limitState and clearLimit agree", async () => {
    const key = `test:${randomUUID()}`;
    for (let i = 0; i < 3; i++) assert.equal(await reset.rateLimit(key, 3, 60_000), true);
    assert.equal(await reset.rateLimit(key, 3, 60_000), false);
    assert.deepEqual(await reset.limitState(key, 3, 60_000), { under: false, recorded: true });
    await reset.clearLimit(key);
    assert.deepEqual(await reset.limitState(key, 3, 60_000), { under: true, recorded: false });
  });

  test("rate limit under concurrency: exactly max of many parallel hits get through", async () => {
    const key = `burst:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => reset.rateLimit(key, 5, 60_000)));
    assert.equal(results.filter(Boolean).length, 5);
  });

  /* ---------- feedback day record ---------- */

  test("feedback: concurrent messages all land in the day record, which expires after 31 days", async () => {
    const base = { email: null, demo: false, route: null, certId: null, locale: "lv", device: "test" };
    const quiet = console.log;
    console.log = () => {}; // sendEmail prints the message locally
    try {
      await Promise.all(Array.from({ length: 6 }, (_, i) => feedback.submitFeedback({ ...base, message: `m${i}` }, `s${i}`)));
    } finally {
      console.log = quiet;
    }
    const [day] = await feedback.readFeedbackDays(1);
    assert.equal(day.entries.length, 6);
    const ttl = (await records.readRaw(`feedback/${day.day}.json`))?.ttl ?? 0;
    assert.ok(ttl > 30 * 86_400 && ttl <= 31 * 86_400, `ttl ${ttl}`);
  });
}
