import { requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import CertificatesView from "@/components/certificates/CertificatesView";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const user = await requireUser();
  const certificates = await listCertificates(user.id);
  const locale = await getLocale();
  const d = t(locale).certs;
  return (
    <main className="container stack">
      <div className="page-head">
        <div>
          <h1>{d.title}</h1>
          <p className="muted">{d.lead}</p>
        </div>
      </div>
      <CertificatesView initial={certificates} specialty={user.profile.specialty} locale={locale} />
    </main>
  );
}
