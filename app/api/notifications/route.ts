import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWritableUser } from "@/lib/auth";
import { getUser, saveUser } from "@/lib/db";
import { getRecord, setRecord } from "@/lib/records";
import { EMPTY_STATE, prefsOf, type NotifyState } from "@/lib/notifications";
import { stateKey } from "@/lib/notify-run";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const Body = z.object({ reminders: z.boolean(), courseAlerts: z.boolean() });

/** Profile, "E-pasta paziņojumi": which emails this account gets. Also remembers the UI language for them. */
export async function PUT(req: Request) {
  const locale = await getLocale();
  const m = t(locale).api;
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: m.invalidInput }, { status: 400 });

  // re-read just before writing, as the profile route does, so a password reset in between is not undone
  const fresh = await getUser(g.user.id);
  if (!fresh || (fresh.sessionVersion ?? 0) !== (g.user.sessionVersion ?? 0)) return NextResponse.json({ error: m.notSignedIn }, { status: 401 });
  const turnedOn = parsed.data.courseAlerts && !prefsOf(fresh).courseAlerts;
  await saveUser({ ...fresh, notifications: parsed.data, locale });
  // course emails list what appears after this moment, not the whole catalogue
  if (turnedOn) {
    const state = { ...EMPTY_STATE, ...(await getRecord<NotifyState>(stateKey(fresh.id))) };
    await setRecord(stateKey(fresh.id), { ...state, coursesSince: new Date().toISOString() });
  }
  return NextResponse.json({ ok: true, notifications: parsed.data });
}
