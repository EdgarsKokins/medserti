import "server-only";
import { createHash } from "crypto";

/** Error and feedback day records are kept this many days: each write sets the record to expire a day after that */
export const KEEP_DAYS = 30;
export const DAY_TTL_SEC = (KEEP_DAYS + 1) * 86_400;

const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Riga", year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in Latvia, `back` days before `now` */
export const dayLv = (now = new Date(), back = 0) => fmt.format(new Date(now.getTime() - back * 86_400_000));

/** The last n days, newest first */
export const lastDays = (n: number, now = new Date()) => Array.from({ length: n }, (_, i) => dayLv(now, i));

/** One-way tag for a user id or IP: the same person shows as the same tag, and the tag cannot be turned back into the id */
export const pseudonym = (kind: string, value: string) =>
  createHash("sha256").update(`${process.env.AUTH_SECRET || "dev"}:${kind}:${value}`).digest("hex").slice(0, 10);
