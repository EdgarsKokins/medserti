import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser, saveUser } from "@/lib/db";
import { hashPassword, startSession } from "@/lib/auth";
import { deleteResetToken, readResetToken } from "@/lib/password-reset";
import { passwordBreached, passwordTooLong } from "@/lib/password-policy";
import { isDemoUserId } from "@/lib/demo/id";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { validPassword } from "@/lib/validation";

const Body = z.object({ token: z.string().min(1), password: z.string().refine(validPassword) });

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
  if (passwordTooLong(password)) return NextResponse.json({ error: d.api.passwordLong }, { status: 400 });
  const rec = await readResetToken(token);
  const user = rec ? await getUser(rec.userId) : null;
  // A token issued before the last password change is dead even if it has not expired
  // the read-only demo account (lib/demo) never takes a new password
  if (!rec || !user || isDemoUserId(user.id) || rec.sessionVersion !== (user.sessionVersion ?? 0)) {
    if (rec) await deleteResetToken(token);
    return NextResponse.json({ error: d.reset.invalidBody, code: "invalid_token" }, { status: 400 });
  }

  if (await passwordBreached(password)) return NextResponse.json({ error: d.api.passwordBreached }, { status: 400 });

  const sessionVersion = (user.sessionVersion ?? 0) + 1;
  await deleteResetToken(token);
  await saveUser({ ...user, passwordHash: await hashPassword(password), sessionVersion });
  await startSession(user.id, sessionVersion);
  return NextResponse.json({ ok: true });
}
