import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TEAM_PHOTOS } from "@/lib/team";
import ProductFrame from "@/components/landing/ProductFrame";
import HowItWorks from "@/components/landing/HowItWorks";
import ScatteredDocs from "@/components/landing/ScatteredDocs";
import DemoButton from "@/components/DemoButton";
import { readCourseIndex } from "@/lib/courses/store";
import type { Course } from "@/lib/courses/types";
import { MONTHS_SHORT } from "@/components/dashboard/DateBlock";
import { t, type Locale } from "@/lib/i18n";
import { formatDate, formatNumber, todayLv } from "@/lib/format";
import { localePath } from "@/lib/locale";
import s from "../../landing.module.css";
import v from "../variants.module.css";
import PartsTabs, { type PartTab } from "../PartsTabs";
import snapshot from "../snapshot.json";

/*
 * Landing page OPTIONS for Edgars to compare. Never merged; seen on this branch's Vercel preview only.
 * A: the current hero, then the three parts. B: "Visa jūsu tālākizglītība vienuviet", three product cards.
 * C: courses first, live events in the hero, points second. Latvian only until one is picked.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Sākumlapas varianti · Medserti" }, robots: { index: false, follow: false } };

const VARIANTS = { a: "A: trīs daļas zem esošā virsraksta", b: "B: trīs daļas, viens ceļš", c: "C: kursi pirmajā vietā" } as const;
type Variant = keyof typeof VARIANTS;

/** Example rows for the "your report" visual (not real data), as on the live landing page */
const LEDGER = [
  { date: "2024-03-12", lv: "Akūts koronārais sindroms", en: "Acute coronary syndrome", ru: "Острый коронарный синдром", tip: 12 },
  { date: "2024-09-05", lv: "BLS un AED apmācība", en: "BLS and AED training", ru: "Обучение BLS и AED", tip: 8 },
  { date: "2025-02-14", lv: "Kardiologu kongress", en: "Cardiology congress", ru: "Конгресс кардиологов", tip: 16 },
  { date: "2025-09-25", lv: "Artroskopija", en: "Arthroscopy", ru: "Артроскопия", tip: 16 },
];
const DEADLINE = "2029-01-15";
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}.`;

/** Live numbers from the stored course index; on a preview without the database, the 30 Oct 2026 snapshot of the public course list */
async function courseFacts(): Promise<Facts> {
  try {
    const idx = await readCourseIndex();
    const all = idx?.courses ?? [];
    if (all.length === 0) return snapshot as unknown as Facts;
    const today = todayLv();
    const upcoming = all
      .filter((c) => c.kind === "event" && c.startDate && c.startDate >= today && c.tip != null)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    const recorded = all.filter((c) => c.kind === "recorded");
    return {
      next: upcoming.slice(0, 4),
      upcoming: upcoming.length,
      recorded: recorded.length,
      recording: recorded.find((c) => c.free && c.tip != null) ?? recorded[0] ?? null,
      total: all.length,
      sources: new Set(all.map((c) => c.source)).size,
    };
  } catch {
    return snapshot as unknown as Facts;
  }
}
type Facts = { next: Course[]; upcoming: number; recorded: number; recording: Course | null; total: number; sources: number };

const lvPl = (n: number, one: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : many);

export default async function LandingOption({ params }: { params: Promise<{ v: string }> }) {
  const { v: key } = await params;
  if (!(key in VARIANTS)) notFound();
  const variant = key as Variant;
  const locale: Locale = "lv";
  const d = t(locale);
  const facts = await courseFacts();

  return (
    <div className={s.root}>
      <nav className={v.bar} aria-label="Varianti">
        <span>Priekšskatījums, nav publicēts:</span>
        {(Object.keys(VARIANTS) as Variant[]).map((k) => (
          <Link key={k} href={`/varianti/${k}`} className={k === variant ? v.barActive : undefined}>{VARIANTS[k]}</Link>
        ))}
        <Link href="/">Pašreizējā sākumlapa</Link>
      </nav>
      <main>
        {variant === "a" && (
          <>
            <HeroCurrent d={d} />
            <div className={s.wrap}>
              <Parts facts={facts} title="Viss, kas vajadzīgs resertifikācijai, vienuviet" />
              <Pains d={d} />
              <Answer d={d} />
              <How d={d} />
              <Courses d={d} facts={facts} />
              <Rest d={d} />
            </div>
          </>
        )}
        {variant === "b" && (
          <>
            <HeroAllInOne d={d} facts={facts} />
            <div className={s.wrap}>
              <PartsExplained d={d} facts={facts} />
              <Rest d={d} />
            </div>
          </>
        )}
        {variant === "c" && (
          <>
            <HeroCourses d={d} facts={facts} />
            <div className={s.wrap}>
              <section className={s.section} aria-labelledby="points-title">
                <h2 id="points-title" className={s.h2}>Un redziet, cik TIP jau ir un cik vēl trūkst</h2>
              </section>
              <Answer d={d} noTitle />
              <How d={d} />
              <Online facts={facts} />
              <Rest d={d} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

type D = ReturnType<typeof t>;

/* ---------- heroes ---------- */

function HeroCurrent({ d }: { d: D }) {
  const a = d.landingA;
  return (
    <section className={s.hero} aria-labelledby="landing-title">
      <div className={s.heroInner}>
        <div className={s.heroCopy}>
          <h1 id="landing-title" className={s.heroTitle}>{a.heroTitle}</h1>
          <p className={s.heroSub}>{a.heroSub}</p>
          <Ctas d={d} />
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
  );
}

/** Option B: one route, three parts, each in its own colour and with its own kind of picture, ending at the documents */
function HeroAllInOne({ d, facts }: { d: D; facts: Facts }) {
  const next = facts.next.slice(0, 2);
  // sample doctor, not real data
  const have = 174;
  return (
    <section className={s.hero} aria-labelledby="landing-title">
      <div className={s.heroInner}>
        <div className={s.heroCopy}>
          <h1 id="landing-title" className={s.heroTitle}>Visa jūsu resertifikācija vienuviet</h1>
          <p className={s.heroSub}>
            Trīs daļas, kas kopā aptver visu ceļu līdz resertifikācijai: punkti, ko jau esat savākuši, kursi, kuros iegūt trūkstošos, un
            lekcijas, ko noskatīties, kad jums ērti.
          </p>
          <Ctas d={d} />
        </div>
        <ol className={v.path} aria-label="Trīs daļas">
          <li className={`${v.step} ${v.tone1}`}>
            <a href="#dala-1" className={v.stepLink} aria-label="1. daļa: Saskaitiet. Uzzināt vairāk" />
            <span className={v.node} aria-hidden>1</span>
            <div className={v.panel}>
              <p className={v.stepLabel}>Saskaitiet · Sertifikāti un TIP</p>
              <div className={v.cardRow}>
                <span className={v.cardBig}>{have} / 250 TIP</span>
                <span className="small muted">līdz {formatDate(DEADLINE, "lv")}</span>
              </div>
              <div className={v.track}><div className={v.fill} style={{ width: `${(have / 250) * 100}%` }} /></div>
              <span className="small muted">Specialitātē 118 no 150 · Neatliekamā palīdzība 8 no 8</span>
            </div>
          </li>
          <li className={`${v.step} ${v.tone2}`}>
            <a href="#dala-2" className={v.stepLink} aria-label="2. daļa: Plānojiet. Uzzināt vairāk" />
            <span className={v.node} aria-hidden>2</span>
            <div className={v.panel}>
              <p className={v.stepLabel}>Plānojiet · Nākamie kursi</p>
              <ul className={v.mini}>
                {(next.length ? next : [null, null]).map((c, i) => (
                  <li key={c?.id ?? i}>
                    <span className={v.miniDate}>
                      <b>{c?.startDate?.slice(8, 10) ?? (i ? "21" : "15")}</b>
                      {MONTHS_SHORT.lv[Number(c?.startDate?.slice(5, 7) ?? "11") - 1]}
                    </span>
                    <span className={v.cardTitle}>{c?.title ?? (i ? "Neirologu biedrības sēde" : "Kardiologu biedrības konference")}</span>
                    <span className={v.cardTip}>+{formatNumber(c?.tip ?? (i ? 2 : 8), 1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
          <li className={`${v.step} ${v.tone3}`}>
            <a href="#dala-3" className={v.stepLink} aria-label="3. daļa: Papildiniet. Uzzināt vairāk" />
            <span className={v.node} aria-hidden>3</span>
            <div className={`${v.panel} ${v.videoPanel}`}>
              <span className={v.thumb} aria-hidden>▶</span>
              <div>
                <p className={v.stepLabel}>Papildiniet · Tiešsaistes lekcijas</p>
                <span className={v.cardTitle}>{facts.recording?.title ?? "Pneimokoku infekcijas: riski un risinājumi"}</span>
                <span className="small muted"> · +{formatNumber(facts.recording?.tip ?? 1, 1)} TIP, skatāms jebkurā laikā</span>
              </div>
            </div>
          </li>
          <li className={`${v.step} ${v.goal}`}>
            <span className={v.node} aria-hidden>✓</span>
            <p className={v.goalText}>Resertifikācijas dokumenti, gatavi iesniegšanai</p>
          </li>
        </ol>
      </div>
    </section>
  );
}

/** Option B, under the hero: the three parts as tabs, each opening its own explanation (one panel, not three long sections) */
function PartsExplained({ d, facts }: { d: D; facts: Facts }) {
  const tabs: PartTab[] = [
    {
      id: "dala-1", label: "1 · Saskaitiet", title: "Sertifikāti un TIP", tone: "tone1",
      lines: ["PDF vai foto, dati nolasīti automātiski", "TIP pēc MK noteikumiem Nr. 391", "Resertifikācijas dokumenti no jūsu sertifikātiem"],
    },
    {
      id: "dala-2", label: "2 · Plānojiet", title: "Nākamie kursi", tone: "tone2",
      lines: [`${facts.upcoming > 0 ? `${facts.upcoming} gaidāmi pasākumi` : "Gaidāmie pasākumi"} no ${facts.sources || 7} avotiem`, "Atlasīti pēc jūsu specialitātes", "TIP, cena un pieteikšanās vienuviet"],
    },
    {
      id: "dala-3", label: "3 · Papildiniet", title: "Tiešsaistes lekcijas", tone: "tone3",
      lines: [`${facts.recorded > 0 ? `${facts.recorded} ${lvPl(facts.recorded, "ierakstīta lekcija", "ierakstītas lekcijas")}` : "Ierakstītas lekcijas"} ar TIP`, "Skatāmas jebkurā laikā", "Kad tuvumā nav pasākumu"],
    },
  ];
  return (
    <section className={s.section} aria-labelledby="parts-title">
      <h2 id="parts-title" className={s.h2}>Trīs daļas, kas aptver visu resertifikāciju</h2>
      <PartsTabs
        tabs={tabs}
        panels={[
          <div key="1">
            <Answer d={d} />
            <How d={d} />
          </div>,
          <PanelCourses key="2" facts={facts} />,
          <PanelOnline key="3" facts={facts} />,
        ]}
      />
    </section>
  );
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <section className={v.stepsSection} aria-label="Kā tas strādā">
      <h3 className={v.panelH}>Kā tas strādā</h3>
      <ol className={v.steps}>
        {items.map(([title, body], i) => (
          <li key={title}>
            <span className={v.stepNo} aria-hidden>{i + 1}</span>
            <span>
              <b className={v.stepTitle}>{title}</b>
              <span className={v.stepBody}>{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className={s.answers}>
      {items.map((x) => (
        <li key={x}><span className={`${s.answerMark} ${v.toneMark}`} aria-hidden>✓</span>{x}</li>
      ))}
    </ul>
  );
}

function Frame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className={v.frame} aria-hidden>
      <div className={v.frameBar}><i /><i /><i /><span className={v.frameUrl}>{url}</span></div>
      {children}
    </div>
  );
}

function PanelCourses({ facts }: { facts: Facts }) {
  const rows = facts.next.slice(0, 3);
  return (
    <div>
      <div className={s.answer}>
        <div className={s.answerCopy}>
          <h3 className={s.h2}>Atrodiet kursus, kas jums vēl vajadzīgi</h3>
          <p className={s.answerBody}>
            Medserti apvieno apstiprinātos pasākumus no LĀB un kursu rīkotāju vietnēm vienā sarakstā. Jūs redzat to, kas attiecas uz jūsu
            specialitāti, un uzreiz zināt, cik TIP kurss dod.
          </p>
          <Checks
            items={[
              `${facts.upcoming > 0 ? `${facts.upcoming} gaidāmi pasākumi` : "Gaidāmie pasākumi"} no ${facts.sources || 7} avotiem`,
              "Atlase pēc specialitātes, pilsētas un datuma",
              "TIP, cena un vieta pie katra kursa",
              "Pieteikuma e-pasts jau sagatavots",
            ]}
          />
        </div>
        <Frame url="medserti.lv/courses">
          <div className={v.frameBody}>
            <div className={v.chips}>
              <span className={v.chipOn}>✓ Mana specialitāte</span>
              <span className={v.chip}>Rīga</span>
              <span className={v.chip}>Nākamie 3 mēneši</span>
              <span className={v.chip}>Bez maksas</span>
            </div>
            <ul className={v.mini}>
              {rows.map((c) => (
                <li key={c.id}>
                  <span className={v.miniDate}>
                    <b>{c.startDate?.slice(8, 10)}</b>
                    {MONTHS_SHORT.lv[Number(c.startDate?.slice(5, 7) ?? "1") - 1]}
                  </span>
                  <span>
                    <span className={v.cardTitle}>{c.title}</span>
                    <span className="small muted">{[c.city === "Online" ? "Tiešsaistē" : c.city, c.free ? "Bez maksas" : c.price].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className={v.cardTip}>+{formatNumber(c.tip ?? 0, 1)}</span>
                </li>
              ))}
            </ul>
            <div className={v.applyRow}>
              <span className="small muted">Pieteikties:</span>
              <span className={v.chip}>Kopēt e-pastu</span>
              <span className={v.chip}>Gmail</span>
              <span className={v.chip}>Outlook</span>
            </div>
          </div>
        </Frame>
      </div>
      <Steps
        items={[
          ["Atlasiet", "Saraksts rāda kursus jūsu specialitātei. Sašauriniet pēc pilsētas, datuma un cenas."],
          ["Salīdziniet", "Pie katra kursa redzat TIP, cenu, vietu un rīkotāju."],
          ["Piesakieties", "Pieteikuma e-pasts jau sagatavots: nokopējiet to vai atveriet savā e-pastā."],
          ["Pievienojiet sertifikātu", "Pēc kursa sertifikātu pievienojat no tā paša kursa, un TIP nonāk pārskatā."],
        ]}
      />
    </div>
  );
}

function PanelOnline({ facts }: { facts: Facts }) {
  const r = facts.recording;
  return (
    <div>
      <div className={s.answer}>
        <div className={s.answerCopy}>
          <h3 className={s.h2}>Trūkstošos punktus iegūstiet tiešsaistē</h3>
          <p className={s.answerBody}>
            Ierakstītas lekcijas ar TIP, ko varat noskatīties, kad jums ērti. Noder, ja tuvumā nav pasākumu vai līdz termiņam palicis maz
            laika.
          </p>
          <Checks
            items={[
              `${facts.recorded > 0 ? `${facts.recorded} ${lvPl(facts.recorded, "ierakstīta lekcija", "ierakstītas lekcijas")}` : "Ierakstītas lekcijas"} ar TIP`,
              "Bezmaksas un maksas, ar cenu",
              "Atlasītas pēc jūsu specialitātes",
              "Saite uz lekciju vienā klikšķī",
            ]}
          />
        </div>
        <Frame url="medserti.lv/courses?tab=recorded">
          <div className={v.video}><span className={v.play}>▶</span></div>
          <div className={v.frameBody}>
            <span className={v.cardTitle}>{r?.title ?? "Pneimokoku infekcijas: riski un risinājumi"}</span>
            <span className="small muted">Ieraksts · +{formatNumber(r?.tip ?? 1, 1)} TIP · {r ? (r.free ? "Bez maksas" : r.price ?? "") : "Bez maksas"}</span>
            <div className={v.applyRow}>
              <span className={v.chipOn}>Skatīties ↗</span>
              <span className="small muted">Pēc tam: sertifikāts → +{formatNumber(r?.tip ?? 1, 1)} TIP pārskatā</span>
            </div>
          </div>
        </Frame>
      </div>
      <Steps
        items={[
          ["Izvēlieties lekciju", "Ieraksti ar TIP jūsu specialitātei, bezmaksas un maksas."],
          ["Noskatieties, kad ērti", "Vakarā, brīvdienās, bez braukšanas uz pasākumu."],
          ["Saņemiet sertifikātu", "Rīkotājs izsniedz sertifikātu par noskatīto lekciju."],
          ["TIP pārskatā", "Augšupielādējiet sertifikātu Medserti, un punkti pieskaitās kopsummai."],
        ]}
      />
    </div>
  );
}

function HeroCourses({ d, facts }: { d: D; facts: Facts }) {
  return (
    <section className={s.hero} aria-labelledby="landing-title">
      <div className={s.heroInner}>
        <div className={s.heroCopy}>
          <h1 id="landing-title" className={s.heroTitle}>Atrodiet nākamos TIP kursus un sekojiet saviem punktiem</h1>
          <p className={s.heroSub}>
            {facts.total > 0 ? `${Math.floor(facts.total / 50) * 50}+ apstiprināti kursi un lekcijas no ${facts.sources} avotiem` : "Apstiprināti kursi un lekcijas no LĀB un rīkotāju vietnēm"}{" "}
            vienā sarakstā, atlasīti pēc jūsu specialitātes. Augšupielādējiet sertifikātus, un Medserti saskaita, cik TIP vēl trūkst.
          </p>
          <Ctas d={d} />
        </div>
        <div className={v.heroList}>
          <div className={v.heroListHead}>
            <span>Gaidāmie pasākumi ar TIP</span>
            {facts.upcoming > 0 && <span className="small muted">{facts.upcoming} {lvPl(facts.upcoming, "pasākums", "pasākumi")}</span>}
          </div>
          <EventList events={facts.next} />
        </div>
      </div>
    </section>
  );
}

function Ctas({ d }: { d: D }) {
  return (
    <>
      <div className={s.ctas}>
        <Link href="/register" className={`btn btn-primary ${s.ctaMain}`}>{d.landingA.start}</Link>
        <DemoButton label={d.demo.try} className={`btn ${s.ctaGhost}`} />
      </div>
      <p className={s.freeNote}>{d.landing.freeNote}</p>
    </>
  );
}

/* ---------- sections ---------- */

function Parts({ facts, title }: { facts: Facts; title: string }) {
  return (
    <section className={s.section} aria-labelledby="parts-title">
      <h2 id="parts-title" className={s.h2}>{title}</h2>
      <ul className={v.parts}>
        <li>
          <p className={v.partNo}>1</p>
          <h3 className={v.partTitle}>Sertifikāti un TIP</h3>
          <p className={v.partBody}>Augšupielādējiet sertifikātus. Medserti tos nolasa, saskaita TIP pēc MK noteikumiem Nr. 391 un parāda, cik vēl trūkst un līdz kuram datumam.</p>
          <p className={v.partStat}>Visas prasības: 60% specialitātē, neatliekamā palīdzība</p>
        </li>
        <li>
          <p className={v.partNo}>2</p>
          <h3 className={v.partTitle}>Nākamie kursi</h3>
          <p className={v.partBody}>Apstiprināti pasākumi no LĀB un kursu rīkotāju vietnēm vienā sarakstā, atlasīti pēc jūsu specialitātes, ar TIP, cenu un pieteikšanos.</p>
          {facts.upcoming > 0 && <p className={v.partStat}>{facts.upcoming} gaidāmi pasākumi ar TIP</p>}
        </li>
        <li>
          <p className={v.partNo}>3</p>
          <h3 className={v.partTitle}>Tiešsaistes kursi</h3>
          <p className={v.partBody}>Ierakstītas lekcijas ar TIP, ko varat noskatīties, kad jums ērti, arī tad, kad tuvumā nav pasākumu.</p>
          {facts.recorded > 0 && <p className={v.partStat}>{facts.recorded} {lvPl(facts.recorded, "ierakstīta lekcija", "ierakstītas lekcijas")}</p>}
        </li>
      </ul>
    </section>
  );
}

function Pains({ d }: { d: D }) {
  const a = d.landingA;
  return (
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
  );
}

function Answer({ d, noTitle = false }: { d: D; noTitle?: boolean }) {
  const a = d.landingA;
  const total = LEDGER.reduce((n, r) => n + r.tip, 0);
  return (
    <section id="answer" className={noTitle ? undefined : s.section} aria-label={a.answerTitle}>
      <div className={s.answer}>
        <div className={s.answerCopy}>
          {!noTitle && <h2 className={s.h2}>{a.answerTitle}</h2>}
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
          total={total}
          rulesTitle={a.frameRules}
          rules={[...a.checksDone.map((label) => ({ label, done: true })), { label: a.checkSpecialty, done: false }, { label: a.remaining(250 - total), done: false }]}
          deadline={a.deadline}
          deadlineValue={formatDate(DEADLINE, "lv")}
          recentTitle={a.frameRecent}
          recent={LEDGER.slice().reverse().slice(0, 3).map((r) => ({ date: shortDate(r.date), title: r.lv, tip: r.tip }))}
        />
      </div>
    </section>
  );
}

function How({ d }: { d: D }) {
  const a = d.landingA;
  const { coursesBody: _c, remaining, docsCopies: _dc, ...howText } = a;
  const total = LEDGER.reduce((n, r) => n + r.tip, 0);
  return (
    <section id="how" className={s.section} aria-labelledby="how-title">
      <h2 id="how-title" className={s.h2}>{a.how}</h2>
      <HowItWorks
        l={{
          ...howText,
          readDateValue: formatDate("2025-09-25", "lv"),
          remainingValue: remaining(250 - total),
          deadlineValue: formatDate(DEADLINE, "lv"),
          ledgerRows: LEDGER.map((r) => ({ date: shortDate(r.date), title: r.lv, tip: r.tip })),
          docsCopies: a.docsCopies(LEDGER.length),
        }}
      />
    </section>
  );
}

function EventList({ events }: { events: Course[] }) {
  if (events.length === 0) return <p className="muted">Kursu saraksts šajā priekšskatījumā nav pieejams.</p>;
  return (
    <ul className={s.events}>
      {events.map((c) => (
        <li key={c.id}>
          <span className={s.dateBlock} aria-hidden>
            <span className={s.dateDay}>{c.startDate!.slice(8, 10)}</span>
            <span className={s.dateMon}>{MONTHS_SHORT.lv[Number(c.startDate!.slice(5, 7)) - 1]}</span>
          </span>
          <span className={s.eventMain}>
            <span className={s.eventTitle}>{c.title}</span>
            <span className={`small ${s.muted}`}>{(c.city === "Online" ? "Tiešsaistē" : c.city) ?? c.organizer}</span>
          </span>
          <span className={s.eventTip}>+{formatNumber(c.tip!, 1)} TIP</span>
        </li>
      ))}
    </ul>
  );
}

function Courses({ d, facts }: { d: D; facts: Facts }) {
  const a = d.landingA;
  return (
    <section className={s.section} aria-labelledby="courses-title">
      <div className={s.courses}>
        <div>
          <h2 id="courses-title" className={s.h2}>{a.coursesTitle}</h2>
          {facts.total > 0 && <p className={s.coursesBody}>{a.coursesBody(Math.floor(facts.total / 100) * 100)}</p>}
          <Link href="/register" className="btn">{a.start}</Link>
        </div>
        <EventList events={facts.next.slice(0, 3)} />
      </div>
    </section>
  );
}

function Online({ facts }: { facts: Facts }) {
  return (
    <section className={s.section} aria-labelledby="online-title">
      <div className={v.band}>
        <div>
          <h2 id="online-title" className={s.h2}>Nav laika braukt? Tiešsaistes lekcijas ar TIP</h2>
          <p className={s.answerBody}>
            {facts.recorded > 0 ? `${facts.recorded} ${lvPl(facts.recorded, "ierakstīta lekcija", "ierakstītas lekcijas")}` : "Ierakstītas lekcijas"}, ko varat
            noskatīties, kad jums ērti. Medserti tās rāda kopā ar pasākumiem, atlasītas pēc jūsu specialitātes.
          </p>
        </div>
        {facts.recording && (
          <div className={v.card}>
            <p className={v.cardLabel}>Piemērs</p>
            <div className={v.cardRow}>
              <span className={v.cardTitle}>{facts.recording.title}</span>
              {facts.recording.tip != null && <span className={v.cardTip}>+{formatNumber(facts.recording.tip, 1)} TIP</span>}
            </div>
            <span className="small muted">{facts.recording.free ? "Bez maksas" : facts.recording.price ?? ""}</span>
          </div>
        )}
      </div>
    </section>
  );
}

/** Founders, FAQ and the closing call, as on the live page */
function Rest({ d }: { d: D }) {
  const a = d.landingA;
  return (
    <>
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
          <Link href={localePath("/kontakti", "lv")} className={`btn ${s.closingGhost}`}>{d.contact.cta}</Link>
        </div>
      </div>
    </>
  );
}
