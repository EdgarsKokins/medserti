import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWritableUser } from "@/lib/auth";
import { listCertificates, saveCertificate } from "@/lib/db";
import { confirmCheckedEligible } from "@/lib/parse/confidence";
import { certificateWindow } from "@/lib/rules";
import type { CmeCertificate } from "@/lib/types";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const Body = z.object({ ids: z.array(z.uuid()).min(1).max(500) });

/**
 * "Confirm all checked": confirms the certificates the user was shown, but only those that are still eligible
 * by the server's own check (lib/parse/confidence.ts). The client's list only narrows it, never widens it.
 */
export async function POST(req: Request) {
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  const m = t(await getLocale()).api;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: m.invalidInput }, { status: 400 });

  const shown = new Set(parsed.data.ids);
  const all = await listCertificates(g.user.id);
  const window = certificateWindow(g.user.profile);
  const today = new Date().toISOString().slice(0, 10);
  const eligible = all.filter((c) => shown.has(c.id) && confirmCheckedEligible(c, all, window, today));

  const confirmed: CmeCertificate[] = [];
  for (const c of eligible) {
    // confirmed by the user (they saw the list), so not autoConfirmed; their doubts no longer apply
    const updated: CmeCertificate = { ...c, status: "confirmed", autoConfirmed: false, fieldConfidence: null };
    await saveCertificate(updated);
    confirmed.push(updated);
  }
  return NextResponse.json({ certificates: confirmed, skipped: parsed.data.ids.length - confirmed.length });
}
