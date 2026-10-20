import "server-only";
import { currentUser, userIdFromToken } from "./auth";
import { getUser } from "./db";
import type { UserRecord } from "./types";

/** Admins are listed by email in ADMIN_EMAILS (comma-separated). Empty or unset: nobody is admin. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** The signed-in user if they are an admin, else null. Callers answer 404 so the admin area stays invisible. */
export async function currentAdmin(): Promise<UserRecord | null> {
  return asAdmin(adminEmails().length ? await currentUser() : null);
}

/** The same check from a session cookie value (proxy.ts) */
export async function isAdminToken(token: string | undefined): Promise<boolean> {
  if (!adminEmails().length) return false;
  const id = await userIdFromToken(token);
  return !!asAdmin(id ? await getUser(id) : null);
}

function asAdmin(user: UserRecord | null): UserRecord | null {
  return user && adminEmails().includes(user.email.trim().toLowerCase()) ? user : null;
}

/** The same 404 as an unknown API path */
export const adminNotFound = () => new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
