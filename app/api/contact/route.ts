import { NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail } from "@/lib/email";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { clientIp, rateLimit } from "@/lib/password-reset";
import { CONTACT_EMAIL } from "@/lib/site";
import { reportServerError } from "@/lib/monitoring/errors";
import { EMAIL_MAX, MESSAGE_MAX, validEmail, validMessage } from "@/lib/validation";

const HOUR = 60 * 60 * 1000;

const Body = z.object({
  email: z.string().trim().max(EMAIL_MAX).refine(validEmail),
  message: z.string().max(MESSAGE_MAX * 2).refine(validMessage),
  // honeypot: hidden from people, bots fill it in
  website: z.string().max(500).optional(),
});

/** Contact form: forwards the message to info@medserti.lv with Reply-To set to the sender */
export async function POST(req: Request) {
  const d = t(await getLocale());
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json({ error: field === "email" ? d.api.badEmail : field === "message" ? d.contact.messageInvalid : d.api.invalidInput }, { status: 400 });
  }
  const { email, message, website } = parsed.data;
  // a filled honeypot looks like success to the bot, and nothing is sent
  if (website) return NextResponse.json({ ok: true });
  // 3 messages per IP per hour and 10 per sender address a day
  if (!(await rateLimit(`contact-ip:${clientIp(req)}`, 3, HOUR)) || !(await rateLimit(`contact-email:${email.toLowerCase()}`, 10, 24 * HOUR)))
    return NextResponse.json({ error: d.api.tooMany }, { status: 429 });
  try {
    await sendEmail({
      to: CONTACT_EMAIL,
      replyTo: email,
      subject: `Medserti: ziņa no ${email}`,
      text: `No: ${email}\n\n${message.trim()}\n`,
    });
  } catch (e) {
    console.error("[contact] send failed", e);
    await reportServerError(e, "/api/contact");
    return NextResponse.json({ error: d.contact.failed }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
