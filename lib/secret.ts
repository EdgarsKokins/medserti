import "server-only";

/** AUTH_SECRET as bytes: signs sessions (lib/auth.ts), the admin cookie (lib/admin.ts) and email links (lib/notifications.ts) */
export function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
    return new TextEncoder().encode("dev-only-secret-change-me-dev-only-secret");
  }
  return new TextEncoder().encode(s);
}
