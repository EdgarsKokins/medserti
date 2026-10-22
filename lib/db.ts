import "server-only";
import { createHash } from "crypto";
import { getJson, getJsonTagged, getJsonVersion, listVersions, putJson, putJsonIfMatch, remove, removeWhere } from "./storage";
import type { CmeCertificate, UserRecord } from "./types";

/*
 * Layout in storage:
 *   users/index/<sha256(email)>.json        -> { userId }
 *   users/<userId>/user.json                -> UserRecord
 *   users/<userId>/certs/<certId>.json      -> CmeCertificate
 *   users/<userId>/certs.json               -> CertManifest (which certificates exist, and the version of each)
 *   users/<userId>/files/<certId>/<name>    -> uploaded file
 */
const emailKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const idx = await getJson<{ userId: string }>(`users/index/${emailKey(email)}.json`);
  return idx ? getUser(idx.userId) : null;
}

export async function getUser(userId: string): Promise<UserRecord | null> {
  return getJson<UserRecord>(`users/${userId}/user.json`);
}

export async function createUser(user: UserRecord): Promise<void> {
  await putJson(`users/${user.id}/user.json`, user);
  await putJson(`users/index/${emailKey(user.email)}.json`, { userId: user.id });
  // an empty manifest now saves the folder listing that building it on the first page view would cost
  await putJsonIfMatch(manifestPath(user.id), { v: 1, certs: {} } satisfies CertManifest, null);
}

export async function saveUser(user: UserRecord): Promise<void> {
  await putJson(`users/${user.id}/user.json`, user);
}

/** after this long a "parsing" record is treated as failed: uploads written before Oct 2026 saved a placeholder that a crash could leave behind */
const STALE_PARSING_MS = 2 * 60 * 1000;

/** The parse note for a certificate whose file is stored but could not be read: the user enters the details */
export const unreadableNote = (contentType: string) =>
  JSON.stringify([{ code: contentType === "application/pdf" ? "pdfUnreadable" : "imageUnreadable" }]);

function recoverStale(c: CmeCertificate, now = Date.now()): CmeCertificate {
  if (c.status !== "parsing" || now - Date.parse(c.uploadedAt) < STALE_PARSING_MS) return c;
  return { ...c, status: "failed", parseNotes: c.parseNotes ?? unreadableNote(c.contentType) };
}

/*
 * The manifest lists a user's certificates with a hash of each record. A page reads it (1 simple Blob operation)
 * instead of listing the certs/ folder (1 advanced operation, and the free plan has 5x fewer of those), and only
 * records whose hash changed since this server instance last read them are fetched again.
 * Every save and delete rewrites it with a conditional write, so two concurrent saves cannot drop each other's entry.
 * Accounts from before the manifest get one on first use, built from a single listing.
 */
type CertManifest = { v: 1; certs: Record<string, string> };

const certPath = (userId: string, certId: string) => `users/${userId}/certs/${certId}.json`;
const manifestPath = (userId: string) => `users/${userId}/certs.json`;
export const certVersion = (cert: CmeCertificate) => createHash("sha256").update(JSON.stringify(cert)).digest("hex").slice(0, 20);
const isHash = (v: string) => /^[0-9a-f]{20}$/.test(v);

/** id -> version from a listing of the certs/ folder: the listing's own version tags, which work just as well as hashes */
async function manifestFromListing(userId: string): Promise<Record<string, string>> {
  const prefix = `users/${userId}/certs/`;
  const certs: Record<string, string> = {};
  for (const e of await listVersions(prefix)) {
    const id = e.path.slice(prefix.length).replace(/\.json$/, "");
    if (e.path.endsWith(".json") && !id.includes("/")) certs[id] = e.version;
  }
  return certs;
}

async function readManifest(userId: string): Promise<Record<string, string>> {
  const cur = await getJsonTagged<CertManifest>(manifestPath(userId));
  if (cur) return cur.value.certs;
  const certs = await manifestFromListing(userId);
  // create-only: if a save created the manifest meanwhile, that one wins and holds everything this listing saw
  await putJsonIfMatch(manifestPath(userId), { v: 1, certs } satisfies CertManifest, null);
  return certs;
}

const MANIFEST_TRIES = 10;

/** Read-modify-write of the manifest, retried when another write got in between. `change` returns false for no change. */
async function updateManifest(userId: string, change: (certs: Record<string, string>) => boolean): Promise<void> {
  for (let i = 0; i < MANIFEST_TRIES; i++) {
    const cur = await getJsonTagged<CertManifest>(manifestPath(userId));
    const certs = cur ? { ...cur.value.certs } : await manifestFromListing(userId);
    if (!change(certs) && cur) return;
    if (await putJsonIfMatch(manifestPath(userId), { v: 1, certs } satisfies CertManifest, cur?.etag ?? null)) return;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 50 * (i + 1)));
  }
  throw new Error("Certificate manifest: too many concurrent writes");
}

export async function listCertificates(userId: string): Promise<CmeCertificate[]> {
  const manifest = await readManifest(userId);
  const certs = await Promise.all(
    // hashes are checked against what was read; tags from a listing (older accounts, until the next save) are not hashes
    Object.entries(manifest).map(([id, v]) => getJsonVersion<CmeCertificate>(certPath(userId, id), v, isHash(v) ? (c) => certVersion(c) === v : undefined)),
  );
  return certs
    .filter((c): c is CmeCertificate => !!c)
    .map((c) => recoverStale(c))
    .sort((a, b) => (b.date ?? b.uploadedAt).localeCompare(a.date ?? a.uploadedAt));
}

export async function getCertificate(userId: string, certId: string): Promise<CmeCertificate | null> {
  const c = await getJson<CmeCertificate>(certPath(userId, certId));
  return c && recoverStale(c);
}

/** The record first, then the manifest: a reader never sees a version whose record is not written yet */
export async function saveCertificate(cert: CmeCertificate): Promise<void> {
  await saveCertificates([cert]);
}

/** Several records of one user with a single manifest update (the demo seed) */
export async function saveCertificates(certs: CmeCertificate[]): Promise<void> {
  if (!certs.length) return;
  const userId = certs[0].userId;
  if (certs.some((c) => c.userId !== userId)) throw new Error("saveCertificates: one user at a time");
  await Promise.all(certs.map((c) => putJson(certPath(userId, c.id), c)));
  await updateManifest(userId, (m) => {
    let changed = false;
    for (const c of certs) {
      const v = certVersion(c);
      if (m[c.id] !== v) (m[c.id] = v), (changed = true);
    }
    return changed;
  });
}

/** Out of the manifest first, so no page lists it while its files go; then the record and its files in one listing */
export async function deleteCertificate(userId: string, certId: string): Promise<void> {
  await updateManifest(userId, (m) => certId in m && delete m[certId]);
  const record = certPath(userId, certId);
  const files = `users/${userId}/files/${certId}/`;
  await removeWhere(`users/${userId}/`, (p) => p === record || p.startsWith(files));
}

/**
 * Delete an account and everything stored for it: certificate records, uploaded files, the user record and the email index.
 * Files go first and the user record last, so a failed run can be retried while still signed in.
 */
export async function deleteUserData(user: UserRecord): Promise<void> {
  // ids are UUIDs; anything else could reach outside the user's own folder (e.g. users/index/)
  if (!/^[0-9a-f-]{36}$/i.test(user.id)) throw new Error("Unexpected user id");
  await remove(`users/${user.id}/files/`);
  await remove(`users/${user.id}/certs/`);
  await remove(`users/${user.id}/`);
  await remove(`users/index/${emailKey(user.email)}.json`);
}
