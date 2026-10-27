import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/db";
import { startSession, verifyPassword } from "@/lib/auth";
import { clearLimit, clientIp, limitState, rateLimit } from "@/lib/password-reset";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });
const MINUTE = 60 * 1000;
// only failed attempts count: 10 per email per 15 min, 30 per IP per hour
const EMAIL_LIMIT = [10, 15 * MINUTE] as const;
const IP_LIMIT = [30, 60 * MINUTE] as const;
/** bcrypt hash of a random string, cost 10 like real hashes (lib/auth.ts hashPassword) */
const DUMMY_HASH = "$2b$10$Zaj9rWtfq9yFWLmifpNvMOgyMZ7rAjYG6CTkPa3f2pcMMIBJI67Py";

export async function POST(req: Request) {
  const m = t(await getLocale()).api;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: m.enterEmailPassword }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  const emailKey = `login-email:${email}`;
  const ipKey = `login-ip:${clientIp(req)}`;

  const [byEmail, byIp] = await Promise.all([limitState(emailKey, ...EMAIL_LIMIT), limitState(ipKey, ...IP_LIMIT)]);
  if (!byEmail.under || !byIp.under)
    return NextResponse.json({ error: m.tooManyLogins }, { status: 429 });

  const user = await getUserByEmail(email);
  // an unknown email still runs one bcrypt check, so the response time does not tell which emails are registered
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await Promise.all([rateLimit(emailKey, ...EMAIL_LIMIT), rateLimit(ipKey, ...IP_LIMIT)]);
    return NextResponse.json({ error: m.wrongCredentials }, { status: 401 });
  }
  // most sign-ins have no failed attempts on record: nothing to clear, and clearing costs a command
  if (byEmail.recorded) await clearLimit(emailKey);
  await startSession(user.id, user.sessionVersion ?? 0);
  return NextResponse.json({ ok: true });
}
