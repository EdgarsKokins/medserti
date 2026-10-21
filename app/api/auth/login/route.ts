import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/db";
import { startSession, verifyPassword } from "@/lib/auth";
import { clearLimit, clientIp, rateLimit, underLimit } from "@/lib/password-reset";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });
const MINUTE = 60 * 1000;
// only failed attempts count: 10 per email per 15 min, 30 per IP per hour
const EMAIL_LIMIT = [10, 15 * MINUTE] as const;
const IP_LIMIT = [30, 60 * MINUTE] as const;

export async function POST(req: Request) {
  const m = t(await getLocale()).api;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: m.enterEmailPassword }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  const emailKey = `login-email:${email}`;
  const ipKey = `login-ip:${clientIp(req)}`;

  if (!(await underLimit(emailKey, ...EMAIL_LIMIT)) || !(await underLimit(ipKey, ...IP_LIMIT)))
    return NextResponse.json({ error: m.tooManyLogins }, { status: 429 });

  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await Promise.all([rateLimit(emailKey, ...EMAIL_LIMIT), rateLimit(ipKey, ...IP_LIMIT)]);
    return NextResponse.json({ error: m.wrongCredentials }, { status: 401 });
  }
  await clearLimit(emailKey);
  await startSession(user.id, user.sessionVersion ?? 0);
  return NextResponse.json({ ok: true });
}
