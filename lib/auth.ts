import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getUser } from "./db";
import { isDemoUserId } from "./demo/id";
import { t } from "./i18n";
import { getLocale } from "./i18n/server";
import type { UserRecord } from "./types";

const COOKIE = "cme_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
    return new TextEncoder().encode("dev-only-secret-change-me-dev-only-secret");
  }
  return new TextEncoder().encode(s);
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function startSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<UserRecord | null> {
  const id = await currentUserId();
  return id ? getUser(id) : null;
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
