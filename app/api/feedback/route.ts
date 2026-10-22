import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, isDemoUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { pseudonym } from "@/lib/monitoring/day";
import { reportServerError } from "@/lib/monitoring/errors";
import { submitFeedback } from "@/lib/monitoring/feedback";
import { allowHit } from "@/lib/monitoring/limit";
import { deviceLabel, scrubRoute } from "@/lib/monitoring/scrub";
import { clientIp } from "@/lib/password-reset";
import { EMAIL_MAX, FEEDBACK_MAX, validEmail } from "@/lib/validation";

const TEN_MIN = 10 * 60 * 1000;

const Body = z.object({
  message: z.string().max(FEEDBACK_MAX * 2),
  /** "include this page": the path and, in the review panel, the certificate id */
  route: z.string().max(500).nullable().optional(),
  certId: z.string().max(64).regex(/^[\w-]+$/).nullable().optional(),
  /** demo visitors only: the demo account's address is not theirs */
  email: z.string().trim().max(EMAIL_MAX).optional(),
});

/** "Ziņot par problēmu": signed-in users, the demo account included. Stored in feedback/ and emailed to info@. */
export async function POST(req: Request) {
  const d = t(await getLocale());
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: d.api.notSignedIn }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const message = parsed.success ? parsed.data.message.trim() : "";
  // eslint-disable-next-line no-control-regex
  if (!parsed.success || ![...message].length || [...message].length > FEEDBACK_MAX || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message))
    return NextResponse.json({ error: d.feedback.invalid }, { status: 400 });
  const demo = isDemoUser(user);
  const typed = parsed.data.email?.trim();
  if (demo && typed && !validEmail(typed)) return NextResponse.json({ error: d.api.badEmail, field: "email" }, { status: 400 });
  // the demo account is shared by every visitor: its limit is per IP, everyone else's per account
  const ip = clientIp(req);
  const sender = demo ? pseudonym("ip", ip) : pseudonym("user", user.id);
  if (!allowHit(`feedback:${ip}`, 5, TEN_MIN)) return NextResponse.json({ error: d.api.tooMany }, { status: 429 });
  try {
    const res = await submitFeedback(
      {
        email: demo ? typed || null : user.email,
        demo,
        message,
        route: parsed.data.route ? scrubRoute(parsed.data.route) : null,
        certId: parsed.data.route ? (parsed.data.certId ?? null) : null,
        locale: await getLocale(),
        device: deviceLabel(req.headers.get("user-agent")),
      },
      sender,
    );
    if (res === "limited") return NextResponse.json({ error: d.api.tooMany }, { status: 429 });
  } catch (err) {
    await reportServerError(err, "/api/feedback", user.id);
    return NextResponse.json({ error: d.feedback.failed }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
