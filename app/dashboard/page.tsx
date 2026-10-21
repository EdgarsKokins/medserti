import type { Metadata } from "next";
import Link from "next/link";
import { isDemoUser, requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import { computeProgress, NURSE_RULES, REGISTER_URL, ruleBasis, RULES } from "@/lib/rules";
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
import { categoryBreakdown, cumulativeSeries, dictFor, headline, isoDay } from "@/components/dashboard/model";

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

/** Nurses: next courses for nurses (LMA list, or an audience naming nurses), then recordings */
function pickNurseCourses(courses: Course[], todayIso: string, n = 4): Course[] {
  const nurseCourses = courses.filter(isNurseCourse);
  const events = nurseCourses
    .filter((c) => c.kind === "event" && c.startDate && c.startDate >= todayIso)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!))
    .slice(0, n);
  return [...events, ...nurseCourses.filter((c) => c.kind === "recorded").slice(0, n - events.length)];
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).nav.dashboard };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [certs, courseIdx, locale] = await Promise.all([listCertificates(user.id), readCourseIndex().catch(() => null), getLocale()]);
  // nurses re-register on academic hours (Reg. 630), everyone else recertifies on TIP (Reg. 391)
  const hours = user.profile.profession === "nurse";
  const dict = dictFor(locale, hours);
  const d = dict.dashboard;
  const today = new Date();
  const p = computeProgress(user.profile, certs, today);
  // a hand-set target replaces the rule, so its reason is not shown
  const basis = user.profile.requiredPointsOverride ? null : ruleBasis(user.profile);
  // nurses give only the date their registration runs to (Reg. 630 point 33)
  const profileIncomplete = hours ? !user.profile.certificateExpires : !user.profile.certificateIssued;
  const picks = hours
    ? pickNurseCourses(courseIdx?.courses ?? [], isoDay(today))
    : pickCourses(courseIdx?.courses ?? [], user.profile.specialty.trim(), isoDay(today));

  return (
    <main className="container stack" style={{ gap: 40 }}>
      {profileIncomplete && (
        <div className="alert">
          <strong>{hours ? d.profileMissingNurse : d.profileMissing}</strong> {d.profileMissingBody(RULES.validityYears)}{" "}
          <Link href="/profile">{d.completeProfile}</Link>.
        </div>
      )}

      <Hero p={p} h={headline(p, locale, hours)} specialty={user.profile.specialty} nurse={hours} basis={basis} locale={locale} today={today} />

      <DashboardUpload locale={locale} readOnly={isDemoUser(user)} />
      {certs.some((c) => c.status === "confirmed") && (
        <Link href="/export" className={styles.exportLink}>
          {hours ? dict.exportDocs.nurseCta : dict.exportDocs.cta} →
        </Link>
      )}

      <div className={styles.twoCol}>
        <Requirements p={p} locale={locale} hours={hours} />
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
                  series={cumulativeSeries(p, hours)}
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
              <CategoryBars p={p} rows={categoryBreakdown(p, locale)} locale={locale} hours={hours} />
              <RecentActivity p={p} locale={locale} />
            </div>
          </div>
        </details>
      )}

      <p className={`small muted ${styles.footnote}`}>
        {dict.rules.label}: {hours ? dict.rules.sourceNurse : dict.rules.source} (
        <a href={hours ? NURSE_RULES.sourceUrl : RULES.sourceUrl} target="_blank" rel="noreferrer">
          likumi.lv
        </a>
        ). {hours ? dict.rules.checkOfficialInNurse : dict.rules.checkOfficialIn}{" "}
        <a href={REGISTER_URL} target="_blank" rel="noreferrer">
          {dict.rules.register}
        </a>
        . {hours ? dict.rules.planningAidNurse : dict.rules.planningAid}
      </p>
    </main>
  );
}
