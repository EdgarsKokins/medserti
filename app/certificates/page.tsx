import Link from "next/link";
import { isDemoUser, requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import CertificatesView from "@/components/certificates/CertificatesView";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { specialtyLabel } from "@/lib/specialties";

export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const user = await requireUser();
  const certificates = await listCertificates(user.id);
  const locale = await getLocale();
  const dict = t(locale);
  const d = dict.certs;
  return (
    <main className="container stack">
      <div className="page-head">
        <div>
          <h1>{d.title}</h1>
          <p className="muted">{d.leadShort}</p>
        </div>
        {certificates.some((c) => c.status === "confirmed") && (
          <Link href="/export" className="btn">{dict.exportDocs.cta} →</Link>
        )}
      </div>
      <CertificatesView initial={certificates} specialty={specialtyLabel(user.profile.specialty, locale)} locale={locale} readOnly={isDemoUser(user)} />
    </main>
  );
}
