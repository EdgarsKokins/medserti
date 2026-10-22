// Certificate manifest (lib/db.ts): one read per listing instead of a Blob list, kept right under concurrent writes.
// Runs against the local ./.data storage mode in a fresh temp dir. Run: npm test
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CmeCertificate } from "../lib/types";

// storage.ts picks its root from the cwd at import time, so move first
const tmp = mkdtempSync(path.join(os.tmpdir(), "manifest-test-"));
process.chdir(tmp);
delete process.env.BLOB_READ_WRITE_TOKEN;
// imported after the chdir (no top-level await: the tests compile to CommonJS)
let db: typeof import("../lib/db");
let storage: typeof import("../lib/storage");
before(async () => {
  db = await import("../lib/db");
  storage = await import("../lib/storage");
});

/** Store operations a call makes, from the STORAGE_TRACE log lines */
async function ops<T>(fn: () => Promise<T>): Promise<{ result: T; ops: string[] }> {
  const seen: string[] = [];
  const orig = console.log;
  process.env.STORAGE_TRACE = "1";
  console.log = (...a: unknown[]) => {
    const line = a.join(" ");
    if (line.startsWith("[storage] ")) seen.push(line.slice(10).split(" ")[0]);
    else orig(...a);
  };
  try {
    return { result: await fn(), ops: seen };
  } finally {
    delete process.env.STORAGE_TRACE;
    console.log = orig;
  }
}
const count = (o: string[], op: string) => o.filter((x) => x === op).length;

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
const manifestOf = (userId: string) =>
  JSON.parse(readFileSync(path.join(tmp, ".data", `users/${userId}/certs.json`), "utf8")) as { v: 1; certs: Record<string, string> };
/** Another server instance: same store, empty in-memory cache */
const otherInstance = () => (globalThis as { __medsertiVersioned?: Map<string, unknown> }).__medsertiVersioned?.clear();

test("an account from before the manifest gets one from a single listing, then pages stop listing", async () => {
  const userId = randomUUID();
  const old = [cert(userId), cert(userId)];
  for (const c of old) {
    mkdirSync(path.join(tmp, ".data", `users/${userId}/certs`), { recursive: true });
    writeFileSync(path.join(tmp, ".data", `users/${userId}/certs/${c.id}.json`), JSON.stringify(c));
  }
  const first = await ops(() => db.listCertificates(userId));
  assert.equal(first.result.length, 2);
  assert.equal(count(first.ops, "list"), 1, "migration lists once");
  assert.deepEqual(Object.keys(manifestOf(userId).certs).sort(), old.map((c) => c.id).sort());

  const second = await ops(() => db.listCertificates(userId));
  assert.equal(second.result.length, 2);
  assert.deepEqual(second.ops, ["get"], "one read of the manifest, records from the instance cache");
});

test("new account: empty manifest at sign-up, so the first page view does not list", async () => {
  const userId = randomUUID();
  await db.createUser({ id: userId, email: `${userId}@example.com`, passwordHash: "x", createdAt: new Date().toISOString() } as never);
  const r = await ops(() => db.listCertificates(userId));
  assert.deepEqual(r.result, []);
  assert.equal(count(r.ops, "list"), 0);
});

test("a save is visible on the next listing on any instance, with no list", async () => {
  const userId = randomUUID();
  const c = cert(userId);
  await db.saveCertificate(c);
  await db.listCertificates(userId); // this instance caches it
  const edited = { ...c, title: "Edited" };
  const save = await ops(() => db.saveCertificate(edited));
  assert.equal(count(save.ops, "list"), 0);
  assert.equal(count(save.ops, "put"), 2, "record + manifest");

  const here = await db.listCertificates(userId);
  assert.equal(here[0].title, "Edited", "same instance sees the edit");
  otherInstance();
  const r = await ops(() => db.listCertificates(userId));
  assert.equal(r.result[0].title, "Edited", "fresh instance sees the edit");
  assert.equal(count(r.ops, "list"), 0);
});

