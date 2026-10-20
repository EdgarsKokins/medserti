import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWritableUser } from "@/lib/auth";
import { deleteCertificate, getCertificate, saveCertificate } from "@/lib/db";
import type { CmeCertificate } from "@/lib/types";
import { t, type Dict } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

type Ctx = { params: Promise<{ id: string }> };

const amount = z.number().min(0).max(1000);

/** Built per request so validation messages follow the user's language */
const bodySchema = (m: Dict["api"]) => {
  const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, m.dateFormat)
    .refine((s) => !Number.isNaN(Date.parse(s + "T00:00:00Z")), m.invalidDate);
  return z
    .object({
      title: z.string().trim().max(300),
      organizer: z.string().trim().max(200),
      date: isoDate.nullable(),
      endDate: isoDate.nullable(),
      points: amount.nullable(),
      academicHours: amount.nullable(),
      category: z.enum([
        "professional_meeting",
        "training_latvia",
        "training_abroad",
        "interdisciplinary_conference",
        "e_learning",
        "practical_training",
        "lecture_or_publication",
        "degree",
        "other",
      ]),
      inSpecialty: z.boolean(),
      emergencyCare: z.boolean(),
      practicalHours: amount.nullable(),
      approvalId: z.string().trim().max(100).nullable(),
      country: z.string().trim().max(80).nullable(),
      status: z.enum(["confirmed", "needs_review"]).default("confirmed"),
    })
    .superRefine((b, ctx) => {
      if (b.status !== "needs_review") {
        if (!b.title) ctx.addIssue({ code: "custom", message: m.titleRequired, path: ["title"] });
        if (!b.date) ctx.addIssue({ code: "custom", message: m.dateRequired, path: ["date"] });
        if (b.points == null) ctx.addIssue({ code: "custom", message: m.pointsRequired, path: ["points"] });
      }
      if (b.date && b.endDate && b.endDate < b.date)
        ctx.addIssue({ code: "custom", message: m.endBeforeStart, path: ["endDate"] });
    });
};

/** Messages we set ourselves; anything else (zod defaults) maps to a generic one */
const OWN_CODES = new Set(["custom", "invalid_format"]);

const validId = (id: string) => z.uuid().safeParse(id).success;

export async function PATCH(req: Request, { params }: Ctx) {
  const m = t(await getLocale()).api;
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  const { user } = g;
  const { id } = await params;
  const cert = validId(id) ? await getCertificate(user.id, id) : null;
  if (!cert || cert.userId !== user.id) return NextResponse.json({ error: m.notFound }, { status: 404 });

  const parsed = bodySchema(m).safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue && OWN_CODES.has(issue.code) ? issue.message : m.invalidInput }, { status: 400 });
  }
  const { status, ...fields } = parsed.data;

  const updated: CmeCertificate = {
    ...cert,
    ...fields,
    approvalId: fields.approvalId || null,
    country: fields.country || null,
    endDate: fields.endDate && fields.endDate !== fields.date ? fields.endDate : null,
    status,
  };
  await saveCertificate(updated);
  return NextResponse.json({ certificate: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const m = t(await getLocale()).api;
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  const { user } = g;
  const { id } = await params;
  const cert = validId(id) ? await getCertificate(user.id, id) : null;
  if (!cert || cert.userId !== user.id) return NextResponse.json({ error: m.notFound }, { status: 404 });
  await deleteCertificate(user.id, id);
  return NextResponse.json({ ok: true });
}
