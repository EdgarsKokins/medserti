import "server-only";
import { createHash } from "crypto";
import { deleteHashFields, deleteRecords, deleteRecordsUnder, getHash, getHashField, getRecord, setHashFields, setRecord } from "./records";
import { remove } from "./storage";
import type { CmeCertificate, UserRecord } from "./types";

/*
 * Records (lib/records.ts, Redis):
 *   users/index/<sha256(email)>.json        -> { userId }
 *   users/<userId>/user.json                -> UserRecord
 *   users/<userId>/certs                    -> hash: field <certId> = CmeCertificate
 * Files (lib/storage.ts, Blob):
 *   users/<userId>/files/<certId>/<name>    -> uploaded file
 *
 * One hash per user: a page lists every certificate with one command (HGETALL), and a save or delete writes only its
 * own field, so two concurrent saves cannot drop each other.
 */
const emailKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const indexKey = (email: string) => `users/index/${emailKey(email)}.json`;
const userKey = (userId: string) => `users/${userId}/user.json`;
const certsKey = (userId: string) => `users/${userId}/certs`;

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const idx = await getRecord<{ userId: string }>(indexKey(email));
  return idx ? getUser(idx.userId) : null;
}

export async function getUser(userId: string): Promise<UserRecord | null> {
  return getRecord<UserRecord>(userKey(userId));
}

export async function createUser(user: UserRecord): Promise<void> {
  await setRecord(userKey(user.id), user);
  await setRecord(indexKey(user.email), { userId: user.id });
}

export async function saveUser(user: UserRecord): Promise<void> {
  await setRecord(userKey(user.id), user);
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

export async function listCertificates(userId: string): Promise<CmeCertificate[]> {
  return Object.values(await getHash<CmeCertificate>(certsKey(userId)))
    .map((c) => recoverStale(c))
    .sort((a, b) => (b.date ?? b.uploadedAt).localeCompare(a.date ?? a.uploadedAt));
}

export async function getCertificate(userId: string, certId: string): Promise<CmeCertificate | null> {
  const c = await getHashField<CmeCertificate>(certsKey(userId), certId);
  return c && recoverStale(c);
}

export async function saveCertificate(cert: CmeCertificate): Promise<void> {
  await saveCertificates([cert]);
}

/** Several records of one user in one command (the demo seed) */
export async function saveCertificates(certs: CmeCertificate[]): Promise<void> {
  if (!certs.length) return;
  const userId = certs[0].userId;
  if (certs.some((c) => c.userId !== userId)) throw new Error("saveCertificates: one user at a time");
  await setHashFields(certsKey(userId), Object.fromEntries(certs.map((c) => [c.id, c])));
}

/** The record first, so no page lists it while its files go; then the files */
export async function deleteCertificate(userId: string, certId: string): Promise<void> {
  await deleteHashFields(certsKey(userId), [certId]);
  await remove(`users/${userId}/files/${certId}/`);
}

/**
 * Delete an account and everything stored for it: uploaded files, certificate records, the user record and the email index.
 * Files go first and the user record last, so a failed run can be retried while still signed in.
 */
export async function deleteUserData(user: UserRecord): Promise<void> {
  // ids are UUIDs; anything else could reach outside the user's own records (e.g. users/index/)
  if (!/^[0-9a-f-]{36}$/i.test(user.id)) throw new Error("Unexpected user id");
  await remove(`users/${user.id}/files/`);
  await deleteRecords([certsKey(user.id)]);
  await deleteRecords([indexKey(user.email)]);
  await deleteRecordsUnder(`users/${user.id}/`);
}
