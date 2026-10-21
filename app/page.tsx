import type { Metadata } from "next";
import { TEAM_PHOTOS } from "@/lib/team";
import Link from "next/link";
import { redirect } from "next/navigation";
import ProductFrame from "@/components/landing/ProductFrame";
import HowItWorks from "@/components/landing/HowItWorks";
import ScatteredDocs from "@/components/landing/ScatteredDocs";
import DemoButton from "@/components/DemoButton";
import LangSwitch from "@/components/LangSwitch";
import { currentUserId } from "@/lib/auth";
import { readCourseIndex } from "@/lib/courses/store";
import { SOURCE_URLS, type Course, type CourseSource } from "@/lib/courses/types";
import { courseStrings } from "@/components/courses/strings";
import { MONTHS_SHORT } from "@/components/dashboard/Overview";
import { formatDate, formatNumber, t, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { RULES } from "@/lib/rules";
import { CONTACT_EMAIL } from "@/lib/site";
import s from "./landing.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const d = t(await getLocale());
  const l = d.landing;
  return {
    // the landing page keeps its full marketing title, without the " · Medserti" template
    title: { absolute: l.metaTitle },
    description: l.metaDescription,
    openGraph: {
      type: "website",
      siteName: d.brand.name,
      title: l.metaTitle,
      description: l.metaDescription,
      locale: l.ogLocale,
      url: "https://medserti.lv",
    },
  };
}

/** Next dated, TIP-approved events plus the size of the catalogue; reads the stored index, never builds it */
async function upcomingEvents(): Promise<{ next: Course[]; total: number }> {
  try {
    const idx = await readCourseIndex();
    const today = new Date().toISOString().slice(0, 10);
    const all = idx?.courses ?? [];
    const next = all
      .filter((c) => c.kind === "event" && c.startDate && c.startDate >= today && c.tip != null)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
      .slice(0, 3);
    return { next, total: all.length };
  } catch {
    return { next: [], total: 0 };
  }
}


/** Example rows for the "your report" visual (not real data) */
const LEDGER = [
  { date: "2024-03-12", lv: "Akūts koronārais sindroms", en: "Acute coronary syndrome", ru: "Острый коронарный синдром", tip: 12 },
  { date: "2024-09-05", lv: "BLS un AED apmācība", en: "BLS and AED training", ru: "Обучение BLS и AED", tip: 8 },
  { date: "2025-02-14", lv: "Kardiologu kongress", en: "Cardiology congress", ru: "Конгресс кардиологов", tip: 16 },
  { date: "2025-09-25", lv: "Artroskopija", en: "Arthroscopy", ru: "Артроскопия", tip: 16 },
];
/** Example certificate period end for the same sample doctor (issued Jan 2024) */
const DEADLINE = "2029-01-15";
const shortDate = (iso: string, locale: Locale) =>
  locale === "en"
    ? formatDate(iso, locale).replace(/ 20(\d\d)$/, " $1")
    : `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}${locale === "lv" ? "." : ""}`;

