import "server-only";
import { createHash } from "crypto";
import { removeExact } from "../storage";

/** Error and feedback files are kept this many days, then deleted (pruneMonitoring, from the daily cron) */
export const KEEP_DAYS = 30;

const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Riga", year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in Latvia, `back` days before `now` */
export const dayLv = (now = new Date(), back = 0) => fmt.format(new Date(now.getTime() - back * 86_400_000));

/** The last n days, newest first */
export const lastDays = (n: number, now = new Date()) => Array.from({ length: n }, (_, i) => dayLv(now, i));

/** One-way tag for a user id or IP: the same person shows as the same tag, and the tag cannot be turned back into the id */
export const pseudonym = (kind: string, value: string) =>
  createHash("sha256").update(`${process.env.AUTH_SECRET || "dev"}:${kind}:${value}`).digest("hex").slice(0, 10);

/**
 * Deletes errors/ and feedback/ files older than KEEP_DAYS by name: no listing, and deletes are free.
 * Covers 15 days past the limit, so a few missed cron runs still get cleaned up.
 */
export async function pruneMonitoring(now = new Date()): Promise<void> {
  const days = Array.from({ length: 15 }, (_, i) => dayLv(now, KEEP_DAYS + 1 + i));
  await removeExact(days.flatMap((d) => [`errors/${d}.json`, `feedback/${d}.json`]));
}
