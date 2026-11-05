import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { secret } from "./secret";

/**
 * The session token and its lifetimes, with no storage and no next/headers, so proxy.ts can renew a login without a
 * database call. Whether the token's `sv` is still the user's current one is checked in lib/auth currentUser(), which has the user.
 */
export const SESSION_COOKIE = "cme_session";
const DAY = 60 * 60 * 24;
/** "Remember me" ticked: renewed with use, so this is the longest a login can sit unused */
export const REMEMBERED_MAX_AGE = 30 * DAY;
/** Not ticked, and sign-up, password reset and the demo, which have no box. Never renewed */
export const PLAIN_MAX_AGE = 8 * 60 * 60;
/** A remembered token is re-issued at most once a day: every page load past that gets a fresh 30 days */
const RENEW_AFTER = DAY;

export const sessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

/** `rm` is only ever true on a remembered login; it is missing on the others and on tokens issued before it existed */
export function signSession(userId: string, sessionVersion: number, remember: boolean, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  return new SignJWT({ sub: userId, sv: sessionVersion, ...(remember ? { rm: true } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(iat + (remember ? REMEMBERED_MAX_AGE : PLAIN_MAX_AGE))
    .sign(secret());
}

/** The token's claims if the signature and expiry hold, or null. Says nothing yet about the user's current `sv` */
export async function readSession(token: string, now = Date.now()) {
  try {
    const { payload } = await jwtVerify(token, secret(), { currentDate: new Date(now) });
    if (typeof payload.sub !== "string") return null;
    return {
      userId: payload.sub,
      sv: typeof payload.sv === "number" ? payload.sv : 0,
      remembered: payload.rm === true,
      issuedAt: payload.iat ?? 0,
    };
  } catch {
    return null;
  }
}

/** A password reset bumps user.sessionVersion, which ends every token issued before it */
export const isCurrentSession = (session: { sv: number }, user: { sessionVersion?: number }) => session.sv === (user.sessionVersion ?? 0);

/**
 * A new token when a remembered one is due, or null. It carries the same `sv`: a token from before a password reset
 * stays one, and isCurrentSession keeps rejecting it. Tokens without `rm` run out on their original date.
 */
export async function renewedToken(token: string, now = Date.now()): Promise<string | null> {
  const session = await readSession(token, now);
  if (!session?.remembered || now / 1000 - session.issuedAt < RENEW_AFTER) return null;
  return signSession(session.userId, session.sv, true, now);
}
