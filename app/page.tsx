import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TEAM_PHOTOS } from "@/lib/team";
import Link from "next/link";
import { redirect } from "next/navigation";
import ProductFrame from "@/components/landing/ProductFrame";
import HowItWorks from "@/components/landing/HowItWorks";
import PartsTabs, { type PartTab } from "@/components/landing/PartsTabs";
import DemoButton from "@/components/DemoButton";
import { currentUserId } from "@/lib/auth";
import { isDemoUserId } from "@/lib/demo/id";
import EndDemo from "@/components/EndDemo";
import { readCourseIndex } from "@/lib/courses/store";
import type { Course } from "@/lib/courses/types";
import { MONTHS_SHORT } from "@/components/dashboard/DateBlock";
import { t, type Dict, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { languageAlternates, localePath } from "@/lib/locale";
import s from "./landing.module.css";
import { formatDate, formatNumber, todayLv } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const d = t(locale);
  const l = d.landing;
  return {
    alternates: languageAlternates("/", locale),
    // the landing page keeps its full marketing title, without the " · Medserti" template
    title: { absolute: l.metaTitle },
    description: l.metaDescription,
    openGraph: {
      type: "website",
      siteName: d.brand.name,
      title: l.metaTitle,
      description: l.metaDescription,
      locale: l.ogLocale,
      url: `https://medserti.lv${localePath("/", locale)}`,
    },
  };
}

/** Live numbers for the three parts, from the stored index (never built here); zeros hide the counts */
async function courseFacts() {
  try {
    const idx = await readCourseIndex();
    const all = idx?.courses ?? [];
    const today = todayLv();
    const upcoming = all
      .filter((c) => c.kind === "event" && c.startDate && c.startDate >= today && c.tip != null)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    const recorded = all.filter((c) => c.kind === "recorded");
    return {
      next: upcoming.slice(0, 3),
      upcoming: upcoming.length,
      recorded: recorded.length,
      recording: recorded.find((c) => c.free && c.tip != null) ?? recorded[0] ?? null,
      sources: new Set(all.map((c) => c.source)).size,
    };
  } catch {
    return { next: [] as Course[], upcoming: 0, recorded: 0, recording: null as Course | null, sources: 0 };
  }
}
type Facts = Awaited<ReturnType<typeof courseFacts>>;

/** Example rows for the "your report" visual (not real data) */
const LEDGER = [
  { date: "2024-03-12", lv: "Akūts koronārais sindroms", en: "Acute coronary syndrome", ru: "Острый коронарный синдром", tip: 12 },
  { date: "2024-09-05", lv: "BLS un AED apmācība", en: "BLS and AED training", ru: "Обучение BLS и AED", tip: 8 },
  { date: "2025-02-14", lv: "Kardiologu kongress", en: "Cardiology congress", ru: "Конгресс кардиологов", tip: 16 },
  { date: "2025-09-25", lv: "Artroskopija", en: "Arthroscopy", ru: "Артроскопия", tip: 16 },
];
/** Example certificate period end for the same sample doctor (issued Jan 2024) */
const DEADLINE = "2029-01-15";
/** The sample doctor in the hero, part way through the period (not real data) */
const SAMPLE_TIP = 174;
const TONES = ["tone1", "tone2", "tone3"] as const;
/** which part solves each pain point, in the order of landingB.pains */
const PAIN_PART = [1, 1, 2, 3];
const shortDate = (iso: string, locale: Locale) =>
  locale === "en"
    ? formatDate(iso, locale).replace(/ 20(\d\d)$/, " $1")
    : `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}${locale === "lv" ? "." : ""}`;
const tip = (n: number | null | undefined) => formatNumber(n ?? 0, 1);

