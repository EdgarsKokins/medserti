import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/db";
import { startSession, verifyPassword } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const m = t(await getLocale()).api;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: m.enterEmailPassword }, { status: 400 });
  const user = await getUserByEmail(parsed.data.email);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash)))
    return NextResponse.json({ error: m.wrongCredentials }, { status: 401 });
  await startSession(user.id, user.sessionVersion ?? 0);
  return NextResponse.json({ ok: true });
}
