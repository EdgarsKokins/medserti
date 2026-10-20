import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { secret } from "./auth";

/**
 * Admin access for /admin: one shared password, no user account needed.
 * The password comes from ADMIN_PASSWORD; unset, it is "1234" (temporary, set ADMIN_PASSWORD on Vercel to change it).
 * Changing the password signs every admin out, because the cookie carries a fingerprint of it.
 */
const COOKIE = "medserti_admin";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const password = () => process.env.ADMIN_PASSWORD || "1234";
const sha = (s: string) => createHash("sha256").update(s).digest();
const fingerprint = () => sha(`medserti-admin:${password()}`).toString("hex").slice(0, 16);

/** Constant-time password check */
export function passwordMatches(input: unknown): boolean {
  return typeof input === "string" && timingSafeEqual(sha(input), sha(password()));
}

export async function startAdminSession() {
  const token = await new SignJWT({ adm: fingerprint() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}

/** True when this request carries a valid admin cookie for the current password */
export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.adm === fingerprint();
  } catch {
    return false;
  }
}

/** API answer for anyone who is not signed in to /admin */
export const adminNotFound = () => new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
