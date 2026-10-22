import "server-only";
import { randomBytes } from "crypto";
import { sendEmail } from "../email";
import { CONTACT_EMAIL } from "../site";
import { getRecords, updateRecord } from "../records";
import { DAY_TTL_SEC, dayLv, lastDays } from "./day";

/*
 * "Report a problem" messages: feedback/YYYY-MM-DD.json, one record a day (expires after KEEP_DAYS), plus an email to info@.
 * One read and one write per message. The day record also holds the per-sender count, so the daily limit
 * holds across server instances without a separate rate-limit record.
 */

export type FeedbackEntry = {
  id: string;
  at: string;
  /** where to reply: the account email, or what a demo visitor typed in; null when none */
  email: string | null;
  demo: boolean;
  message: string;
  /** path without query string, only when the sender ticked "include this page" */
  route: string | null;
  certId: string | null;
  locale: string;
  device: string;
};

export type FeedbackDay = { day: string; entries: FeedbackEntry[]; bySender: Record<string, number> };

export const PER_SENDER_PER_DAY = 10;
const MAX_PER_DAY = 200;
const pathOf = (day: string) => `feedback/${day}.json`;

/** Stores the message and emails it to info@. "limited" when this sender or the whole day is over the limit. */
export async function submitFeedback(
  input: Omit<FeedbackEntry, "id" | "at">,
  /** pseudonymous sender tag (user, or IP for the shared demo account) for the daily limit */
  sender: string,
  now = new Date(),
): Promise<"ok" | "limited"> {
  const day = dayLv(now);
  const entry: FeedbackEntry = { id: randomBytes(6).toString("base64url"), at: now.toISOString(), ...input };
  let limited = false;
  // a conditional update, retried on a conflict: two messages at once both land
  await updateRecord<FeedbackDay>(
    pathOf(day),
    (cur) => {
      const file = cur ?? { day, entries: [], bySender: {} };
      limited = (file.bySender[sender] ?? 0) >= PER_SENDER_PER_DAY || file.entries.length >= MAX_PER_DAY;
      if (limited) return undefined;
      return { day, entries: [...file.entries, entry], bySender: { ...file.bySender, [sender]: (file.bySender[sender] ?? 0) + 1 } };
    },
    { ttlSec: DAY_TTL_SEC },
  );
  if (limited) return "limited";
  await sendEmail({
    to: CONTACT_EMAIL,
    ...(entry.email ? { replyTo: entry.email } : {}),
    subject: `Medserti: ziņojums par problēmu${entry.demo ? " (demo)" : ""}`,
    text: [
      entry.message,
      "",
      "---",
      `No: ${entry.email ?? "(nav e-pasta)"}${entry.demo ? " (demo konts)" : ""}`,
      `Lapa: ${entry.route ?? "(nav pievienota)"}`,
      entry.certId ? `Sertifikāts: ${entry.certId}` : null,
      `Valoda: ${entry.locale}`,
      `Ierīce: ${entry.device || "nezināma"}`,
      `Visi ziņojumi: https://medserti.lv/admin/kludas`,
    ]
      .filter((l) => l !== null)
      .join("\n"),
  }).catch((e) => console.error("[feedback] email failed (stored)", e));
  return "ok";
}

/** Day records for the admin page, newest first (one command) */
export async function readFeedbackDays(n = 7): Promise<FeedbackDay[]> {
  const days = await getRecords<FeedbackDay>(lastDays(n).map(pathOf));
  return days.filter((d): d is FeedbackDay => !!d);
}
