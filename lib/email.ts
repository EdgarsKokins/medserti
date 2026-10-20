import "server-only";
import { CONTACT_EMAIL } from "./site";

/**
 * Transactional email through Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
 * Without RESEND_API_KEY (local dev) the email is printed to the server console instead of sent.
 */
export type Email = { to: string; subject: string; text: string };

const DEFAULT_FROM = "Medserti <noreply@medserti.lv>";

export async function sendEmail({ to, subject, text }: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || DEFAULT_FROM;
  if (!key) {
    if (process.env.NODE_ENV === "production") console.error("[email] RESEND_API_KEY is not set, email not sent:", subject);
    else console.log(`\n[email] (not sent, no RESEND_API_KEY)\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, reply_to: process.env.EMAIL_REPLY_TO || CONTACT_EMAIL }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
}
