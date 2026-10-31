import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createUser, getUserByEmail } from "@/lib/db";
import { hashPassword, startSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { LEGAL_UPDATED } from "@/lib/legal";
import { PROFESSIONS } from "@/lib/types";
import { specialtiesFor } from "@/lib/specialties";
import { clientIp, rateLimit } from "@/lib/password-reset";
import { passwordBreached, passwordTooLong } from "@/lib/password-policy";
import { EMAIL_MAX, tidyName, validEmail, validName, validPassword } from "@/lib/validation";

const Body = z.object({
  email: z.string().trim().max(EMAIL_MAX).refine(validEmail),
  password: z.string().refine(validPassword),
  fullName: z.string().trim().min(1).refine(validName).transform(tidyName),
  // sets the program from the first visit: nurses re-register on hours (Reg. 630), everyone else recertifies on TIP
  profession: z.enum(PROFESSIONS),
  // the profession was found by typing a specialty ("neirologs"): kept only if it is one of that profession's
  specialtyCode: z.string().trim().max(10).optional(),
  // checkbox value; the form sends nothing when it is unticked
  consent: z.literal("on"),
  // the user saw the breached-password warning and chose to keep this password
  acceptBreached: z.literal("on").optional(),
});

/** User-facing message for the first failing field */
const HOUR = 60 * 60 * 1000;

const FIELD_ERROR = { email: "badEmail", password: "passwordShort", fullName: "nameInvalid", profession: "professionRequired" } as const;

export async function POST(req: Request) {
  const d = t(await getLocale());
  const m = d.api;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] as keyof typeof FIELD_ERROR | "consent" | undefined;
    if (field === "consent") return NextResponse.json({ error: d.legal.consent.required }, { status: 400 });
    return NextResponse.json({ error: field && FIELD_ERROR[field] ? m[FIELD_ERROR[field]] : m.invalidInput }, { status: 400 });
  }
  const { email, password, fullName, profession, specialtyCode, acceptBreached } = parsed.data;
  const specialty = specialtiesFor(profession).find((sp) => sp.code === specialtyCode) ?? null;
  if (passwordTooLong(password)) return NextResponse.json({ error: m.passwordLong }, { status: 400 });
  // 5 sign-up attempts per IP per hour, counted once the form itself is valid
  if (!(await rateLimit(`register-ip:${clientIp(req)}`, 5, HOUR)))
    return NextResponse.json({ error: m.tooMany }, { status: 429 });
  // a warning, not a block: some users have no other password to hand (usability test, 24 Oct 2026)
  if (!acceptBreached && (await passwordBreached(password)))
    return NextResponse.json({ error: m.passwordBreachedWarn, code: "breached" }, { status: 400 });
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
    locale: await getLocale(),
    profile: {
      fullName,
      profession,
      specialty: specialty?.lv ?? "",
      specialtyCode: specialty?.code ?? null,
      certificationKind: "specialty",
      certificateNumber: "",
      certificateIssued: null,
      certificateExpires: null,
    },
  });
  await startSession(id);
  return NextResponse.json({ ok: true });
}
