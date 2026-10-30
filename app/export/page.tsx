import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import Link from "next/link";
import { cappedPoints, practicalCap } from "@/lib/rules";
import { certProgress } from "@/lib/certAssign";
import { pickCert, profileCerts } from "@/lib/profileCerts";
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
export default async function ExportPage({ searchParams }: { searchParams: Promise<{ sert?: string | string[] }> }) {
  const user = await requireUser();
  const locale = await getLocale();
  const { sert } = await searchParams;
  const all = await listCertificates(user.id);
  // certificates in more than one specialty: documents for one at a time, with the uploads that count toward it
  const own = profileCerts(user.profile);
  const cert = pickCert(user.profile, typeof sert === "string" ? sert : null);
  const { progress: p } = certProgress(user.profile, all, cert);
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
  const d = t(locale).exportDocs;
  return (
    <>
    {own.length > 1 && (
      <nav className="container row" style={{ paddingBottom: 0, gap: 8, flexWrap: "wrap", alignItems: "center" }} aria-label={d.forCert}>
        <span className="small muted">{d.forCert}</span>
        {own.map((c) => (
          <Link key={c.id} href={c.id === "main" ? "/export" : `/export?sert=${c.id}`} className={`btn ${c.id === cert.id ? "btn-primary" : ""}`} aria-current={c.id === cert.id ? "page" : undefined}>
            {specialtyLabel(c.specialty, locale)}
          </Link>
        ))}
      </nav>
    )}
    <ExportView
      key={cert.id}
      locale={locale}
      rows={rows}
      unconfirmed={unconfirmed}
      cert={{
        number: cert.certificateNumber,
        validUntil: p.windowEnd,
        // the documents go to LĀB, so the specialty is always written in Latvian
        specialty: specialtyLabel(cert.specialty, "lv"),
      }}
      prefill={{
        firstName,
        lastName,
        email: user.email,
      }}
    />
    </>
  );
}
