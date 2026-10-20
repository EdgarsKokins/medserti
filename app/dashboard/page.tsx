import type { Metadata } from "next";
import Link from "next/link";
import { isDemoUser, requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import { computeProgress, REGISTER_URL, RULES } from "@/lib/rules";
import { matchesSpecialty } from "@/lib/parse";
import { readCourseIndex } from "@/lib/courses/store";
import type { Course } from "@/lib/courses/types";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import styles from "@/components/dashboard/dashboard.module.css";
import ProgressChart from "@/components/dashboard/ProgressChart";
import { CategoryBars, RecentActivity } from "@/components/dashboard/Sections";
import { CoursePicks, Hero, Requirements } from "@/components/dashboard/Overview";
import DashboardUpload from "@/components/dashboard/DashboardUpload";
import { confirmCheckedEligible } from "@/lib/parse/confidence";
import { certificateWindow } from "@/lib/rules";
import { categoryBreakdown, cumulativeSeries, headline, isoDay } from "@/components/dashboard/model";

/** Next events for this specialty (or all specialties), then free recordings, at most `n` */
function pickCourses(courses: Course[], specialty: string, todayIso: string, n = 4): Course[] {
  const fits = (c: Course) => c.allSpecialties || (!!specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty));
  const mine = (c: Course) => !!specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty);
  const events = courses
    .filter((c) => c.kind === "event" && c.startDate && c.startDate >= todayIso && fits(c))
    .sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.startDate!.localeCompare(b.startDate!))
    .slice(0, n)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  if (events.length >= n) return events;
  const recorded = courses.filter((c) => c.kind === "recorded" && c.free && fits(c)).slice(0, n - events.length);
  return [...events, ...recorded];
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).nav.dashboard };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [certs, courseIdx, locale] = await Promise.all([listCertificates(user.id), readCourseIndex().catch(() => null), getLocale()]);
  const dict = t(locale);
  const d = dict.dashboard;
  const today = new Date();
  const p = computeProgress(user.profile, certs, today);
  const profileIncomplete = !user.profile.certificateIssued;
  const picks = pickCourses(courseIdx?.courses ?? [], user.profile.specialty.trim(), isoDay(today));

  return (
    <main className="container stack" style={{ gap: 40 }}>
      {profileIncomplete && (
        <div className="alert">
          <strong>{d.profileMissing}</strong> {d.profileMissingBody(RULES.validityYears)}{" "}
          <Link href="/profile">{d.completeProfile}</Link>.
        </div>
      )}

      <Hero p={p} h={headline(p, locale)} specialty={user.profile.specialty} locale={locale} today={today} />

      <DashboardUpload
        locale={locale}
        readOnly={isDemoUser(user)}
        checked={certs.filter((c) => confirmCheckedEligible(c, certs, certificateWindow(user.profile), isoDay(today)))}
      />
      {certs.some((c) => c.status === "confirmed") && (
        <Link href="/export" className={styles.exportLink}>
          {dict.exportDocs.cta} →
        </Link>
      )}

      <div className={styles.twoCol}>
        <Requirements p={p} locale={locale} />
        <CoursePicks courses={picks} locale={locale} />
      </div>

      {certs.length > 0 && (
        <details className={styles.history}>
          <summary>{d.history}</summary>
          <div className="stack" style={{ gap: 40, marginTop: 24 }}>
            <section>
              <h2>{d.chartTitle}</h2>
              <div className="card">
                <ProgressChart
                  series={cumulativeSeries(p)}
                  required={p.required}
                  windowStart={p.windowStart}
                  windowEnd={p.windowEnd}
                  today={isoDay(today)}
                  labels={dict.chart}
                  locale={locale}
                />
              </div>
            </section>
            <div className={styles.twoCol}>
              <CategoryBars p={p} rows={categoryBreakdown(p, locale)} locale={locale} />
              <RecentActivity p={p} locale={locale} />
            </div>
          </div>
        </details>
      )}

      <p className={`small muted ${styles.footnote}`}>
        {dict.rules.label}: {dict.rules.source} (
        <a href={RULES.sourceUrl} target="_blank" rel="noreferrer">
          likumi.lv
        </a>
        ). {dict.rules.checkOfficialIn}{" "}
        <a href={REGISTER_URL} target="_blank" rel="noreferrer">
          {dict.rules.register}
        </a>
        . {dict.rules.planningAid}
      </p>
    </main>
  );
}
