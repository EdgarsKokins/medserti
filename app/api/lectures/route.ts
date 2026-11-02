import { NextResponse } from "next/server";
import { requireWritableUser } from "@/lib/auth";
import { getUser, saveUser } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

/**
 * Dashboard, "Lekcijas" tile: the user asks to hear when Medserti's own lectures start. Stores only the time they
 * asked; the admin users page counts them, so we know the demand before building the lectures.
 */
export async function POST() {
  const m = t(await getLocale()).api;
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  // re-read just before writing, as the profile route does, so a password reset in between is not undone
  const fresh = await getUser(g.user.id);
  if (!fresh || (fresh.sessionVersion ?? 0) !== (g.user.sessionVersion ?? 0)) return NextResponse.json({ error: m.notSignedIn }, { status: 401 });
  if (!fresh.lecturesInterestAt) await saveUser({ ...fresh, lecturesInterestAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
