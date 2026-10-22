import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWritableUser } from "@/lib/auth";
import { getCertificate, listCertificates, saveCertificate } from "@/lib/db";
import { rowConfirmEligible } from "@/lib/parse/confidence";
import { certificateWindow } from "@/lib/rules";
import type { CmeCertificate } from "@/lib/types";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { todayLv } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Apstiprināt" in a certificate row. Confirms as the user (not autoConfirmed), only when the server's own check agrees
 * (lib/parse/confidence.ts rowConfirmEligible). Only the status changes, so the undo (DELETE) can put it back exactly.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const m = t(await getLocale()).api;
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: m.notFound }, { status: 404 });
  const all = await listCertificates(g.user.id);
  const cert = all.find((c) => c.id === id);
  if (!cert) return NextResponse.json({ error: m.notFound }, { status: 404 });
  // Riga's date, the same "today" the certificates page gives the row (app/certificates/page.tsx)
  const today = todayLv();
  if (!rowConfirmEligible(cert, all, certificateWindow(g.user.profile, today), today))
    return NextResponse.json({ error: m.notConfirmable }, { status: 409 });
  const updated: CmeCertificate = { ...cert, status: "confirmed", autoConfirmed: false };
  await saveCertificate(updated);
  return NextResponse.json({ certificate: updated });
}

/** Undo: back to needs_review. Auto-confirmed certificates are left alone (the user undoes only their own click). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const m = t(await getLocale()).api;
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  const { id } = await params;
  const cert = z.uuid().safeParse(id).success ? await getCertificate(g.user.id, id) : null;
  if (!cert || cert.userId !== g.user.id) return NextResponse.json({ error: m.notFound }, { status: 404 });
  if (cert.status !== "confirmed" || cert.autoConfirmed) return NextResponse.json({ error: m.notConfirmable }, { status: 409 });
  const updated: CmeCertificate = { ...cert, status: "needs_review" };
  await saveCertificate(updated);
  return NextResponse.json({ certificate: updated });
}
