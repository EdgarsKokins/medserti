import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCertificates } from "@/lib/db";
import { computeProgress, REGISTER_URL, RULES } from "@/lib/rules";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import styles from "@/components/dashboard/dashboard.module.css";
import ProgressChart from "@/components/dashboard/ProgressChart";
import { CategoryBars, ChecksGrid, HeadlineCard, RecentActivity } from "@/components/dashboard/Sections";
import { categoryBreakdown, cumulativeSeries, headline, isoDay, onTrackToday } from "@/components/dashboard/model";

export default async function DashboardPage() {
  const user = await requireUser();
  const certs = await listCertificates(user.id);
  const locale = await getLocale();
  const dict = t(locale);
  const d = dict.dashboard;
  const today = new Date();
  const p = computeProgress(user.profile, certs, today);
  const profileIncomplete = !user.profile.certificateIssued;
  const firstName = user.profile.fullName?.trim().split(/\s+/)[0];

  return (
    <main className="container stack">
      <div className="page-head">
        <div>
          <h1>{d.title}</h1>
          <p className="muted">{d.lead(firstName, user.profile.specialty || undefined)}</p>
        </div>
        <Link href="/certificates" className="btn btn-primary">
          {d.addCert}
        </Link>
      </div>

      {profileIncomplete && (
        <div className="alert">
          <strong>{d.profileMissing}</strong> {d.profileMissingBody(RULES.validityYears)}{" "}
          <Link href="/profile">{d.completeProfile}</Link>.
        </div>
      )}

      <HeadlineCard p={p} h={headline(p, locale)} onTrack={onTrackToday(p, today)} locale={locale} />

      {certs.length === 0 ? (
        <section className="card">
          <h2>{d.noCertsTitle}</h2>
          <p>{d.noCertsBody}</p>
          <Link href="/certificates" className="btn btn-primary">
            {d.uploadCerts}
          </Link>
        </section>
      ) : (
        <>
          <ChecksGrid p={p} locale={locale} />

          <section className="card">
            <h2>{d.chartTitle}</h2>
            <ProgressChart
              series={cumulativeSeries(p)}
              required={p.required}
              windowStart={p.windowStart}
              windowEnd={p.windowEnd}
              today={isoDay(today)}
              labels={dict.chart}
              locale={locale}
            />
          </section>

          <div className={styles.twoCol}>
            <CategoryBars p={p} rows={categoryBreakdown(p, locale)} locale={locale} />
            <RecentActivity p={p} locale={locale} />
          </div>
        </>
      )}

      <p className="small muted">
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
