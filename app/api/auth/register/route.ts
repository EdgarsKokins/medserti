import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createUser, getUserByEmail } from "@/lib/db";
import { hashPassword, startSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(1).max(120),
});

/** User-facing message for the first failing field */
const FIELD_ERROR = { email: "badEmail", password: "passwordShort", fullName: "nameRequired" } as const;

export async function POST(req: Request) {
  const m = t(await getLocale()).api;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] as keyof typeof FIELD_ERROR | undefined;
    return NextResponse.json({ error: field && FIELD_ERROR[field] ? m[FIELD_ERROR[field]] : m.invalidInput }, { status: 400 });
  }
  const { email, password, fullName } = parsed.data;
  if (await getUserByEmail(email)) return NextResponse.json({ error: m.emailTaken }, { status: 409 });

  const id = randomUUID();
  await createUser({
    id,
    email: email.trim().toLowerCase(),
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
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