/**
 * Public landing page: Medserti as three parts (certificates and TIP, next courses, online lectures) that together
 * cover recertification. The hero shows them as one route; the pain points link to the part that solves each; below,
 * the parts are tabs over one explanation panel, so the page stays short. Signed-in users go straight to their
 * dashboard; the demo visitor who comes back here leaves the demo.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const userId = await currentUserId();
  const demo = isDemoUserId(userId);
  if (userId && !demo) redirect("/dashboard");
  const locale = await getLocale();
  const d = t(locale);
  const { deleted } = await searchParams;
  const a = d.landingA;
  const b = d.landingB;
  const facts = await courseFacts();
  const eventsLine = facts.upcoming > 0 ? b.events(facts.upcoming, facts.sources) : b.eventsNoCount;
  const recordingsLine = facts.recorded > 0 ? b.recordings(facts.recorded) : b.recordingsNoCount;

  const tabs: PartTab[] = b.parts.map((p, i) => ({
    id: `dala-${i + 1}`,
    label: `${i + 1} · ${p.verb}`,
    title: p.title,
    tone: TONES[i],
    lines: i === 1 ? [eventsLine, ...p.lines] : i === 2 ? [recordingsLine, ...p.lines] : p.lines,
  }));

  return (
    <div className={s.root}>
      {demo && <EndDemo />}
      <main>
        {deleted && (
          <div className="container" style={{ paddingBottom: 0 }}>
            <div className="alert alert-ok" role="status">{d.legal.deleteAccount.done}</div>
          </div>
        )}
        <Hero d={d} locale={locale} facts={facts} />

        <div className={s.wrap}>
          <section className={s.section} aria-labelledby="pain-title">
            <h2 id="pain-title" className={s.h2}>{b.painTitle}</h2>
            <ul className={s.pains}>
              {b.pains.map((p, i) => (
                <li key={p.title} className={s[TONES[PAIN_PART[i] - 1]]}>
                  <h3 className={s.painTitle}>{p.title}</h3>
                  <p className={s.painBody}>{p.body}</p>
                  <a href={`#dala-${PAIN_PART[i]}`} className={s.painPart}>{b.painPart(PAIN_PART[i])}</a>
                </li>
              ))}
            </ul>
          </section>

          <section className={s.section} aria-labelledby="parts-title">
            <h2 id="parts-title" className={s.h2}>{b.partsTitle}</h2>
            <PartsTabs
              tabs={tabs}
              label={b.pathLabel}
              more={b.more}
              showing={b.showing}
              panels={[
                <PanelCertificates key="1" d={d} locale={locale} />,
                <PanelCourses key="2" d={d} locale={locale} facts={facts} eventsLine={eventsLine} />,
                <PanelOnline key="3" d={d} facts={facts} recordingsLine={recordingsLine} />,
              ]}
            />
          </section>

          <section className={s.section} aria-labelledby="founders-title">
            <div className={s.founders}>
              <div>
                <h2 id="founders-title" className={s.h2}>{a.foundersTitle}</h2>
                <p className={s.foundersBody}>{a.foundersBody}</p>
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
            <h2 id="faq-title" className={s.h2}>{d.landing.faqTitle}</h2>
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
            <div className={s.closingCtas}>
              <Link href="/register" className={`btn ${s.closingCta}`}>{a.start}</Link>
              <Link href={localePath("/kontakti", locale)} className={`btn ${s.closingGhost}`}>{d.contact.cta}</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** The three parts as one route: TIP progress, next course dates, an online lecture, ending at the documents */
