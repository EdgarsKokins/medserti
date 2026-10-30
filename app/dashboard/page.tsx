import type { Metadata } from "next";
import Link from "next/link";
import { isDemoUser, requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import { ruleBasis, RULES } from "@/lib/rules";
import { certProgress } from "@/lib/certAssign";
import { asProfile, pickCert, profileCerts } from "@/lib/profileCerts";
import { specialtyLabel } from "@/lib/specialties";
import { matchesSpecialty } from "@/lib/parse";
import { readCourseIndex } from "@/lib/courses/store";
import { isNurseCourse, type Course } from "@/lib/courses/types";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import styles from "@/components/dashboard/dashboard.module.css";
import ProgressChart from "@/components/dashboard/ProgressChart";
import { CategoryBars, RecentActivity } from "@/components/dashboard/Sections";
import { CoursePicks, Hero, Requirements } from "@/components/dashboard/Overview";
import DashboardUpload from "@/components/dashboard/DashboardUpload";
import { categoryBreakdown, cumulativeSeries, dictFor, exclusions, headline } from "@/components/dashboard/model";
import { formatPeriod, todayLv } from "@/lib/format";

/** Next events for this specialty (or all specialties), at most `n`; recordings get their own block (pickRecorded) */
function pickCourses(courses: Course[], specialty: string, todayIso: string, n = 4): Course[] {
  // matched once per course, not inside the sort comparator
  const mine = new Map(courses.map((c) => [c, !!specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty)]));
  const fits = (c: Course) => c.allSpecialties || mine.get(c)!;
  const events = courses
    .filter((c) => c.kind === "event" && c.startDate && c.startDate >= todayIso && fits(c))
    .sort((a, b) => Number(mine.get(b)) - Number(mine.get(a)) || a.startDate!.localeCompare(b.startDate!))
    .slice(0, n)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  return events;
}

/** Recordings for this specialty first, then for all specialties; free ones first within each, at most `n` */
function pickRecorded(courses: Course[], specialty: string, n = 3): Course[] {
  const score = (c: Course) => (specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty) ? 2 : c.allSpecialties ? 1 : 0);
  return courses
    .filter((c) => c.kind === "recorded")
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || Number(b.c.free) - Number(a.c.free))
    .slice(0, n)
    .map((x) => x.c);
}

/** Nurses: next courses for nurses (LMA list, or an audience naming nurses) */
function pickNurseCourses(courses: Course[], todayIso: string, n = 4): Course[] {
  return courses
    .filter((c) => isNurseCourse(c) && c.kind === "event" && c.startDate && c.startDate >= todayIso)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!))
    .slice(0, n);
}

/** Nurses: recordings for nurses */
const pickNurseRecorded = (courses: Course[], n = 3) => courses.filter((c) => isNurseCourse(c) && c.kind === "recorded").slice(0, n);

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).nav.dashboard };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ sert?: string | string[] }> }) {
  const user = await requireUser();
  const { sert } = await searchParams;
  const [certs, courseIdx, locale] = await Promise.all([listCertificates(user.id), readCourseIndex().catch(() => null), getLocale()]);
  // nurses re-register on academic hours (Reg. 630), everyone else recertifies on TIP (Reg. 391)
  const hours = user.profile.profession === "nurse";
  const dict = dictFor(locale, hours);
  const d = dict.dashboard;
  const today = new Date();
  // with certificates in more than one specialty the page shows one at a time (?sert=<id>), each with its own uploads
  const own = profileCerts(user.profile);
  const cert = pickCert(user.profile, typeof sert === "string" ? sert : null);
  const all3 = own.map((c) => ({ c, p: certProgress(user.profile, certs, c, today).progress }));
  const p = all3.find((x) => x.c.id === cert.id)!.p;
  const certProfile = asProfile(user.profile, cert);
  const outside = exclusions(p).outsideWindow;
  // a hand-set target replaces the rule, so its reason is not shown
  const basis = ruleBasis(certProfile);
  // nurses give only the date their registration runs to (Reg. 630 point 33)
  const profileIncomplete = hours ? !user.profile.certificateExpires : !user.profile.certificateIssued;
  const all = courseIdx?.courses ?? [];
  const picks = hours ? pickNurseCourses(all, todayLv(today)) : pickCourses(all, cert.specialty.trim(), todayLv(today));
  const online = hours ? pickNurseRecorded(all) : pickRecorded(all, cert.specialty.trim());

  return (
    <main className="container stack" style={{ gap: 40 }}>
      {profileIncomplete && (
        <div className="alert">
          <strong>{hours ? d.profileMissingNurse : d.profileMissing}</strong> {d.profileMissingBody(RULES.validityYears)}{" "}
          <Link href="/profile">{d.completeProfile}</Link>.
        </div>
      )}

      {own.length > 1 && (
        <nav className={styles.certSwitch} aria-label={d.certSwitch}>
          {all3.map(({ c, p: cp }) => (
            <Link key={c.id} href={c.id === "main" ? "/dashboard" : `/dashboard?sert=${c.id}`} className={c.id === cert.id ? styles.certOn : undefined} aria-current={c.id === cert.id ? "page" : undefined}>
              <b>{specialtyLabel(c.specialty, locale) || d.certSwitch}</b>
              <span>{d.certSwitchLine(cp.total, cp.required, cp.windowEnd ? formatPeriod(cp.windowEnd, null, locale) : "")}</span>
            </Link>
          ))}
        </nav>
      )}

      <Hero p={p} h={headline(p, dict, locale)} specialty={cert.specialty} nurse={hours} basis={basis} locale={locale} today={today} />

      {/* said up front: wrong period dates in the profile make every certificate "not counted" (Kārlis' test, October 2026) */}
      {outside > 0 && (
        <div className="alert">
          {dict.certs.outsideAlert(outside, formatPeriod(p.windowStart, p.windowEnd, locale))}{" "}
          <Link href="/profile">{dict.certs.outsideAlertLink}</Link>
        </div>
      )}

      {/* the main next step once points are in; stands out once the total is reached */}
      {certs.length > 0 && (
        <Link href={cert.id === "main" ? "/export" : `/export?sert=${cert.id}`} className={`btn ${p.remaining === 0 ? "btn-primary" : ""} ${styles.exportLink}`}>
          {hours ? dict.exportDocs.nurseCta : dict.exportDocs.cta} →
        </Link>
      )}

      <DashboardUpload locale={locale} readOnly={isDemoUser(user)} />

      <div className={styles.twoCol}>
        <Requirements p={p} locale={locale} hours={hours} />
        {/* where the missing points come from: the next events, then recordings to watch any time */}
        <div className="stack" style={{ gap: 32 }}>
          <CoursePicks courses={picks} locale={locale} />
          <CoursePicks courses={online} locale={locale} online />
        </div>
      </div>

      {certs.length > 0 && (
        <details className={styles.history}>
          <summary>{d.history}</summary>
          <div className="stack" style={{ gap: 40, marginTop: 24 }}>
            <section>
              <h2>{d.chartTitle}</h2>
              <div className="card">
                <ProgressChart
                  series={cumulativeSeries(p, hours)}
                  required={p.required}
                  windowStart={p.windowStart}
                  windowEnd={p.windowEnd}
                  today={todayLv(today)}
                  labels={dict.chart}
                  locale={locale}
                />
              </div>
            </section>
            <div className={styles.twoCol}>
              <CategoryBars p={p} rows={categoryBreakdown(p, locale)} locale={locale} hours={hours} />
              <RecentActivity p={p} locale={locale} />
            </div>
          </div>
        </details>
      )}
    </main>
  );
}
