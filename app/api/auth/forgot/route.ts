import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/db";
import { createResetToken, rateLimit } from "@/lib/password-reset";
import { sendEmail } from "@/lib/email";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const Body = z.object({ email: z.string().email() });
const HOUR = 60 * 60 * 1000;

/** Base for links in emails. Never taken from the Host header in production (reset-link poisoning). */
function siteUrl(req: Request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? "https://medserti.lv" : new URL(req.url).origin;
}

const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

/** Same answer whether or not the account exists; the lookup and email run after the response is sent */
export async function POST(req: Request) {
  const locale = await getLocale();
  const d = t(locale);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: d.api.badEmail }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();

  const allowed =
    (await rateLimit(`forgot-ip:${clientIp(req)}`, 10, HOUR)) && (await rateLimit(`forgot-email:${email}`, 3, HOUR));
  if (!allowed) return NextResponse.json({ error: d.reset.tooMany }, { status: 429 });

  const base = siteUrl(req);
  after(async () => {
    try {
      const user = await getUserByEmail(email);
      if (!user) return;
      const token = await createResetToken(user.id, user.sessionVersion ?? 0);
      const link = `${base}/atjaunot-paroli?token=${token}`;
      await sendEmail({ to: user.email, subject: d.reset.emailSubject, text: d.reset.emailBody(link) });
    } catch (e) {
      console.error("[forgot] failed to send reset email", e);
    }
  });
  return NextResponse.json({ ok: true });
}
