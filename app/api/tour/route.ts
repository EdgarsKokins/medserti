import { NextResponse } from "next/server";
import { requireWritableUser } from "@/lib/auth";
import { getUser, saveUser } from "@/lib/db";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

/**
 * The guided tour was shown: remembered on the account, so it does not start again on another device.
 * Stores only the time. The footer link reopens it without coming here.
 */
export async function POST() {
  const m = t(await getLocale()).api;
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  // re-read just before writing, as the profile route does, so a password reset in between is not undone
  const fresh = await getUser(g.user.id);
  if (!fresh || (fresh.sessionVersion ?? 0) !== (g.user.sessionVersion ?? 0)) return NextResponse.json({ error: m.notSignedIn }, { status: 401 });
  if (!fresh.tourSeenAt) await saveUser({ ...fresh, tourSeenAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
