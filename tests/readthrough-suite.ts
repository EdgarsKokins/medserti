// Read-through from the old Blob JSON (lib/records.ts) for the window between the deploy and the migration: data
// shows up, is written through once, deletes stay deleted, and everything stops once the migration is done.
// Shared by readthrough-local.test.ts and readthrough-redis.test.ts. Fresh temp dir; ./.data stands in for Blob.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CmeCertificate, UserRecord } from "../lib/types";

export function readThroughSuite(name: string) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), `readthrough-${name}-`));
  process.chdir(tmp);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.RECORDS_FILE = path.join(tmp, "records.json");
  process.env.RECORDS_BLOB_FALLBACK = "1";
  const DATA = path.join(tmp, ".data");

  let records: typeof import("../lib/records");
  let db: typeof import("../lib/db");
  let migrate: typeof import("../lib/migrate-records");
  before(async () => {
    records = await import("../lib/records");
    db = await import("../lib/db");
    migrate = await import("../lib/migrate-records");
  });

  /* ---------- the old layout, as the main-branch code wrote it ---------- */
  const write = (p: string, v: unknown) => {
    mkdirSync(path.dirname(path.join(DATA, p)), { recursive: true });
    writeFileSync(path.join(DATA, p), JSON.stringify(v));
  };
  const emailKey = (e: string) => createHash("sha256").update(e.trim().toLowerCase()).digest("hex");
  const A = "aaaaaaaa-0000-4000-8000-00000000000a"; // with a manifest
  const B = "bbbbbbbb-0000-4000-8000-00000000000b"; // from before the manifest
  const user = (id: string, email: string) => ({ id, email, passwordHash: "x", createdAt: "2026-01-01T00:00:00Z", profile: { fullName: "Ā" } }) as unknown as UserRecord;
  const cert = (userId: string, n: number, title = `Kurss ${n}`) =>
    ({ id: `${userId.slice(0, 8)}-000${n}`, userId, title, date: `2026-0${n}-01`, uploadedAt: "2026-01-01T00:00:00Z", status: "confirmed", points: n }) as unknown as CmeCertificate;
  const seed = () => {
    write(`users/${A}/user.json`, user(A, "a@example.test"));
    write(`users/index/${emailKey("a@example.test")}.json`, { userId: A });
    for (const n of [1, 2, 3]) write(`users/${A}/certs/${cert(A, n).id}.json`, cert(A, n));
    write(`users/${A}/certs/${cert(A, 9).id}.json`, cert(A, 9, "orphan: deleted, record left behind"));
    write(`users/${A}/certs.json`, { v: 1, certs: Object.fromEntries([1, 2, 3].map((n) => [cert(A, n).id, "h"])) });
    write(`users/${A}/files/${cert(A, 1).id}/a.pdf`, "%PDF");
    write(`users/${B}/user.json`, user(B, "b@example.test"));
    write(`users/index/${emailKey("b@example.test")}.json`, { userId: B });
    for (const n of [1, 2]) write(`users/${B}/certs/${cert(B, n).id}.json`, cert(B, n));
    write("i18n/overrides.json", { lv: { k: "teksts" }, en: {}, ru: {} });
    write("courses/index.json", { courses: [{ id: 1 }], sources: [] });
    const today = new Date().toISOString().slice(0, 10);
    write(`errors/${today}.json`, { day: today, emails: 0, dropped: 0, items: {} });
    write(`rate-limits/${"f".repeat(64)}.json`, { count: 9, windowStart: Date.now() });
  };

  /** Blob reads/lists and record commands a call makes (STORAGE_TRACE) */
  async function ops<T>(fn: () => Promise<T>) {
    const blob: string[] = [];
    const orig = console.log;
    process.env.STORAGE_TRACE = "1";
    console.log = (...a: unknown[]) => {
      const line = a.join(" ");
      if (line.startsWith("[storage] ")) blob.push(line.slice(10).split(" ")[0]);
      else if (!line.startsWith("[records] ")) orig(...a);
    };
    try {
      return { result: await fn(), blob };
    } finally {
      delete process.env.STORAGE_TRACE;
      console.log = orig;
    }
  }
  /** Another server instance: no per-instance memory of loaded users or of the done flag */
  const otherInstance = () => {
    const h = (globalThis as { __medsertiRecords?: { loaded?: Set<string>; migrated?: boolean } }).__medsertiRecords;
    h?.loaded?.clear();
    if (h) h.migrated = false;
  };

  test("seed the old layout", () => seed());

  test("an account in Blob only: found by email, read once from Blob, then from Redis", async () => {
    const first = await ops(() => db.getUserByEmail("A@example.test"));
    assert.equal(first.result?.id, A);
    assert.deepEqual(first.blob, ["get", "get"], "index + user");
    const second = await ops(() => db.getUserByEmail("a@example.test"));
    assert.equal(second.result?.id, A);
    assert.deepEqual(second.blob, [], "written through");
  });

  test("certificates: what the manifest lists, once; the orphan never", async () => {
    const first = await ops(() => db.listCertificates(A));
    assert.deepEqual(first.result.map((c) => c.title).sort(), ["Kurss 1", "Kurss 2", "Kurss 3"]);
    assert.equal(first.blob.filter((o) => o === "get").length, 4, "manifest + 3 records");
    otherInstance();
    const again = await ops(() => db.listCertificates(A));
    assert.equal(again.result.length, 3);
    assert.deepEqual(again.blob, [], "marked as loaded in Redis: no Blob on any instance");
  });

  test("an account from before the manifest: one listing, every record", async () => {
    const r = await ops(() => db.getCertificate(B, cert(B, 2).id));
    assert.equal(r.result?.title, "Kurss 2");
    assert.deepEqual(r.blob.filter((o) => o === "list").length, 1);
    assert.equal((await db.listCertificates(B)).length, 2);
  });

  test("a certificate saved before the first listing does not hide the older ones", async () => {
    const C = "cccccccc-0000-4000-8000-00000000000c";
    write(`users/${C}/user.json`, user(C, "c@example.test"));
    write(`users/${C}/certs/${cert(C, 1).id}.json`, cert(C, 1));
    write(`users/${C}/certs.json`, { v: 1, certs: { [cert(C, 1).id]: "h" } });
    await db.saveCertificate(cert(C, 2, "new upload"));
    assert.deepEqual((await db.listCertificates(C)).map((c) => c.title).sort(), ["Kurss 1", "new upload"]);
  });

  test("an edit after the read-through wins over Blob", async () => {
    const c = (await db.getCertificate(A, cert(A, 1).id))!;
    await db.saveCertificate({ ...c, title: "edited" });
    const u = (await db.getUser(A))!;
    await db.saveUser({ ...u, profile: { ...u.profile, fullName: "Edited" } });
    otherInstance();
    assert.equal((await db.getCertificate(A, c.id))?.title, "edited");
    assert.equal((await db.getUser(A))?.profile.fullName, "Edited");
  });

  test("a deleted certificate stays deleted, on any instance, and its old Blob copy is gone", async () => {
    await db.deleteCertificate(A, cert(A, 2).id);
    assert.equal(existsSync(path.join(DATA, `users/${A}/certs/${cert(A, 2).id}.json`)), false);
    otherInstance();
    // even if the loaded marker were lost, the Blob copy is gone
    await records.deleteRecords([`users/${A}/certs.loaded`]);
    assert.deepEqual((await db.listCertificates(A)).map((c) => c.id).sort(), [cert(A, 1).id, cert(A, 3).id]);
  });

  test("a deleted account stays deleted: Redis and every old Blob copy gone", async () => {
    const u = (await db.getUserByEmail("b@example.test"))!;
    await db.deleteUserData(u);
    otherInstance();
    assert.equal(await db.getUserByEmail("b@example.test"), null);
    assert.equal(await db.getUser(B), null);
    assert.deepEqual(await db.listCertificates(B), []);
    assert.equal(existsSync(path.join(DATA, `users/${B}`)), false);
    assert.equal(existsSync(path.join(DATA, `users/index/${emailKey("b@example.test")}.json`)), false);
  });

  test("a new account never looks in Blob for certificates", async () => {
    const N = "dddddddd-0000-4000-8000-00000000000d";
    await db.createUser(user(N, "n@example.test"));
    otherInstance();
    const r = await ops(() => db.listCertificates(N));
    assert.deepEqual(r.result, []);
    assert.deepEqual(r.blob, []);
  });

  test("settings, course list and today's error log read through; keys that never lived in Blob do not", async () => {
    const { getRecord, getRecords } = records;
    assert.equal((await getRecord<{ lv: Record<string, string> }>("i18n/overrides.json"))?.lv.k, "teksts");
    assert.equal((await getRecord<{ courses: unknown[] }>("courses/index.json"))?.courses.length, 1);
    const today = new Date().toISOString().slice(0, 10);
    const [day] = await getRecords<{ day: string }>([`errors/${today}.json`, "errors/2000-01-01.json"]);
    assert.equal(day?.day, today);
    const raw = await records.readRaw(`errors/${today}.json`);
    assert.ok(raw?.ttl && raw.ttl > 30 * 86_400, "TTL as the app would set it");
    const rl = await ops(() => getRecord(`rate-limits/${"f".repeat(64)}`));
    assert.equal(rl.result, null);
    assert.deepEqual(rl.blob, [], "rate limits are not read through");
  });

  test("the migration keeps what the app wrote, copies the rest, and then the read-through stops", async () => {
    write(`users/${"eeeeeeee-0000-4000-8000-00000000000e"}/user.json`, user("eeeeeeee-0000-4000-8000-00000000000e", "e@example.test"));
    const quiet = console.log;
    const r = await migrate.migrateBlobRecords();
    console.log = quiet;
    assert.equal(r.complete, true);
    assert.equal(r.done, true);
    assert.deepEqual(r.errors, []);
    assert.ok(r.keptNewer >= 2, "the edited certificate and user");
    assert.equal((await db.getCertificate(A, cert(A, 1).id))?.title, "edited");
    assert.equal((await db.getUser(A))?.profile.fullName, "Edited");
    assert.equal(await db.getCertificate(A, cert(A, 2).id), null, "deleted stays deleted");
    assert.equal((await db.getUser("eeeeeeee-0000-4000-8000-00000000000e"))?.email, "e@example.test", "copied by the migration");
    otherInstance();
    const after = await ops(() => db.getUser("ffffffff-0000-4000-8000-00000000000f"));
    assert.equal(after.result, null);
    assert.deepEqual(after.blob, [], "done: a miss no longer reads Blob");
  });
}
