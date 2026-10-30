import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser, saveUser } from "@/lib/db";
import { prefsOf, verifyUnsubscribe } from "@/lib/notifications";

const Body = z.object({ u: z.uuid(), k: z.string().max(20), t: z.string().max(64) });

/**
 * "Izslēgt" on /pazinojumi, the page an email's unsubscribe link opens. No sign-in: the signed token (lib/notifications.ts)
 * names the account and the kind of email, and turning one off is all it can do.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !verifyUnsubscribe(parsed.data.u, parsed.data.k, parsed.data.t))
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  const { u, k } = parsed.data;
  const user = await getUser(u);
  if (!user) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  await saveUser({ ...user, notifications: { ...prefsOf(user), [k]: false } });
  return NextResponse.json({ ok: true });
}
