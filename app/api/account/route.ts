import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteUserData } from "@/lib/db";
import { currentUser, endSession, verifyPassword } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const Body = z.object({ password: z.string().min(1) });

/** Delete the signed-in account and all its data. The user confirms with their password. */
export async function DELETE(req: Request) {
  const d = t(await getLocale());
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: d.api.notSignedIn }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: d.api.passwordRequired }, { status: 400 });
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: d.legal.deleteAccount.wrongPassword }, { status: 403 });
  }
  try {
    await deleteUserData(user);
  } catch {
    return NextResponse.json({ error: d.legal.deleteAccount.failed }, { status: 500 });
  }
  await endSession();
  return NextResponse.json({ ok: true });
}
