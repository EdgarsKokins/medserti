import Link from "next/link";
import { isDemoUser, requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import CertificatesView from "@/components/certificates/CertificatesView";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { specialtyLabel } from "@/lib/specialties";
import { certificateWindow } from "@/lib/rules";
import { todayLv } from "@/lib/format";
import { readCourseIndex } from "@/lib/courses/store";
import { assignments } from "@/lib/certAssign";
import { asProfile, profileCerts } from "@/lib/profileCerts";
import styles from "@/components/certificates/certificates.module.css";

export const dynamic = "force-dynamic";

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ course?: string | string[] }> }) {
  const user = await requireUser();
  const { course } = await searchParams;
  const [certificates, courses] = await Promise.all([
    listCertificates(user.id),
    typeof course === "string" ? readCourseIndex().catch(() => null) : null,
  ]);
  // "Pievienot sertifikātu" on a course: the uploads here are for it
  const forCourse = typeof course === "string" ? courses?.courses.find((c) => c.id === course) ?? null : null;
  const locale = await getLocale();
  // certificates in more than one specialty: each upload counts toward one of them, in that one's period
  const own = profileCerts(user.profile).map((c) => ({
    id: c.id,
    label: specialtyLabel(c.specialty, locale),
    specialty: c.specialty,
    cycle: certificateWindow(asProfile(user.profile, c)),
  }));
  const dict = t(locale);
  const d = dict.certs;
  return (
    <main className="container stack">
      <div className="page-head">
        <div>
          <h1>{d.title}</h1>
          <p className="muted">{d.leadShort}</p>
        </div>
        {/* the page's main button: the upload area above the list is a drop zone, not a button, so the two do not compete */}
        {certificates.some((c) => c.status === "confirmed") && (
          <Link href="/export" className={`btn btn-primary ${styles.exportBtn}`}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9.5 1.5h-5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-8.5zM9.5 1.5v3.5h3M6 9h4M6 11.5h4" />
            </svg>
            {user.profile.profession === "nurse" ? dict.exportDocs.nurseCta : dict.exportDocs.cta} →
          </Link>
        )}
      </div>
      <CertificatesView
        initial={certificates}
        specialty={specialtyLabel(user.profile.specialty, locale)}
        locale={locale}
        cycle={certificateWindow(user.profile)}
        today={todayLv()}
        readOnly={isDemoUser(user)}
        nurse={user.profile.profession === "nurse"}
        forCourse={forCourse ? { id: forCourse.id, title: forCourse.title } : null}
        own={own.length > 1 ? own : []}
        assignment={own.length > 1 ? assignments(user.profile, certificates) : {}}
      />
    </main>
  );
}
