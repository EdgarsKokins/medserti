import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import { cappedPoints, computeProgress, practicalCap } from "@/lib/rules";
import { specialtyLabel } from "@/lib/specialties";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import ExportView, { type ExportRow } from "@/components/export/ExportView";
import { needsTranslation } from "@/lib/parse/language";
import NurseExportView, { type NurseExportRow } from "@/components/export/NurseExportView";
import { nurseTopicOf } from "@/lib/nurse";

export async function generateMetadata(): Promise<Metadata> {
  const [d, user] = [t(await getLocale()), await requireUser()];
  return { title: user.profile.profession === "nurse" ? d.exportDocs.nurseTitle : d.exportDocs.title };
}

/** Recertification export: the server only hands over the user's own certificates; personal details stay in the browser */
export default async function ExportPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const certs = await listCertificates(user.id);
  const p = computeProgress(user.profile, certs);
  const confirmed = p.counted.filter((c) => c.status === "confirmed" && c.date);
  const unconfirmed = p.counted.filter((c) => c.status !== "confirmed").length;
  // the 16% practical cap over the rows that go to LĀB, as computeProgress applies it, so the sheet totals match the dashboard
  const { scale } = practicalCap(confirmed, p.required, user.profile.profession === "nurse");
  const rows: ExportRow[] = confirmed.map((c) => {
    const points = cappedPoints(c, scale);
    return {
      id: c.id,
      approvalId: c.approvalId,
      organizer: c.organizer,
      title: c.title || c.fileName,
      date: c.date!,
      endDate: c.endDate,
      points,
      ...(points < (c.points ?? 0) ? { rawPoints: c.points ?? 0 } : {}),
      inSpecialty: c.inSpecialty,
      fileName: c.fileName,
      ...(needsTranslation(c.language) ? { foreignLanguage: true } : {}),
    };
  });
  const parts = user.profile.fullName.trim().split(/\s+/);
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";

  // nurses re-register with the Health Inspectorate (Reg. 630 Annex 4), not LĀB
  if (user.profile.profession === "nurse") {
    const nurseRows: NurseExportRow[] = confirmed.map((c) => ({
      id: c.id,
      fileName: c.fileName,
      organizer: c.organizer,
      title: c.title || c.fileName,
      date: c.date!,
      endDate: c.endDate,
      hours: c.points ?? 0,
      topic: nurseTopicOf(c),
    }));
    return (
      <NurseExportView
        locale={locale}
        rows={nurseRows}
        unconfirmed={unconfirmed}
        registrationUntil={p.windowEnd}
        // re-registration is in the profession; its register name per Reg. 630 Annex 1.1
        profession="Māsa (vispārējās aprūpes māsa)"
        prefill={{ firstName, lastName, email: user.email, practitionerId: user.profile.certificateNumber }}
      />
    );
  }
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
        firstName,
        lastName,
        email: user.email,
      }}
    />
  );
}
