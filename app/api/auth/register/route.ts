import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createUser, getUserByEmail } from "@/lib/db";
import { hashPassword, startSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { LEGAL_UPDATED } from "@/lib/legal";
import { clientIp, rateLimit } from "@/lib/password-reset";
import { passwordBreached, passwordTooLong } from "@/lib/password-policy";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(1).max(120),
  // checkbox value; the form sends nothing when it is unticked
  consent: z.literal("on"),
});

/** User-facing message for the first failing field */
const HOUR = 60 * 60 * 1000;

const FIELD_ERROR = { email: "badEmail", password: "passwordShort", fullName: "nameRequired" } as const;

export async function POST(req: Request) {
  const d = t(await getLocale());
  const m = d.api;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] as keyof typeof FIELD_ERROR | "consent" | undefined;
    if (field === "consent") return NextResponse.json({ error: d.legal.consent.required }, { status: 400 });
    return NextResponse.json({ error: field && FIELD_ERROR[field] ? m[FIELD_ERROR[field]] : m.invalidInput }, { status: 400 });
  }
  const { email, password, fullName } = parsed.data;
  if (passwordTooLong(password)) return NextResponse.json({ error: m.passwordLong }, { status: 400 });
  // 5 sign-up attempts per IP per hour, counted once the form itself is valid
  if (!(await rateLimit(`register-ip:${clientIp(req)}`, 5, HOUR)))
    return NextResponse.json({ error: m.tooMany }, { status: 429 });
  if (await passwordBreached(password)) return NextResponse.json({ error: m.passwordBreached }, { status: 400 });
  if (await getUserByEmail(email)) return NextResponse.json({ error: m.emailTaken }, { status: 409 });

  const id = randomUUID();
  const now = new Date().toISOString();
  await createUser({
    id,
    email: email.trim().toLowerCase(),
    passwordHash: await hashPassword(password),
    createdAt: now,
    termsAcceptedAt: now,
    termsVersion: LEGAL_UPDATED,
    profile: {
      fullName,
      profession: "doctor",
      specialty: "",
      specialtyCode: null,
      certificationKind: "specialty",
      certificateNumber: "",
      certificateIssued: null,
      certificateExpires: null,
      requiredPointsOverride: null,
    },
  });
  await startSession(id);
  return NextResponse.json({ ok: true });
}
