import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HeroChart from "@/components/landing/HeroChart";
import HowItWorks from "@/components/landing/HowItWorks";
import LangSwitch from "@/components/LangSwitch";
import ThemeSwitch from "@/components/ThemeSwitch";
import { currentUserId } from "@/lib/auth";
import { readCourseIndex } from "@/lib/courses/store";
import { SOURCE_URLS, type Course, type CourseSource } from "@/lib/courses/types";
import { courseStrings } from "@/components/courses/strings";
import { MONTHS_SHORT } from "@/components/dashboard/Overview";
import { formatDate, formatNumber, t, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { RULES } from "@/lib/rules";
import { CONTACT_EMAIL } from "@/lib/site";
import { isTheme, THEME_COOKIE } from "@/lib/theme";
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
  { date: "2024-03-12", lv: "Akūts koronārais sindroms", en: "Acute coronary syndrome", tip: 12 },
  { date: "2024-09-05", lv: "BLS un AED apmācība", en: "BLS and AED training", tip: 8 },
  { date: "2025-02-14", lv: "Kardiologu kongress", en: "Cardiology congress", tip: 16 },
  { date: "2025-09-25", lv: "Artroskopija", en: "Arthroscopy", tip: 16 },
];
const PHOTOS: Record<string, string> = { "Matīss Kokins": "/team/matiss.jpg", "Edgars Kokins": "/team/edgars.jpg" };
const shortDate = (iso: string, locale: Locale) =>
  locale === "lv" ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}.` : formatDate(iso, locale).replace(/ 20(\d\d)$/, " $1");

/** Public landing page; signed-in users go straight to their dashboard */
export default async function Home() {
  if (await currentUserId()) redirect("/dashboard");
  const locale = await getLocale();
  const d = t(locale);
  const l = d.landing;
  const a = d.landingA;
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(saved) ? saved : "system";
  const { next: events, total } = await upcomingEvents();
  const startYear = new Date().getFullYear() - 3;
  // only plain strings may cross into the client component (coursesBody is a function)
  const { coursesBody: _coursesBody, ...howText } = a;

  return (
    <div className={s.root}>
      <main>
        <section className={s.hero} aria-labelledby="landing-title">
          <div className={s.heroInner}>
            <div>
              <h1 id="landing-title" className={s.heroTitle}>
                {a.heroLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h1>
              <p className={s.heroSub}>{a.heroSub}</p>
              <div className={s.ctas}>
                <Link href="/register" className={`btn ${s.ctaMain}`}>{a.start}</Link>
                <a href="#how" className={`btn ${s.ctaGhost}`}>{a.how} ↓</a>
              </div>
            </div>
            <HeroChart ofLabel={a.counterOf} chartLabel={a.chartLabel} startYear={startYear} />
          </div>
        </section>

        <div className={s.wrap}>
          <section id="how" className={s.section} aria-labelledby="how-title">
            <h2 id="how-title" className={s.h2}>{a.how}</h2>
            <HowItWorks
              l={{
                ...howText,
                readDateValue: formatDate("2025-09-25", locale),
                ledgerRows: LEDGER.map((r) => ({ date: shortDate(r.date, locale), title: r[locale], tip: r.tip })),
              }}
            />
          </section>

          <section className={s.section} aria-labelledby="courses-title">
            <div className={s.courses}>
              <div>
                <h2 id="courses-title" className={s.h2}>{a.coursesTitle}</h2>
                {total > 0 && <p className={s.coursesBody}>{a.coursesBody(Math.floor(total / 100) * 100)}</p>}
                <Link href="/register" className="btn btn-primary">{a.start}</Link>
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
                    <img src={PHOTOS[p.name]} alt={p.name} className={s.photo} width={132} height={132} loading="lazy" />
                    <span className={s.personName}>{p.name}</span>
                    <span className={s.personRole}>{p.role.split(" · ")[1] ?? p.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className={s.section} aria-label={l.faqTitle}>
            <div className={s.faq}>
              {a.faq.map((f) => (
                <details key={f.q} open>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <div className={s.closing}>
            <p className={s.closingText}>{a.heroLines.slice(0, 2).join(" ")}</p>
            <Link href="/register" className={`btn ${s.ctaMain}`}>{a.start}</Link>
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
              <li><Link href="/par-mums">{d.nav.about}</Link></li>
              <li><a href={RULES.sourceUrl} target="_blank" rel="noreferrer">{l.footerRules}</a></li>
            </ul>
          </nav>
          <div className={s.footerContact}>
            <div className={s.footerLabel}>{l.footerContact}</div>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
          <div className={s.footerTools}>
            <ThemeSwitch initial={theme} labels={d.theme} />
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
