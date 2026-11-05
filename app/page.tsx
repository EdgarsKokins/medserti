import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import DemoButton from "@/components/DemoButton";
import EndDemo from "@/components/EndDemo";
import { IconCal, IconDoc } from "@/components/PartIcons";
import { IconClock, IconFolder } from "@/components/landing/icons";
import { CertificatesPicture, DeadlinePicture, DocumentsPicture, HeroPicture } from "@/components/landing/Pictures";
import SampleSpecialty from "@/components/landing/SampleSpecialty";
import s from "@/components/landing/landing.module.css";
import { currentUserId } from "@/lib/auth";
import { readCourseIndex } from "@/lib/courses/store";
import type { Course } from "@/lib/courses/types";
import { isDemoUserId } from "@/lib/demo/id";
import { formatNumber, MONTHS_SHORT, todayLv } from "@/lib/format";
import { t, type Dict, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { languageAlternates, localePath } from "@/lib/locale";
import { matchesSpecialty } from "@/lib/parse";
import { specialtiesFor, specialtyByCode } from "@/lib/specialties";
import { TEAM_PHOTOS } from "@/lib/team";

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

const SAMPLE = 5;
/** Specialties offered on the public sample: doctors, dentists and functional specialists (nurses have their own list) */
const SAMPLE_SPECIALTIES = [...specialtiesFor("doctor"), ...specialtiesFor("functional_specialist")];

/**
 * A few upcoming events for visitors who have not signed up: testers wanted to see the course list first
 * (Ineta Ūdra, Ralfs Gauja, November 2026). With a specialty: its events and those for every specialty.
 */
async function courseSample(code: string | null) {
  const sp = SAMPLE_SPECIALTIES.find((x) => x.code === code) ?? null;
  try {
    const idx = await readCourseIndex();
    const today = todayLv();
    const rows = (idx?.courses ?? [])
      .filter((c) => c.kind === "event" && c.startDate && c.startDate >= today && c.tip != null)
      .map((c) => ({ c, match: !!sp && matchesSpecialty(`${c.audience} ${c.title}`, sp.lv) }))
      .filter((r) => !sp || r.match || r.c.allSpecialties)
      // the specialty's own events first, then those for every specialty, each by date
      .sort((a, b) => Number(b.match) - Number(a.match) || (a.c.startDate ?? "").localeCompare(b.c.startDate ?? ""));
    return { specialty: sp, rows: rows.slice(0, SAMPLE), total: rows.length };
  } catch {
    return { specialty: sp, rows: [] as { c: Course; match: boolean }[], total: 0 };
  }
}


const tip = (n: number | null | undefined) => formatNumber(n ?? 0, 1);

/** The four parts in the order of landingB.props: anchor, colour and icon */
const PARTS = [
  { id: "sertifikati", tone: s.toneBlue, icon: <IconDoc /> },
  { id: "termins", tone: s.toneWarn, icon: <IconClock /> },
  { id: "kursi", tone: s.toneOk, icon: <IconCal /> },
  { id: "dokumenti", tone: s.toneBlue, icon: <IconFolder /> },
];

/**
 * Public landing page (version G, Edgars, November 2026): the headline, one line, all four parts at a glance and the
 * sign-up on the first screen, beside one picture of the app. Below, one short section per part, each with its own
 * picture; the courses section shows real upcoming events for a chosen specialty. Then the founders, three questions
 * and the sign-up again. Pictures use a made-up sample doctor. Nothing moves.
 * Signed-in users go straight to their dashboard; the demo visitor who comes back here leaves the demo.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string; specialitate?: string | string[] }> }) {
  const userId = await currentUserId();
  const demo = isDemoUserId(userId);
  if (userId && !demo) redirect("/dashboard");
  const locale = await getLocale();
  const d = t(locale);
  const { deleted, specialitate } = await searchParams;
  const a = d.landingA;
  const b = d.landingB;
  const sample = await courseSample(typeof specialitate === "string" ? specialitate : null);
  const props = b.props.map((p, i) => ({ ...p, ...PARTS[i] }));
  const questions = [a.faq[1], a.faq[2], { q: b.labTitle, a: b.labBody }];

  return (
    <div className={s.page}>
      {demo && <EndDemo />}
      <main className={s.root}>
        {deleted && <div className={`alert alert-ok ${s.deleted}`} role="status">{d.legal.deleteAccount.done}</div>}

        <section className={`${s.hero} ${s.toneBlue}`} aria-labelledby="landing-title">
          <div className={s.heroCopy}>
            <h1 id="landing-title" className={s.h1}>{b.heroTitle}</h1>
            <p className={s.sub}>{b.lead}</p>
            <ul className={s.props}>
              {props.map((p) => (
                <li key={p.id} className={p.tone}>
                  <a href={`#${p.id}`} className={s.prop}>
                    <span className={s.propIcon}>{p.icon}</span>
                    <span className={s.propText}>
                      <b>{p.name}</b>
                      <span>{p.short}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <div className={s.ctas}>
              <Link href="/register" className={s.cta}>{a.start}</Link>
              <DemoButton label={d.demo.try} className={s.ghost} />
            </div>
          </div>
          <HeroPicture d={d} locale={locale} />
        </section>

        <div className={s.parts}>
          <Part p={props[0]} flip><CertificatesPicture d={d} locale={locale} /></Part>
          <Part p={props[1]}><DeadlinePicture d={d} locale={locale} /></Part>
          <Part p={props[2]} flip extra={<CoursePicker d={d} locale={locale} sample={sample} />}>
            <CourseSample d={d} locale={locale} sample={sample} />
          </Part>
          <Part p={props[3]}><DocumentsPicture d={d} /></Part>
        </div>

        <section className={s.who} aria-labelledby="founders-title">
          <h2 id="founders-title" className={s.whoTitle}>{a.foundersTitle}</h2>
          <ul className={s.people}>
            {d.about.people.map((p) => (
              <li key={p.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={TEAM_PHOTOS[p.name]} alt="" width={168} height={168} loading="lazy" />
                <span>{p.name}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={s.faq} aria-labelledby="faq-title">
          <h2 id="faq-title" className={s.faqTitle}>{d.landing.faqTitle}</h2>
          <div>
            {questions.map((f) => (
              <details key={f.q} className={s.question}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={s.closing} aria-label={a.start}>
          <Link href="/register" className={s.cta}>{a.start}</Link>
          <p>{d.landing.freeNote}</p>
        </section>
      </main>
    </div>
  );
}

type Prop = { id: string; tone: string; icon: ReactNode; name: string; line: string };

/** One part: big icon, one word, one line, and its picture on a soft circle; `flip` puts the picture on the left */
function Part({ p, flip = false, extra, children }: { p: Prop; flip?: boolean; extra?: ReactNode; children: ReactNode }) {
  return (
    <section id={p.id} className={`${s.solution} ${p.tone} ${flip ? s.flip : ""}`} aria-labelledby={`${p.id}-title`}>
      <div className={s.copy}>
        <span className={s.bigIcon}>{p.icon}</span>
        <h2 id={`${p.id}-title`} className={s.h2}>{p.name}</h2>
        <p className={s.line}>{p.line}</p>
        {extra}
      </div>
      {children}
    </section>
  );
}

type Sample = Awaited<ReturnType<typeof courseSample>>;

/** The specialty select (reloads the sample with ?specialitate=) and the way to sign-up with that specialty */
function CoursePicker({ d, locale, sample }: { d: Dict; locale: Locale; sample: Sample }) {
  const b = d.landingB;
  const options = SAMPLE_SPECIALTIES.map((x) => ({ code: x.code, label: x[locale] })).sort((x, y) => x.label.localeCompare(y.label, locale));
  const code = sample.specialty?.code ?? "";
  return (
    <div className={s.picker}>
      <SampleSpecialty value={code} options={options} label={b.sampleSpecialty} any={b.sampleAny} />
      <Link href={specialtyByCode(code) ? `/register?specialitate=${code}` : "/register"} className={s.ctaSoft}>{b.sampleCta}</Link>
    </div>
  );
}

/** Real upcoming events, the specialty's own first: the courses section's picture */
function CourseSample({ d, locale, sample }: { d: Dict; locale: Locale; sample: Sample }) {
  const b = d.landingB;
  return (
    <div className={s.stage}>
      <div className={s.sheet}>
        <div className={s.sheetHead}>
          <h3 className={s.sheetTitle}>{b.sampleTitle}</h3>
        </div>
        {sample.rows.length ? (
          <ul className={s.rows}>
            {sample.rows.map(({ c, match }) => (
              <li key={c.id} className={s.row}>
                <span className={s.date}>
                  <b>{Number(c.startDate?.slice(8, 10))}</b>
                  <span>{MONTHS_SHORT[locale][Number(c.startDate?.slice(5, 7) ?? "1") - 1]}</span>
                </span>
                <span className={s.rowText}>
                  <span className={`${s.rowTitle} ${s.clamp}`}>{c.title}</span>
                  <span className={s.rowSub}>
                    {[c.city === "Online" ? b.online : c.city, c.free ? b.free : (c.price ?? b.samplePriceNone)].filter(Boolean).join(" · ")}
                  </span>
                  {sample.specialty && <span className={match ? s.tagOn : s.tag}>{match ? b.sampleMatch : b.sampleForAll}</span>}
                </span>
                <span className={s.rowTip}>+{tip(c.tip)} TIP</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.none}>{b.sampleNone}</p>
        )}
      </div>
    </div>
  );
}
