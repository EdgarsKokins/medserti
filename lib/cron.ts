import "server-only";
import { createHash, timingSafeEqual } from "crypto";

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". Constant-time check; unset CRON_SECRET refuses everyone. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqual(sha(req.headers.get("authorization") ?? ""), sha(`Bearer ${secret}`));
}