function Hero({ d, locale, facts }: { d: Dict; locale: Locale; facts: Facts }) {
  const b = d.landingB;
  const next = facts.next.slice(0, 2);
  return (
    <section className={s.hero} aria-labelledby="landing-title">
      <div className={s.heroInner}>
        <div className={s.heroCopy}>
          <h1 id="landing-title" className={s.heroTitle}>{b.heroTitle}</h1>
          <p className={s.heroSub}>{b.heroSub}</p>
          <div className={s.ctas}>
            <Link href="/register" className={`btn btn-primary ${s.ctaMain}`}>{d.landingA.start}</Link>
            <DemoButton label={d.demo.try} className={`btn ${s.ctaGhost}`} />
          </div>
          <p className={s.freeNote}>{d.landing.freeNote}</p>
        </div>
        <ol className={s.path} aria-label={b.pathLabel}>
          <Step n={1} verb={b.parts[0].verb} label={`${b.parts[0].verb} · ${b.parts[0].title}`} link={b.stepLink(1, b.parts[0].verb)}>
            <div className={s.cardRow}>
              <span className={s.cardBig}>{SAMPLE_TIP} / 250 TIP</span>
              <span className="small muted">{b.until(formatDate(DEADLINE, locale))}</span>
            </div>
            <div className={s.track}><div className={s.fill} style={{ width: `${(SAMPLE_TIP / 250) * 100}%` }} /></div>
            <span className="small muted">{b.sampleProgress}</span>
          </Step>
          <Step n={2} verb={b.parts[1].verb} label={`${b.parts[1].verb} · ${b.parts[1].title}`} link={b.stepLink(2, b.parts[1].verb)}>
            <ul className={s.mini}>
              {(next.length ? next : [null, null]).map((c, i) => (
                <li key={c?.id ?? i}>
                  <span className={s.miniDate}>
                    <b>{c?.startDate?.slice(8, 10) ?? (i ? "21" : "15")}</b>
                    {MONTHS_SHORT[locale][Number(c?.startDate?.slice(5, 7) ?? "11") - 1]}
                  </span>
                  <span className={s.cardTitle}>{c?.title ?? b.sampleCourses[i]}</span>
                  <span className={s.cardTip}>+{tip(c?.tip ?? (i ? 2 : 8))}</span>
                </li>
              ))}
            </ul>
          </Step>
          <Step n={3} verb={b.parts[2].verb} label={`${b.parts[2].verb} · ${b.parts[2].title}`} link={b.stepLink(3, b.parts[2].verb)} video>
            <span className={s.thumb} aria-hidden>▶</span>
            <div>
              <p className={s.stepLabel}>{`${b.parts[2].verb} · ${b.parts[2].title}`}</p>
              <span className={s.cardTitle}>{facts.recording?.title ?? b.sampleLecture}</span>
              <span className="small muted"> · +{tip(facts.recording?.tip ?? 1)} TIP, {b.anyTime}</span>
            </div>
          </Step>
          <li className={`${s.step} ${s.goal}`}>
            <span className={s.node} aria-hidden>✓</span>
            <p className={s.goalText}>{b.goal}</p>
          </li>
        </ol>
      </div>
    </section>
  );
}

/** One step of the hero route; the whole step links to its tab below */
function Step({ n, label, link, video = false, children }: { n: 1 | 2 | 3; verb: string; label: string; link: string; video?: boolean; children: ReactNode }) {
  return (
    <li className={`${s.step} ${s[TONES[n - 1]]}`}>
      <a href={`#dala-${n}`} className={s.stepLink} aria-label={link} />
      <span className={s.node} aria-hidden>{n}</span>
      <div className={`${s.panel} ${video ? s.videoPanel : ""}`}>
        {!video && <p className={s.stepLabel}>{label}</p>}
        {children}
      </div>
    </li>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className={s.answers}>
      {items.map((x) => (
        <li key={x}><span className={`${s.answerMark} ${s.toneMark}`} aria-hidden>✓</span>{x}</li>
      ))}
    </ul>
  );
}

