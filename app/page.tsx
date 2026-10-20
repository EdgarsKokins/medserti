import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import About from "@/components/About";
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

/** Next dated, TIP-approved events from the stored index; never builds the index on page load */
async function upcomingEvents(): Promise<Course[]> {
  try {
    const idx = await readCourseIndex();
    const today = new Date().toISOString().slice(0, 10);
    return (idx?.courses ?? [])
      .filter((c) => c.kind === "event" && c.startDate && c.startDate >= today && c.tip != null)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
      .slice(0, 3);
  } catch {
    return [];
  }
}

const COURSE_SOURCES: CourseSource[] = ["lab_tip", "lumpii", "kursiarstiem", "medicinaskursi"];

/** Public landing page; signed-in users go straight to their dashboard */
export default async function Home() {
  if (await currentUserId()) redirect("/dashboard");
  const locale = await getLocale();
  const d = t(locale);
  const l = d.landing;
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(saved) ? saved : "system";
  const events = await upcomingEvents();

  return (
    <>
      <main className={s.page}>
        <section className={s.hero} aria-labelledby="landing-title">
          <div className={s.heroText}>
            <p className="eyebrow">{l.eyebrow}</p>
            <h1 id="landing-title" className={s.title}>{l.title}</h1>
            <p className={s.lead}>{l.lead}</p>
            <div className={s.ctas}>
              <Link href="/register" className={`btn btn-primary ${s.cta}`}>{l.start}</Link>
              <Link href="/login" className={`btn ${s.cta}`}>{l.login}</Link>
            </div>
            <p className={s.freeNote}>{l.freeNote}</p>
          </div>
          <MockDashboard locale={locale} />
        </section>

        <section className={s.section} aria-labelledby="steps-title">
          <h2 id="steps-title" className={s.h2}>{l.stepsTitle}</h2>
          <ol className={s.steps}>
            {l.steps.map((step, i) => (
              <li key={i}>
                <span className={s.stepNum} aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <h3 className={s.stepTitle}>{step.title}</h3>
                <p className={s.muted}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.section} aria-labelledby="rules-title">
          <div className={s.sectionHead}>
            <h2 id="rules-title" className={s.h2}>{l.rulesTitle}</h2>
            <p className={s.muted}>{l.rulesLead}</p>
          </div>
          <div>
            <ul className={s.rules}>
              {l.rules.map((r) => (
                <li key={r.value}>
                  <span className={s.ruleValue}>{r.value}</span>
                  <span>{r.body}</span>
                </li>
              ))}
            </ul>
            <p className={s.note}>
              {l.rulesNote}{" "}
              <a href={RULES.sourceUrl} target="_blank" rel="noreferrer">{l.rulesSource}</a>
            </p>
          </div>
        </section>

        <section className={s.section} aria-labelledby="courses-title">
          <div className={s.sectionHead}>
            <h2 id="courses-title" className={s.h2}>{l.coursesTitle}</h2>
            <p className={s.muted}>{l.coursesLead}</p>
            <ul className={s.sources}>
              {COURSE_SOURCES.map((src) => (
                <li key={src}>
                  <a href={SOURCE_URLS[src]} target="_blank" rel="noreferrer">{courseStrings(locale).sourceLabels[src]}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            {events.length > 0 && (
              <>
                <h3 className={s.listTitle}>{l.coursesUpcoming}</h3>
                <ul className={s.events}>
                  {events.map((c) => (
                    <li key={c.id}>
                      <span className={s.dateBlock} aria-hidden>
                        <span className={s.dateDay}>{c.startDate!.slice(8, 10)}</span>
                        <span className={s.dateMon}>{MONTHS_SHORT[locale][Number(c.startDate!.slice(5, 7)) - 1]}</span>
                      </span>
                      <span className={s.eventMain}>
                        <a href={c.url} target="_blank" rel="noreferrer" className={s.eventTitle}>{c.title}</a>
                        <span className={`small ${s.muted}`}>
                          <span className="sr-only">{formatDate(c.startDate!, locale)} · </span>
                          {(c.city === "Online" ? l.online : c.city === "Latvija" ? courseStrings(locale).wholeLatvia : c.city) ?? c.organizer}
                        </span>
                      </span>
                      <span className={s.eventTip}>{formatNumber(c.tip!, locale, 1)} TIP</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className={s.note}>{l.coursesMore}</p>
            <Link href="/register" className="btn btn-primary">{l.start}</Link>
          </div>
        </section>

        <div className={s.about}>
          <About locale={locale} />
        </div>

        <section className={s.section} aria-labelledby="faq-title">
          <h2 id="faq-title" className={s.h2}>{l.faqTitle}</h2>
          <dl className={s.faq}>
            {l.faq.map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
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
    </>
  );
}

/** Static miniature of the dashboard hero with example numbers (not a screenshot, so it follows the theme) */
function MockDashboard({ locale }: { locale: Locale }) {
  const d = t(locale);
  const l = d.landing;
  const total = 22;
  const required = 250;
  const pointsPct = (total / required) * 100;
  const timePct = 52;
  const daysLeft = 875;
  const perMonth = (required - total) / (daysLeft / 30.44);
  return (
    <figure className={s.mock}>
      <div className={s.mockCard} role="img" aria-label={`${l.mockLabel}: ${total} ${d.dashboard.ofRequired(required)}, ${d.dashboard.daysLeftShort(daysLeft)}`}>
        <div className="eyebrow">{l.mockSpecialty} · {l.mockValidUntil}</div>
        <div className={s.mockRow}>
          <div className={s.mockBigLine}>
            <span className={s.mockBig}>{total}</span>
            <span className={s.mockOf}>{d.dashboard.ofRequired(required)}</span>
          </div>
          <div className={s.mockSide}>
            <div className={s.mockDays}>{d.dashboard.daysLeftShort(daysLeft)}</div>
            <div className={s.mockPace}>{d.dashboard.paceShort(formatNumber(perMonth, locale, 1))}</div>
          </div>
        </div>
        <div className={s.track}>
          <div className={s.fill} style={{ width: `${pointsPct}%` }} />
          <div className={s.todayMark} style={{ left: `${timePct}%` }}>
            <span className={s.todayLabel}>{d.dashboard.today}</span>
          </div>
        </div>
        <div className={s.bandLabels}>
          <span>2024</span>
          <span className={s.bandLegend}>
            <i className={s.keyFill} /> {d.dashboard.collected(Math.round(pointsPct))}
            <i className={s.keyTime} /> {d.dashboard.timeElapsed(timePct)}
          </span>
          <span>2029</span>
        </div>
        <ul className={s.mockChecks} aria-hidden>
          {(["total", "specialty", "emergency_points"] as const).map((id, i) => (
            <li key={id}>
              <span className={s.mockMark} />
              <span>{d.checks[id]}</span>
              <span className={s.mockVal}>{[`${total} / ${required}`, `14 / ${Math.ceil(required * RULES.specialtyShare)}`, `0 / ${RULES.emergencyMinPoints}`][i]}</span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className={s.mockNote}>{l.mockNote}</figcaption>
    </figure>
  );
}