/** Public landing page; signed-in users go straight to their dashboard */
export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  if (await currentUserId()) redirect("/dashboard");
  const locale = await getLocale();
  const d = t(locale);
  const { deleted } = await searchParams;
  const l = d.landing;
  const a = d.landingA;
  const { next: events, total } = await upcomingEvents();
  // only plain strings may cross into the client component (coursesBody is a function)
  const { coursesBody: _coursesBody, remaining, docsCopies: _docsCopies, ...howText } = a;
  const ledgerTotal = LEDGER.reduce((n, r) => n + r.tip, 0);

  return (
    <div className={s.root}>
      <main>
        {deleted && (
          <div className="container" style={{ paddingBottom: 0 }}>
            <div className="alert alert-ok" role="status">{d.legal.deleteAccount.done}</div>
          </div>
        )}
        <section className={s.hero} aria-labelledby="landing-title">
          <div className={s.heroInner}>
            <div className={s.heroCopy}>
              <h1 id="landing-title" className={s.heroTitle}>{a.heroTitle}</h1>
              <p className={s.heroSub}>{a.heroSub}</p>
              <div className={s.ctas}>
                <Link href="/register" className={`btn btn-primary ${s.ctaMain}`}>{a.start}</Link>
                <DemoButton label={d.demo.try} className={`btn ${s.ctaGhost}`} />
                <a href="#answer" className={`btn ${s.ctaGhost}`}>{a.seeHow}</a>
              </div>
              <p className={s.freeNote}>{l.freeNote}</p>
            </div>
            <ScatteredDocs
              label={a.scatterLabel}
              email={a.scatterEmail}
              emailSubject={a.scatterEmailSubject}
              emailFrom={a.scatterEmailFrom}
              paper={a.scatterPaper}
              paperTitle={a.scatterPaperTitle}
              paperName={a.sampleName}
              portal={a.scatterPortal}
              portalLine={a.scatterPortalLine}
              questions={a.scatterQuestions}
              deadline={a.scatterDeadline}
            />
          </div>
        </section>

        <div className={s.wrap}>
          <section className={s.section} aria-labelledby="pain-title">
            <h2 id="pain-title" className={s.h2}>{a.painTitle}</h2>
            <ul className={s.pains}>
              {a.pains.map((p) => (
                <li key={p.title}>
                  <h3 className={s.painTitle}>{p.title}</h3>
                  <p className={s.painBody}>{p.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="answer" className={s.section} aria-labelledby="answer-title">
            <div className={s.answer}>
              <div className={s.answerCopy}>
                <h2 id="answer-title" className={s.h2}>{a.answerTitle}</h2>
                <p className={s.answerBody}>{a.answerBody}</p>
                <ul className={s.answers}>
                  {a.answers.map((x) => (
                    <li key={x}><span className={s.answerMark} aria-hidden>✓</span>{x}</li>
                  ))}
                </ul>
              </div>
              <ProductFrame
                label={a.frameLabel}
                name={a.frameName}
                role={a.frameRole}
                collected={a.frameCollected}
                of={a.frameOf}
                total={ledgerTotal}
                rulesTitle={a.frameRules}
                rules={[
                  ...a.checksDone.map((label) => ({ label, done: true })),
                  { label: a.checkSpecialty, done: false },
                  { label: remaining(250 - ledgerTotal), done: false },
                ]}
                deadline={a.deadline}
                deadlineValue={formatDate(DEADLINE, locale)}
                recentTitle={a.frameRecent}
                recent={LEDGER.slice().reverse().slice(0, 3).map((r) => ({ date: shortDate(r.date, locale), title: r[locale], tip: r.tip }))}
              />
            </div>
          </section>

          <section id="how" className={s.section} aria-labelledby="how-title">
            <h2 id="how-title" className={s.h2}>{a.how}</h2>
            <HowItWorks
              l={{
                ...howText,
                readDateValue: formatDate("2025-09-25", locale),
                remainingValue: remaining(250 - ledgerTotal),
                deadlineValue: formatDate(DEADLINE, locale),
                ledgerRows: LEDGER.map((r) => ({ date: shortDate(r.date, locale), title: r[locale], tip: r.tip })),
                docsCopies: a.docsCopies(LEDGER.length),
              }}
            />
          </section>

          <section className={s.section} aria-labelledby="courses-title">
            <div className={s.courses}>
              <div>
                <h2 id="courses-title" className={s.h2}>{a.coursesTitle}</h2>
                {total > 0 && <p className={s.coursesBody}>{a.coursesBody(Math.floor(total / 100) * 100)}</p>}
                <Link href="/register" className="btn">{a.start}</Link>
              </div>
              {events.length > 0 && (
                <ul className={s.events}>
                  {events.map((c) => (
                    <li key={c.id}>
                      <span className={s.dateBlock} aria-hidden>
                        <span className={s.dateDay}>{c.startDate!.slice(8, 10)}</span>
                        <span className={s.dateMon}>{MONTHS_SHORT[locale][Number(c.startDate!.slice(5, 7)) - 1]}</span>
                      </span>
                      <span className={s.eventMain}>
                        <span className={s.eventTitle}>{c.title}</span>
                        <span className={`small ${s.muted}`}>
                          <span className="sr-only">{formatDate(c.startDate!, locale)} · </span>
                          {(c.city === "Online" ? l.online : c.city) ?? c.organizer}
                        </span>
                      </span>
                      <span className={s.eventTip}>+{formatNumber(c.tip!, locale, 1)} TIP</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className={s.section} aria-labelledby="founders-title">
            <div className={s.founders}>
              <div>
                <h2 id="founders-title" className={s.h2}>{a.foundersTitle}</h2>
                <p className={s.foundersBody}>{a.foundersBody}</p>
                <Link href="/par-mums">{d.nav.about} →</Link>
              </div>
              <ul className={s.people}>
                {d.about.people.map((p) => (
                  <li key={p.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={TEAM_PHOTOS[p.name]} alt={p.name} className={s.photo} width={132} height={132} loading="lazy" />
                    <span className={s.personName}>{p.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className={s.section} aria-labelledby="faq-title">
            <h2 id="faq-title" className={s.h2}>{l.faqTitle}</h2>
            <dl className={s.faq}>
              {a.faq.map((f) => (
                <div key={f.q}>
                  <dt>{f.q}</dt>
                  <dd>{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className={s.closing}>
            <p className={s.closingText}>{a.closing}</p>
            <Link href="/register" className={`btn ${s.closingCta}`}>{a.start}</Link>
          </div>
        </div>
      </main>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerBrand}>
            <span className="brand-seal" aria-hidden>M</span>
            <div>
              <div className={s.footerName}>{d.brand.name}</div>
              <div className={`small ${s.muted}`}>{d.brand.tagline}</div>
            </div>
          </div>
          <nav aria-label={l.footerNav}>
            <ul className={s.footerLinks}>
              <li><Link href="/register">{d.nav.signup}</Link></li>
              <li><Link href="/login">{d.nav.login}</Link></li>
              <li><DemoButton label={d.demo.try} className="" /></li>
              <li><Link href="/par-mums">{d.nav.about}</Link></li>
              <li><a href={RULES.sourceUrl} target="_blank" rel="noreferrer">{l.footerRules}</a></li>
              <li><Link href="/privatums">{d.legal.privacyLink}</Link></li>
              <li><Link href="/noteikumi">{d.legal.termsLink}</Link></li>
            </ul>
          </nav>
          <div className={s.footerContact}>
            <div className={s.footerLabel}>{l.footerContact}</div>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
          <div className={s.footerTools}>
            <LangSwitch locale={locale} label={d.lang.label} />
          </div>
        </div>
        <div className={s.footerBase}>
          <span className={`small ${s.muted}`}>© {new Date().getFullYear()} {d.brand.name}. {d.rules.planningAid}</span>
        </div>
      </footer>
    </div>
  );
}
