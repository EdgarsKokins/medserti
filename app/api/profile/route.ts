import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { saveUser } from "@/lib/db";
import { addYears, RULES } from "@/lib/rules";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({
  fullName: z.string().trim().min(1).max(120),
  profession: z.enum(["doctor", "dentist", "functional_specialist", "physician_assistant", "nurse", "midwife", "other_practitioner"]),
  specialty: z.string().trim().max(120),
  certificationKind: z.enum(["specialty", "method"]),
  certificateNumber: z.string().trim().max(60),
  certificateIssued: isoDate.nullable(),
  certificateExpires: isoDate.nullable(),
  requiredPointsOverride: z.number().int().positive().max(5000).nullable(),
});

/** User-facing message for the first failing field */
const FIELD_ERROR = { fullName: "nameRequired", requiredPointsOverride: "requiredPointsInvalid", certificateIssued: "dateFormat", certificateExpires: "dateFormat" } as const;

export async function PUT(req: Request) {
  const m = t(await getLocale()).api;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: m.notSignedIn }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] as keyof typeof FIELD_ERROR | undefined;
    return NextResponse.json({ error: field && FIELD_ERROR[field] ? m[FIELD_ERROR[field]] : m.invalidInput }, { status: 400 });
  }
  const p = parsed.data;
  if (p.certificateIssued && !p.certificateExpires) p.certificateExpires = addYears(p.certificateIssued, RULES.validityYears);
  user.profile = p;
  await saveUser(user);
  return NextResponse.json({ ok: true, profile: user.profile });
}
