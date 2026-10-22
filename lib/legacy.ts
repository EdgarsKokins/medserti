import { DAY_TTL_SEC } from "./monitoring/day";

/*
 * Where each JSON record of the old Blob layout lives in Redis, and how long it should live there.
 * Shared by the read-through in lib/records.ts and the migration in lib/migrate-records.ts.
 *
 *   users/<id>/user.json, users/<id>/demo.json, users/index/<h>.json, courses/index.json, i18n/*.json -> same key
 *   users/<id>/certs/<certId>.json  -> field <certId> of the hash users/<id>/certs (only certificates the
 *                                      manifest users/<id>/certs.json lists, when it exists)
 *   courses/details/<ref>.json      -> same key, expiring 14 days after fetchedAt
 *   reset-tokens/<h>.json           -> same key, expiring at expiresAt
 *   errors/<day>.json, feedback/<day>.json -> same key, expiring DAY_TTL_SEC after the day
 *   rate-limits/*                   -> not copied: counters reset (new format, windows of an hour or a day)
 *   users/<id>/files/**             -> not records: files stay in Blob
 */

export type LegacyKind =
  | "user"
  | "emailIndex"
  | "demo"
  | "cert"
  | "manifest"
  | "courseIndex"
  | "courseDetails"
  | "i18n"
  | "resetToken"
  | "errors"
  | "feedback"
  | "rateLimit"
  | "file"
  | "other"
  | "notJson";
export type LegacyTarget = { key: string; field: string | null };

/** as app/api/courses/details/route.ts keeps them: twice its 7-day MAX_AGE */
export const COURSE_DETAILS_KEEP_SEC = 14 * 86_400;

const UUID = "[0-9a-f-]{36}";
export function classifyLegacy(p: string): { kind: LegacyKind; target?: LegacyTarget } {
  let m: RegExpExecArray | null;
  if (new RegExp(`^users/${UUID}/files/`, "i").test(p)) return { kind: "file" };
  if ((m = new RegExp(`^users/(${UUID})/certs/([^/]+)\\.json$`, "i").exec(p))) return { kind: "cert", target: { key: `users/${m[1]}/certs`, field: m[2] } };
  if (new RegExp(`^users/${UUID}/certs\\.json$`, "i").test(p)) return { kind: "manifest" };
  if (!p.endsWith(".json")) return { kind: "notJson" };
  const same = { key: p, field: null };
  if (/^users\/index\/[0-9a-f]{64}\.json$/.test(p)) return { kind: "emailIndex", target: same };
  if (new RegExp(`^users/${UUID}/user\\.json$`, "i").test(p)) return { kind: "user", target: same };
  if (new RegExp(`^users/${UUID}/demo\\.json$`, "i").test(p)) return { kind: "demo", target: same };
  if (p === "courses/index.json") return { kind: "courseIndex", target: same };
  if (p.startsWith("courses/details/")) return { kind: "courseDetails", target: same };
  if (p.startsWith("i18n/")) return { kind: "i18n", target: same };
  if (p.startsWith("reset-tokens/")) return { kind: "resetToken", target: same };
  if (/^errors\/\d{4}-\d{2}-\d{2}\.json$/.test(p)) return { kind: "errors", target: same };
  if (/^feedback\/\d{4}-\d{2}-\d{2}\.json$/.test(p)) return { kind: "feedback", target: same };
  if (p.startsWith("rate-limits/")) return { kind: "rateLimit" };
  return { kind: "other", target: same };
}

/** Seconds the record should live, from its content; undefined for no expiry, 0 or less for already expired */
export function legacyTtl(kind: LegacyKind, p: string, value: Record<string, unknown>, now = Date.now()): number | undefined {
  const left = (until: number) => Math.floor((until - now) / 1000);
  if (kind === "courseDetails") return left(Date.parse(String(value.fetchedAt)) + COURSE_DETAILS_KEEP_SEC * 1000);
  if (kind === "resetToken") return left(Date.parse(String(value.expiresAt)));
  if (kind === "errors" || kind === "feedback") {
    // the app sets DAY_TTL_SEC on every write during the day, so the record lives until about a day after KEEP_DAYS
    const day = p.match(/(\d{4}-\d{2}-\d{2})/)![1];
    return left(Date.parse(`${day}T23:59:59Z`) + DAY_TTL_SEC * 1000);
  }
  return undefined;
}

/** Keys a page may read before the migration has copied them: read through from Blob (lib/records.ts) */
export const READ_THROUGH: LegacyKind[] = ["user", "emailIndex", "demo", "courseIndex", "courseDetails", "i18n", "errors", "feedback"];

/** The hash of a user's certificates, users/<id>/certs -> the user id */
export const certsHashUser = (key: string) => new RegExp(`^users/(${UUID})/certs$`, "i").exec(key)?.[1] ?? null;

/** Redis key set once a user's certificates were read through from Blob (or the user is new): no second fill */
export const certsLoadedKey = (userId: string) => `users/${userId}/certs.loaded`;

/** Set by the migration after a complete run without errors: the read-through stops for good */
export const MIGRATION_DONE_KEY = "meta/blob-migration-done";
/** The migration's progress (per record: Blob version and what was written), so a run can resume or repeat */
export const MIGRATION_STATE_KEY = "meta/blob-migration-state";
