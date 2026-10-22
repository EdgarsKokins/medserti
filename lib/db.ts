import "server-only";
import { createHash } from "crypto";
import { getJson, getJsonVersion, listVersions, putJson, remove } from "./storage";
import type { CmeCertificate, UserRecord } from "./types";

/*
 * Layout in storage:
 *   users/index/<sha256(email)>.json        -> { userId }
 *   users/<userId>/user.json                -> UserRecord
 *   users/<userId>/certs/<certId>.json      -> CmeCertificate
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

export async function listCertificates(userId: string): Promise<CmeCertificate[]> {
  // the listing says which version of each certificate is current; only changed ones are read
  const entries = (await listVersions(`users/${userId}/certs/`)).filter((e) => e.path.endsWith(".json"));
  const certs = await Promise.all(entries.map((e) => getJsonVersion<CmeCertificate>(e.path, e.version)));
  return certs
    .filter((c): c is CmeCertificate => !!c)
    .map((c) => recoverStale(c))
    .sort((a, b) => (b.date ?? b.uploadedAt).localeCompare(a.date ?? a.uploadedAt));
}

export async function getCertificate(userId: string, certId: string): Promise<CmeCertificate | null> {
  const c = await getJson<CmeCertificate>(`users/${userId}/certs/${certId}.json`);
  return c && recoverStale(c);
}

export async function saveCertificate(cert: CmeCertificate): Promise<void> {
  await putJson(`users/${cert.userId}/certs/${cert.id}.json`, cert);
}

export async function deleteCertificate(userId: string, certId: string): Promise<void> {
  await remove(`users/${userId}/certs/${certId}.json`);
  await remove(`users/${userId}/files/${certId}/`);
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
