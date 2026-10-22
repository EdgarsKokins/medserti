import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWritableUser } from "@/lib/auth";
import { getUser, saveUser } from "@/lib/db";
import { addYears, certificateWindow, RULES } from "@/lib/rules";
import { OTHER_SPECIALTY, specialtyByCode } from "@/lib/specialties";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { CERTIFICATION_KINDS, PROFESSIONS } from "@/lib/types";
import { CERT_NO_MAX, SPECIALTY_MAX, tidyName, validCertNo, validName, validPlainText } from "@/lib/validation";
import { todayLv } from "@/lib/format";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.object({
  fullName: z.string().trim().min(1).refine(validName).transform(tidyName),
  profession: z.enum(PROFESSIONS),
  specialty: z.string().trim().refine((v) => validPlainText(v, SPECIALTY_MAX)),
  specialtyCode: z.string().trim().max(10).nullable().optional(),
  certificationKind: z.enum(CERTIFICATION_KINDS),
  certificateNumber: z.string().trim().max(CERT_NO_MAX).refine(validCertNo),
  certificateIssued: isoDate.nullable(),
  certificateExpires: isoDate.nullable(),
  // no longer edited: the requirement always follows the rules. Accepted from older clients and dropped.
  requiredPointsOverride: z.unknown().optional(),
});

/** User-facing message for the first failing field */
const FIELD_ERROR = { fullName: "nameInvalid", specialty: "specialtyInvalid", certificateNumber: "certNoInvalid", certificateIssued: "dateFormat", certificateExpires: "dateFormat" } as const;

export async function PUT(req: Request) {
  const m = t(await getLocale()).api;
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  const { user } = g;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] as keyof typeof FIELD_ERROR | undefined;
    return NextResponse.json({ error: field && FIELD_ERROR[field] ? m[FIELD_ERROR[field]] : m.invalidInput }, { status: 400 });
  }
  const { requiredPointsOverride: _ignored, ...p } = parsed.data;
  if (p.certificateIssued && !p.certificateExpires) p.certificateExpires = addYears(p.certificateIssued, RULES.validityYears);
  const today = todayLv();
  if (p.profession !== "nurse" && p.certificateIssued && p.certificateIssued > today) return NextResponse.json({ error: m.issuedFuture }, { status: 400 });
  // a period that has already ended is initial certification, not recertification: never saved
  const end = certificateWindow(p).end;
  if (end && end < today) return NextResponse.json({ error: m.certExpired }, { status: 400 });
  // a listed code wins: store its LV name so course and certificate matching runs on Latvian text
  const listed = specialtyByCode(p.specialtyCode);
  if (listed) p.specialty = listed.lv;
  else p.specialtyCode = p.specialty ? OTHER_SPECIALTY : null;
  // re-read just before writing and replace only the profile: writing back the record read at the start would undo
  // a password reset (passwordHash, sessionVersion) that landed while this request ran
  const fresh = await getUser(user.id);
  // a reset in between also signed this session out
  if (!fresh || (fresh.sessionVersion ?? 0) !== (user.sessionVersion ?? 0)) return NextResponse.json({ error: m.notSignedIn }, { status: 401 });
  await saveUser({ ...fresh, profile: p });
  return NextResponse.json({ ok: true, profile: p });
}
