import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser, saveUser } from "@/lib/db";
import { hashPassword, startSession } from "@/lib/auth";
import { deleteResetToken, readResetToken } from "@/lib/password-reset";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const Body = z.object({ token: z.string().min(1), password: z.string().min(8) });

export async function POST(req: Request) {
  const d = t(await getLocale());
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return field === "password"
      ? NextResponse.json({ error: d.api.passwordShort }, { status: 400 })
      : NextResponse.json({ error: d.reset.invalidBody, code: "invalid_token" }, { status: 400 });
  }
  const { token, password } = parsed.data;
  const rec = await readResetToken(token);
  const user = rec ? await getUser(rec.userId) : null;
  // A token issued before the last password change is dead even if it has not expired
  if (!rec || !user || rec.sessionVersion !== (user.sessionVersion ?? 0)) {
    if (rec) await deleteResetToken(token);
    return NextResponse.json({ error: d.reset.invalidBody, code: "invalid_token" }, { status: 400 });
  }

  const sessionVersion = (user.sessionVersion ?? 0) + 1;
  await deleteResetToken(token);
  await saveUser({ ...user, passwordHash: await hashPassword(password), sessionVersion });
  await startSession(user.id, sessionVersion);
  return NextResponse.json({ ok: true });
}
