import "server-only";
import { createHash, randomBytes } from "crypto";
import { getJson, putJson, remove } from "./storage";

/*
 * Layout in storage:
 *   reset-tokens/<sha256(token)>.json   -> ResetToken (the raw token only ever lives in the email link)
 *   rate-limits/<sha256(key)>.json      -> { count, windowStart }
 */
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

type ResetToken = { userId: string; createdAt: string; expiresAt: string; sessionVersion: number };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const tokenPath = (token: string) => `reset-tokens/${sha256(token)}.json`;

/** New single-use token for a user; returns the raw value for the link */
export async function createResetToken(userId: string, sessionVersion: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await putJson(tokenPath(token), {
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TOKEN_TTL_MS).toISOString(),
    sessionVersion,
  } satisfies ResetToken);
  return token;
}

/** Valid, unexpired token record, or null. Does not consume it. */
export async function readResetToken(token: string): Promise<ResetToken | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rec = await getJson<ResetToken>(tokenPath(token));
  if (!rec) return null;
  if (Date.parse(rec.expiresAt) < Date.now()) {
    await remove(tokenPath(token));
    return null;
  }
  return rec;
}

export async function deleteResetToken(token: string): Promise<void> {
  await remove(tokenPath(token));
}

/**
 * Fixed-window counter in storage. Good enough to stop scripted abuse without paid infra;
 * two parallel requests can both read the same count, so the limit is approximate.
 * Returns true when the action is allowed.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const path = `rate-limits/${sha256(key)}.json`;
  const now = Date.now();
  const rec = await getJson<{ count: number; windowStart: number }>(path);
  const fresh = !rec || now - rec.windowStart > windowMs;
  const next = fresh ? { count: 1, windowStart: now } : { count: rec.count + 1, windowStart: rec.windowStart };
  if (next.count > max) return false;
  await putJson(path, next);
  return true;
}

/** Read-only check of a rateLimit() counter: true while fewer than max hits fall inside the window */
export async function underLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const rec = await getJson<{ count: number; windowStart: number }>(`rate-limits/${sha256(key)}.json`);
  return !rec || Date.now() - rec.windowStart > windowMs || rec.count < max;
}

export async function clearLimit(key: string): Promise<void> {
  await remove(`rate-limits/${sha256(key)}.json`);
}

/** Caller IP as Vercel reports it */
export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
