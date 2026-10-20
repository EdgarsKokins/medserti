import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import { computeProgress } from "@/lib/rules";
import { specialtyLabel } from "@/lib/specialties";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import ExportView, { type ExportRow } from "@/components/export/ExportView";

export async function generateMetadata(): Promise<Metadata> {
  const d = t(await getLocale());
  return { title: d.exportDocs.title };
}

/** Recertification export: the server only hands over the user's own certificates; personal details stay in the browser */
export default async function ExportPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const certs = await listCertificates(user.id);
  const p = computeProgress(user.profile, certs);
  const confirmed = p.counted.filter((c) => c.status === "confirmed" && c.date);
  const unconfirmed = p.counted.filter((c) => c.status !== "confirmed").length;
  const rows: ExportRow[] = confirmed.map((c) => ({
    id: c.id,
    approvalId: c.approvalId,
    organizer: c.organizer,
    title: c.title || c.fileName,
    date: c.date!,
    endDate: c.endDate,
    points: c.points ?? 0,
    inSpecialty: c.inSpecialty,
    fileName: c.fileName,
  }));
  const parts = user.profile.fullName.trim().split(/\s+/);
  return (
    <ExportView
      locale={locale}
      rows={rows}
      unconfirmed={unconfirmed}
      cert={{
        number: user.profile.certificateNumber,
        validUntil: p.windowEnd,
        // the documents go to LĀB, so the specialty is always written in Latvian
        specialty: specialtyLabel(user.profile.specialty, "lv"),
      }}
      prefill={{
        firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "",
        lastName: parts.length > 1 ? parts[parts.length - 1] : "",
        email: user.email,
      }}
    />
  );
}