test("saving an unchanged record does not rewrite the manifest", async () => {
  const userId = randomUUID();
  const c = cert(userId);
  await db.saveCertificate(c);
  const again = await ops(() => db.saveCertificate(c));
  assert.equal(count(again.ops, "put"), 1, "only the record");
});

test("concurrent saves keep every entry (conditional writes retry)", async () => {
  const userId = randomUUID();
  await db.saveCertificate(cert(userId));
  const many = Array.from({ length: 8 }, () => cert(userId));
  await Promise.all(many.map((c) => db.saveCertificate(c)));
  assert.equal(Object.keys(manifestOf(userId).certs).length, 9);
  otherInstance();
  assert.equal((await db.listCertificates(userId)).length, 9);
});

test("migration racing a save: the save is never lost", async () => {
  for (let round = 0; round < 10; round++) {
    const userId = randomUUID();
    const existing = cert(userId);
    mkdirSync(path.join(tmp, ".data", `users/${userId}/certs`), { recursive: true });
    writeFileSync(path.join(tmp, ".data", `users/${userId}/certs/${existing.id}.json`), JSON.stringify(existing));
    const added = cert(userId);
    await Promise.all([db.listCertificates(userId), db.saveCertificate(added), db.listCertificates(userId)]);
    assert.deepEqual(Object.keys(manifestOf(userId).certs).sort(), [existing.id, added.id].sort(), `round ${round}`);
  }
});

test("delete: gone from the listing everywhere, record and file removed, one list", async () => {
  const userId = randomUUID();
  const keep = cert(userId);
  const drop = cert(userId);
  await db.saveCertificates([keep, drop]);
  await storage.putBytes(drop.filePath, Buffer.from("%PDF"), "application/pdf");
  await storage.putBytes(keep.filePath, Buffer.from("%PDF"), "application/pdf");
  await db.listCertificates(userId);

  const del = await ops(() => db.deleteCertificate(userId, drop.id));
  assert.equal(count(del.ops, "list"), 1);
  assert.deepEqual((await db.listCertificates(userId)).map((c) => c.id), [keep.id]);
  assert.equal(await db.getCertificate(userId, drop.id), null);
  assert.equal(existsSync(path.join(tmp, ".data", drop.filePath)), false);
  assert.equal(existsSync(path.join(tmp, ".data", keep.filePath)), true, "other certificates' files stay");
});

test("a record read while it was being rewritten is not cached under the old hash", async () => {
  const userId = randomUUID();
  const c = cert(userId, { title: "v1" });
  await db.saveCertificate(c);
  const v1 = manifestOf(userId).certs[c.id];
  // the file is already v2 but the manifest still says v1 (a save between its two writes)
  writeFileSync(path.join(tmp, ".data", `users/${userId}/certs/${c.id}.json`), JSON.stringify({ ...c, title: "v2" }));
  otherInstance();
  await db.listCertificates(userId);
  // the save is undone back to v1 content: the instance must not answer v1 with the v2 it read
  await db.saveCertificate(c);
  assert.equal(manifestOf(userId).certs[c.id], v1);
  assert.equal((await db.listCertificates(userId))[0].title, "v1");
});

test("putJsonIfMatch: stale tag and create-over-existing both refuse", async () => {
  const p = "misc/cas.json";
  assert.equal(await storage.putJsonIfMatch(p, { n: 1 }, null), true);
  assert.equal(await storage.putJsonIfMatch(p, { n: 2 }, null), false, "create-only on an existing file");
  const cur = await storage.getJsonTagged<{ n: number }>(p);
  assert.equal(await storage.putJsonIfMatch(p, { n: 2 }, cur!.etag), true);
  assert.equal(await storage.putJsonIfMatch(p, { n: 3 }, cur!.etag), false, "tag from before the last write");
  assert.equal((await storage.getJsonTagged<{ n: number }>(p))!.value.n, 2);
});
