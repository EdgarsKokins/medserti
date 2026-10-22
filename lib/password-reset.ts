import "server-only";
import { createHash, randomBytes } from "crypto";
import { deleteRecords, getRecord, incrementWindow, setRecord } from "./records";
import { removeExact } from "./storage";

/*
 * Records (lib/records.ts), both expiring on their own:
 *   reset-tokens/<sha256(token)>.json   -> ResetToken (the raw token only ever lives in the email link), TTL 1 hour
 *   rate-limits/<sha256(key)>           -> hit count, TTL = the window
 */
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

type ResetToken = { userId: string; createdAt: string; expiresAt: string; sessionVersion: number };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const tokenPath = (token: string) => `reset-tokens/${sha256(token)}.json`;

/** New single-use token for a user; returns the raw value for the link */
export async function createResetToken(userId: string, sessionVersion: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await setRecord(
    tokenPath(token),
    {
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TOKEN_TTL_MS).toISOString(),
      sessionVersion,
    } satisfies ResetToken,
    { ttlSec: TOKEN_TTL_MS / 1000 },
  );
  return token;
}

/** Valid, unexpired token record, or null. Does not consume it. */
export async function readResetToken(token: string): Promise<ResetToken | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rec = await getRecord<ResetToken>(tokenPath(token));
  // the record expires by itself; the date check covers the last second of its TTL
  return rec && Date.parse(rec.expiresAt) >= Date.now() ? rec : null;
}

export async function deleteResetToken(token: string): Promise<void> {
  // and its old Blob copy (free), so the migration cannot bring a used token back
  await removeExact([tokenPath(token)]);
  await deleteRecords([tokenPath(token)]);
}

const limitKey = (key: string) => `rate-limits/${sha256(key)}`;

/**
 * Fixed-window counter: one atomic increment per hit, and the window starts at the first hit and expires by itself.
 * Returns true when the action is allowed.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  return (await incrementWindow(limitKey(key), windowMs / 1000)) <= max;
}

/** Read-only check of a rateLimit() counter: under while fewer than max hits fall inside the window; recorded when a counter exists */
export async function limitState(key: string, max: number, _windowMs: number): Promise<{ under: boolean; recorded: boolean }> {
  const count = await getRecord<number>(limitKey(key));
  return { under: count === null || count < max, recorded: count !== null };
}

/** limitState().under */
export async function underLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  return (await limitState(key, max, windowMs)).under;
}

export async function clearLimit(key: string): Promise<void> {
  await deleteRecords([limitKey(key)]);
}

/** Caller IP as Vercel reports it */
export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
