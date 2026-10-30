import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { verifyUnsubscribe } from "@/lib/notifications";
import UnsubscribeButton from "@/components/UnsubscribeButton";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Where an email's "turn these off" link lands. It asks first, so a mail scanner that opens links turns nothing off;
 * the button posts to /api/notifications/unsubscribe. No sign-in needed: the link carries a signed token.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const [u, k, tok] = [one(q.u), one(q.k), one(q.t)];
  const m = t(await getLocale()).notify;
  const valid = /^[0-9a-f-]{36}$/i.test(u) && verifyUnsubscribe(u, k, tok);
  return (
    <main className="container stack" style={{ maxWidth: 560 }}>
      <h1>{m.unsubTitle}</h1>
      {valid ? (
        <UnsubscribeButton u={u} k={k} t={tok} question={k === "reminders" ? m.unsubReminders : m.unsubCourseAlerts} button={m.unsubButton} done={m.unsubDone} failed={m.failed} />
      ) : (
        <p className="alert">{m.unsubInvalid}</p>
      )}
      <p className="small">
        <Link href="/profile">{m.openProfile}</Link>
      </p>
    </main>
  );
}