function Steps({ title, items }: { title: string; items: { title: string; body: string }[] }) {
  return (
    <section className={s.stepsSection} aria-label={title}>
      <h3 className={s.panelH}>{title}</h3>
      <ol className={s.steps}>
        {items.map((x, i) => (
          <li key={x.title}>
            <span className={s.stepNo} aria-hidden>{i + 1}</span>
            <span>
              <b className={s.stepTitle}>{x.title}</b>
              <span className={s.stepBody}>{x.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Frame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className={s.frame} aria-hidden>
      <div className={s.frameBar}><i /><i /><i /><span className={s.frameUrl}>{url}</span></div>
      {children}
    </div>
  );
}

/** Part 1: the sample doctor's overview and how certificates become a total and documents */
function PanelCertificates({ d, locale }: { d: Dict; locale: Locale }) {
  const a = d.landingA;
  const total = LEDGER.reduce((n, r) => n + r.tip, 0);
  // only plain strings may cross into the client component (the functions stay here)
  const { remaining, docsCopies, ...howText } = a;
  return (
    <div>
      <div className={s.answer}>
        <div className={s.answerCopy}>
          <h3 className={s.h2}>{a.answerTitle}</h3>
          <p className={s.answerBody}>{a.answerBody}</p>
          <Checks items={a.answers} />
        </div>
        <ProductFrame
          label={a.frameLabel}
          name={a.frameName}
          role={a.frameRole}
          collected={a.frameCollected}
          of={a.frameOf}
          total={total}
          rulesTitle={a.frameRules}
          rules={[...a.checksDone.map((label) => ({ label, done: true })), { label: a.checkSpecialty, done: false }, { label: remaining(250 - total), done: false }]}
          deadline={a.deadline}
          deadlineValue={formatDate(DEADLINE, locale)}
          recentTitle={a.frameRecent}
          recent={LEDGER.slice().reverse().slice(0, 3).map((r) => ({ date: shortDate(r.date, locale), title: r[locale], tip: r.tip }))}
        />
      </div>
      <section id="how" className={s.stepsSection} aria-labelledby="how-title">
        <h3 id="how-title" className={s.panelH}>{a.how}</h3>
        <HowItWorks
          l={{
            ...howText,
            readDateValue: formatDate("2025-09-25", locale),
            remainingValue: remaining(250 - total),
            deadlineValue: formatDate(DEADLINE, locale),
            ledgerRows: LEDGER.map((r) => ({ date: shortDate(r.date, locale), title: r[locale], tip: r.tip })),
            docsCopies: docsCopies(LEDGER.length),
          }}
        />
      </section>
    </div>
  );
}

/** Part 2: the course list, with live upcoming events in the mock */
function PanelCourses({ d, locale, facts, eventsLine }: { d: Dict; locale: Locale; facts: Facts; eventsLine: string }) {
  const b = d.landingB;
  return (
    <div>
      <div className={s.answer}>
        <div className={s.answerCopy}>
          <h3 className={s.h2}>{b.coursesTitle}</h3>
          <p className={s.answerBody}>{b.coursesBody}</p>
          <Checks items={[eventsLine, ...b.coursesChecks]} />
        </div>
        <Frame url="medserti.lv/courses">
          <div className={s.frameBody}>
            <div className={s.chips}>
              {b.coursesChips.map((c, i) => <span key={c} className={i === 0 ? s.chipOn : s.chip}>{c}</span>)}
            </div>
            {facts.next.length > 0 && (
              <ul className={s.mini}>
                {facts.next.map((c) => (
                  <li key={c.id}>
                    <span className={s.miniDate}>
                      <b>{c.startDate?.slice(8, 10)}</b>
                      {MONTHS_SHORT[locale][Number(c.startDate?.slice(5, 7) ?? "1") - 1]}
                    </span>
                    <span>
                      <span className={s.cardTitle}>{c.title}</span>
                      <span className="small muted">{[c.city === "Online" ? b.online : c.city, c.free ? b.free : c.price].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={s.cardTip}>+{tip(c.tip)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className={s.applyRow}>
              <span className="small muted">{b.apply}</span>
              {b.applyChips.map((c) => <span key={c} className={s.chip}>{c}</span>)}
            </div>
          </div>
        </Frame>
      </div>
      <Steps title={b.howTitle} items={b.coursesSteps} />
    </div>
  );
}

/** Part 3: online lectures, with a live recording in the mock */
function PanelOnline({ d, facts, recordingsLine }: { d: Dict; facts: Facts; recordingsLine: string }) {
  const b = d.landingB;
  const r = facts.recording;
  const lectureTip = tip(r?.tip ?? 1);
  return (
    <div>
      <div className={s.answer}>
        <div className={s.answerCopy}>
          <h3 className={s.h2}>{b.onlineTitle}</h3>
          <p className={s.answerBody}>{b.onlineBody}</p>
          <Checks items={[recordingsLine, ...b.onlineChecks]} />
        </div>
        <Frame url="medserti.lv/courses?tab=recorded">
          <div className={s.video}><span className={s.play}>▶</span></div>
          <div className={s.frameBody}>
            <span className={s.cardTitle}>{r?.title ?? b.sampleLecture}</span>
            <span className="small muted">{b.recordingMeta(lectureTip, r && !r.free ? r.price ?? "" : b.free)}</span>
            <div className={s.applyRow}>
              <span className={s.chipOn}>{b.watch}</span>
              <span className="small muted">{b.afterWatch(lectureTip)}</span>
            </div>
          </div>
        </Frame>
      </div>
      <Steps title={b.howTitle} items={b.onlineSteps} />
    </div>
  );
}
