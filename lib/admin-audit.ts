import "server-only";
import { randomUUID } from "crypto";
import { getRecords, listRecordKeys, setRecord } from "./records";

/**
 * Admin views of a user's certificate data (privacy policy, "Piekļuve atbalstam"): when, what, which certificate.
 * One record per view under admin-audit/<userId>/, expiring after 12 months and deleted with the account (lib/db.ts).
 */
const TTL_SEC = 365 * 24 * 60 * 60;

export type AdminView = { at: string; action: "certificates" | "file"; certId: string | null };

export async function logAdminView(userId: string, action: AdminView["action"], certId: string | null = null): Promise<void> {
  const at = new Date().toISOString();
  // no ":" or "." in the key: the local record store keeps one file per key
  const key = `admin-audit/${userId}/${at.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  await setRecord(key, { at, action, certId } satisfies AdminView, { ttlSec: TTL_SEC });
}

/** Newest first */
export async function adminViews(userId: string): Promise<AdminView[]> {
  const keys = await listRecordKeys(`admin-audit/${userId}/`);
  return (await getRecords<AdminView>(keys)).filter((v): v is AdminView => !!v).sort((a, b) => b.at.localeCompare(a.at));
}
