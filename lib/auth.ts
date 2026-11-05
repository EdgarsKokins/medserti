import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getUser } from "./db";
import { isDemoUserId } from "./demo/id";
import { t } from "./i18n";
import { getLocale } from "./i18n/server";
import { isCurrentSession, PLAIN_MAX_AGE, readSession, REMEMBERED_MAX_AGE, SESSION_COOKIE, sessionCookieOptions, signSession } from "./session-token";
import type { UserRecord } from "./types";

// in its own module so code that only signs (email links) does not load the session code; re-exported for lib/admin
export { secret } from "./secret";

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/**
 * Session version (`sv` claim) must match user.sessionVersion; bumping it signs out every existing session.
 * `remember` is the sign-in box: 30 days, renewed with use in proxy.ts. Everything else lasts 8 hours and does not renew.
 */
export async function startSession(userId: string, sessionVersion = 0, remember = false) {
  const token = await signSession(userId, sessionVersion, remember);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(remember ? REMEMBERED_MAX_AGE : PLAIN_MAX_AGE));
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Signed-in user from the cookie, or null. Sessions issued before the last password change are rejected. */
export const currentUser = cache(async (): Promise<UserRecord | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await readSession(token);
  if (!session) return null;
  const user = await getUser(session.userId);
  if (!user) return null;
  return isCurrentSession(session, user) ? user : null;
});

export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}

/** For server components/pages: redirects to /login when signed out */
export async function requireUser(): Promise<UserRecord> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export const isDemoUser = (user: Pick<UserRecord, "id"> | null | undefined) => isDemoUserId(user?.id);

/**
 * For API routes that change data: the signed-in user, or the error response to return.
 * The one place that keeps the public demo account read-only (lib/demo). Every write route goes through here:
 *   const g = await requireWritableUser();
 *   if (!g.ok) return g.response;
 */
export async function requireWritableUser(): Promise<{ ok: true; user: UserRecord } | { ok: false; response: NextResponse }> {
  const user = await currentUser();
  if (!user || isDemoUser(user)) {
    const m = t(await getLocale()).api;
    return {
      ok: false,
      response: user
        ? NextResponse.json({ error: m.demoReadOnly, demo: true }, { status: 403 })
        : NextResponse.json({ error: m.notSignedIn }, { status: 401 }),
    };
  }
  return { ok: true, user };
}
