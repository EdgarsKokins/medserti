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
import { isEmergencyCourse, isNurseCourse, type Course } from "@/lib/courses/types";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import styles from "@/components/dashboard/dashboard.module.css";
import ProgressChart from "@/components/dashboard/ProgressChart";
import { CategoryBars, RecentActivity } from "@/components/dashboard/Sections";
import { Requirements } from "@/components/dashboard/Overview";
import { Greeting, Tiles } from "@/components/dashboard/Tiles";
import { categoryBreakdown, cumulativeSeries, dictFor, exclusions, fmtDate, greetName, headline } from "@/components/dashboard/model";
import { formatPeriod, todayLv } from "@/lib/format";
import { addMonths } from "@/lib/notifications";
import { profileComplete } from "@/lib/profile";

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

/**
 * The first upcoming emergency care course the user can attend: shown in the courses tile while the emergency care
 * requirement is not met, even when it is not among the next few
 */
function pickEmergency(courses: Course[], specialty: string, todayIso: string, nurse: boolean): Course | null {
  const fits = (c: Course) => (nurse ? isNurseCourse(c) : c.allSpecialties || (!!specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty)));
  return (
    courses
      .filter((c) => c.kind === "event" && c.startDate && c.startDate >= todayIso && isEmergencyCourse(c) && fits(c))
      .sort((a, b) => a.startDate!.localeCompare(b.startDate!))[0] ?? null
  );
}

/** Nurses: next courses for nurses (LMA list, or an audience naming nurses) */
function pickNurseCourses(courses: Course[], todayIso: string, n = 4): Course[] {
  return courses
    .filter((c) => isNurseCourse(c) && c.kind === "event" && c.startDate && c.startDate >= todayIso)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!))
    .slice(0, n);
}

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
  const ready = p.checks.every((c) => c.met);
  // a hand-set target replaces the rule, so its reason is not shown
  const basis = ruleBasis(certProfile);
  // the profile asks only for the month and year the certificate (nurses: registration) is valid until
  const profileIncomplete = !profileComplete(user.profile);
  const all = courseIdx?.courses ?? [];
  const todayIso = todayLv(today);
  let picks = hours ? pickNurseCourses(all, todayIso, 3) : pickCourses(all, cert.specialty.trim(), todayIso, 3);
  // an unmet emergency care minimum: the next course that covers it is tagged, and takes the last place if it is later
  const emergencyOpen = p.checks.some((c) => !c.met && (c.id === "emergency_points" || c.id === "emergency_practical"));
  const helps = emergencyOpen ? pickEmergency(all, cert.specialty.trim(), todayIso, hours) : null;
  if (helps && !picks.some((c) => c.id === helps.id)) picks = [...picks.slice(0, 2), helps].sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  // this certificate's uploads, the ones to check first, then the newest
  const mine = [...p.counted, ...p.excluded];
  const waiting = mine.filter((c) => c.status === "needs_review").length;
  const latest = mine
    .filter((c) => c.status !== "failed")
    .sort((a, b) => Number(b.status === "needs_review") - Number(a.status === "needs_review") || (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 3);
  const exportHref = cert.id === "main" ? "/export" : `/export?sert=${cert.id}`;
  const h = headline(p, dict, locale);

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

      <Greeting name={greetName(user.profile.fullName, locale)} p={p} locale={locale} hours={hours} href="#more" />

      {/* said up front: wrong period dates in the profile make every certificate "not counted" (Kārlis' test, October 2026) */}
      {outside > 0 && (
        <div className="alert">
          {dict.certs.outsideAlert(outside, formatPeriod(p.windowStart, p.windowEnd, locale))}{" "}
          <Link href="/profile">{dict.certs.outsideAlertLink}</Link>
        </div>
      )}

      <Tiles
        locale={locale}
        hours={hours}
        latest={latest}
        waiting={waiting}
        hasCerts={mine.length > 0}
        ready={ready}
        exportHref={exportHref}
        courses={picks}
        helpsId={helps?.id ?? null}
        lecturesAsked={!!user.lecturesInterestAt}
        readOnly={isDemoUser(user)}
      />

      {/* everything the first screen leaves out, one click away: where each requirement stands, the documents, the history */}
      <details id="more" className={styles.history}>
        <summary>{d.more}</summary>
        <div className="stack" style={{ gap: 40, marginTop: 24 }}>
          {(h.message || basis) && (
            <div className="stack" style={{ gap: 6 }}>
              {h.message && <p style={{ margin: 0 }}>{h.message}</p>}
              {basis && <p className="small muted" style={{ margin: 0 }}>{basis === "nurse" ? dict.profile.nurseRule : dict.profile.functionalTransition}</p>}
            </div>
          )}
          <div className={styles.twoCol}>
            <Requirements p={p} locale={locale} hours={hours} />
            {certs.length > 0 && (
              <section className={`${styles.recert} ${ready ? styles.recertReady : ""}`} aria-labelledby="recert-title">
                <div className={styles.recertCopy}>
                  <h2 id="recert-title" className={styles.recertTitle}>{hours ? d.recertTitleNurse : d.recertTitle}</h2>
                  <p className={styles.recertBody}>{ready ? d.recertReady : hours ? d.recertBodyNurse : d.recertBody}</p>
                  {/* Reg. 391 point 46; nurses re-register under Reg. 630, which this line does not describe */}
                  {!hours && p.windowEnd && (p.daysLeft ?? -1) >= 0 && <p className="small muted">{d.recertDue(fmtDate(addMonths(p.windowEnd, -3), locale))}</p>}
                </div>
                <Link href={exportHref} className={`btn ${ready ? "btn-primary" : ""} ${styles.recertBtn}`}>
                  {hours ? dict.exportDocs.nurseCta : dict.exportDocs.cta} →
                </Link>
              </section>
            )}
          </div>
          {certs.length > 0 && (
            <>
              <section>
                <h2>{d.chartTitle}</h2>
                <div className="card">
                  <ProgressChart
                    series={cumulativeSeries(p, hours)}
                    required={p.required}
                    windowStart={p.windowStart}
                    windowEnd={p.windowEnd}
                    today={todayIso}
                    labels={dict.chart}
                    locale={locale}
                  />
                </div>
              </section>
              <div className={styles.twoCol}>
                <CategoryBars p={p} rows={categoryBreakdown(p, locale)} locale={locale} hours={hours} />
                <RecentActivity p={p} locale={locale} />
              </div>
            </>
          )}
        </div>
      </details>
    </main>
  );
}
