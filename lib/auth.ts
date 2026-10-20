import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getUser } from "./db";
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

/** Session version (`sv` claim) must match user.sessionVersion; bumping it signs out every existing session */
export async function startSession(userId: string, sessionVersion = 0) {
  const token = await new SignJWT({ sub: userId, sv: sessionVersion })
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

/** Signed-in user from the cookie, or null. Sessions issued before the last password change are rejected. */
export const currentUser = cache(async (): Promise<UserRecord | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secret()));
  } catch {
    return null;
  }
  if (typeof payload.sub !== "string") return null;
  const user = await getUser(payload.sub);
  if (!user) return null;
  const sv = typeof payload.sv === "number" ? payload.sv : 0;
  return sv === (user.sessionVersion ?? 0) ? user : null;
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
