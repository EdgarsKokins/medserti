import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getUser, listCertificates } from "@/lib/db";
import { DEMO_USER_ID, ensureDemo } from "@/lib/demo";
import { certProgress } from "@/lib/certAssign";
import { pickCert } from "@/lib/profileCerts";
import { matchesSpecialty } from "@/lib/parse";
import { readCourseIndex } from "@/lib/courses/store";
import type { Course } from "@/lib/courses/types";
import { profileComplete } from "@/lib/profile";
import { todayLv } from "@/lib/format";
import { dictFor, fmtDate, fmtNum, timeLeft } from "@/components/dashboard/model";
import ProtoBar from "../ProtoBar";
import s from "../prototips.module.css";

/**
 * PROTOTYPE (branch "prototypes", never merged): the dashboard as the landing page's three parts, for Ralfs Gauja
 * #10 and Ineta Ūdra #13. Real data of the signed-in user, or of the demo account when nobody is signed in;
 * Latvian only. The status line stays on top in every variant; the variants differ in how the three parts are laid out:
 * ?v=1 three big cards, ?v=2 three full-width bands with previews, ?v=3 a 1-2-3 path with one open step,
 * ?v=4 the part that matters now large, the other two small.
 */
type Item = { key: string; title: string; href: string; right: string; sub: string };
type Part = {
  n: 1 | 2 | 3;
  verb: string;
  title: string;
  stat: number;
  statLabel: string;
  note: string | null;
  href: string;
  cta: string;
  items: Item[];
  empty: string;
};

const VARIANTS = [
  { v: "1", label: "1 · Trīs kartes" },
  { v: "2", label: "2 · Joslas" },
  { v: "3", label: "3 · Soļi" },
  { v: "4", label: "4 · Galvenais + divi" },
] as const;

export default async function ProtoDashboard({ searchParams }: { searchParams: Promise<{ v?: string; step?: string }> }) {
  // signed out (e.g. opened in another browser): show the demo account, so the prototype opens anywhere
  const signedIn = await currentUser();
  if (!signedIn) await ensureDemo();
  const user = signedIn ?? (await getUser(DEMO_USER_ID))!;
  const { v, step } = await searchParams;
  const variant = VARIANTS.find((x) => x.v === v) ?? VARIANTS[0];
  const [certs, idx] = await Promise.all([listCertificates(user.id), readCourseIndex().catch(() => null)]);
  const d = dictFor("lv").dashboard;
  const today = new Date();
  const todayIso = todayLv(today);
  const cert = pickCert(user.profile, null);
  const p = certProgress(user.profile, certs, cert, today).progress;
  const specialty = cert.specialty.trim();
  const mine = (c: Course) => !!specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty);
  const all = idx?.courses ?? [];
  const upcoming = all
    .filter((c) => c.kind === "event" && c.startDate && c.startDate >= todayIso && (mine(c) || c.allSpecialties))
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  // the specialty's own courses before ones open to everyone, then by date
  const nextCourses = [...upcoming].sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.startDate!.localeCompare(b.startDate!)).slice(0, 3);
  nextCourses.sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  const recorded = all.filter((c) => c.kind === "recorded" && (mine(c) || c.allSpecialties));

  const done = p.checks.every((c) => c.met);
  const left = p.windowEnd && (p.daysLeft ?? -1) >= 0 ? timeLeft(todayIso, p.windowEnd) : null;
  const leftText = left ? (left.years || left.months ? d.timeLeftShort(left.years, left.months) : d.daysLeftShort(p.daysLeft!)) : null;
  const waiting = certs.filter((c) => c.status === "needs_review").length;
  const confirmed = certs.filter((c) => c.status === "confirmed").length;
  const recentCerts = [...p.counted].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 3);
  const pct = p.required ? Math.min(100, (p.total / p.required) * 100) : 0;
  const tip = (n: number | null) => (n != null ? `${n > 0 ? "+" : ""}${fmtNum(n)} TIP` : "");
  const courseItem = (c: Course): Item => ({
    key: c.id,
    title: c.title,
    href: `/courses?open=${encodeURIComponent(c.id)}`,
    right: c.tip ? tip(c.tip) : "",
    sub: c.kind === "event"
      ? `${fmtDate(c.startDate, "lv")}${c.city ? ` · ${c.city === "Online" ? "Tiešsaistē" : c.city}` : ""}`
      : c.free ? "Bez maksas" : (c.price ?? "Cena nav norādīta"),
  });

  const parts: Part[] = [
    {
      n: 1,
      verb: "Saskaitiet",
      title: "Sertifikāti",
      stat: confirmed,
      statLabel: confirmed === 1 ? "apstiprināts" : "apstiprināti",
      note: waiting ? `${waiting} gaida Jūsu pārbaudi` : !profileComplete(user.profile) ? "Profilā trūkst sertifikāta termiņa" : null,
      href: "/certificates",
      cta: waiting ? "Pārbaudīt" : "Pievienot sertifikātu",
      items: recentCerts.map((c) => ({ key: c.id, title: c.title || "Bez nosaukuma", href: "/certificates", right: tip(c.points), sub: fmtDate(c.date, "lv") })),
      empty: "Vēl nav neviena sertifikāta. Augšupielādējiet PDF vai foto, un punkti tiks nolasīti automātiski.",
    },
    {
      n: 2,
      verb: "Plānojiet",
      title: "Kursi",
      stat: upcoming.length,
      statLabel: "pasākumi Jūsu specialitātei",
      note: nextCourses[0] ? `Tuvākais: ${fmtDate(nextCourses[0].startDate, "lv")}` : null,
      href: "/courses",
      cta: "Atrast kursus",
      items: nextCourses.map(courseItem),
      empty: "Tuvākajā laikā Jūsu specialitātei pasākumu nav.",
    },
    {
      n: 3,
      verb: "Papildiniet",
      title: "Tiešsaistes lekcijas",
      stat: recorded.length,
      statLabel: "ieraksti ar TIP",
      note: "Medserti pašu lekcijas: drīzumā",
      href: "/courses?tab=recorded",
      cta: "Skatīt lekcijas",
      items: recorded.slice(0, 3).map(courseItem),
      empty: "Ierakstu Jūsu specialitātei vēl nav.",
    },
  ];

  // the part to act on now: certificates to check or none yet, else courses while points are missing
  const focus: Part["n"] = waiting || confirmed === 0 ? 1 : !done ? 2 : 3;
  const open = (Number(step) as Part["n"]) || focus;

  return (
    <>
      <ProtoBar
        title="Pārskats"
        active={variant.label}
        links={[
          ...VARIANTS.map((x) => ({ href: `/prototips/parskats?v=${x.v}`, label: x.label })),
          // signed out, the current dashboard opens through the demo sign-in, as "Apskatīt demo" does
          { href: signedIn ? "/dashboard" : "/api/auth/demo", label: "Pašreizējais pārskats" },
        ]}
      />
      <main className={`container ${s.page}`}>
        {/* the status line, the same in every variant */}
        <section className={`${s.status} ${done ? s.done : ""}`} aria-labelledby="st">
          <h1 id="st" className={s.statusLine}>
            {done ? (
              <>Visas prasības izpildītas: <b>{fmtNum(p.total)} TIP</b></>
            ) : (
              <>Trūkst <b>{fmtNum(p.remaining)} TIP</b>{p.windowEnd ? ` līdz ${fmtDate(p.windowEnd, "lv")}` : ""}</>
            )}
          </h1>
          <div className={s.track} aria-hidden><div className={s.fill} style={{ width: `${pct}%` }} /></div>
          <p className={s.statusSub}>
            {fmtNum(p.total)} no {p.required} TIP{leftText ? ` · ${leftText}` : ""}
          </p>
        </section>

        {variant.v === "1" && <BigCards parts={parts} focus={focus} />}
        {variant.v === "2" && <Bands parts={parts} />}
        {variant.v === "3" && <Steps parts={parts} focus={focus} open={open} />}
        {variant.v === "4" && <Feature parts={parts} focus={focus} />}

        <p className={`muted ${s.details}`}>
          Grafiks, sadalījums pa kategorijām un visi sertifikāti: <Link href="/certificates">Sertifikāti → Detaļas</Link>
        </p>
      </main>
    </>
  );
}

function Items({ items, empty, large }: { items: Item[]; empty: string; large?: boolean }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className={`${s.items} ${large ? s.itemsLarge : ""}`}>
      {items.map((i) => (
        <li key={i.key}>
          <Link href={i.href} className={s.itemTitle}>{i.title}</Link>
          <span className={s.itemTip}>{i.right}</span>
          <span className="small muted">{i.sub}</span>
        </li>
      ))}
    </ul>
  );
}

/** v1: three equal tall cards, one big number and one button each, no lists */
function BigCards({ parts, focus }: { parts: Part[]; focus: number }) {
  return (
    <div className={s.bigCards}>
      {parts.map((pt) => (
        <section key={pt.n} className={`${s.bigCard} ${pt.n === focus ? s.bigCardFocus : ""}`} aria-labelledby={`p${pt.n}`}>
          <span className={s.numeral} aria-hidden>{pt.n}</span>
          <span className={s.kicker}>{pt.verb}</span>
          <h2 id={`p${pt.n}`} className={s.bigCardTitle}>{pt.title}</h2>
          <span className={s.huge}>{pt.stat}</span>
          <span className="muted">{pt.statLabel}</span>
          <span className={s.note}>{pt.note ?? " "}</span>
          <Link href={pt.href} className={`btn ${pt.n === focus ? "btn-primary" : ""} ${s.wideBtn}`}>{pt.cta}</Link>
        </section>
      ))}
    </div>
  );
}

/** v2: three full-width bands; left the part and its number, right a preview of what is in it */
function Bands({ parts }: { parts: Part[] }) {
  return (
    <div className={s.bands}>
      {parts.map((pt) => (
        <section key={pt.n} className={s.band} aria-labelledby={`p${pt.n}`}>
          <div className={s.bandLeft}>
            <span className={s.kicker}>{pt.n} · {pt.verb}</span>
            <h2 id={`p${pt.n}`} className={s.bandTitle}>{pt.title}</h2>
            <span><span className={s.bandStat}>{pt.stat}</span> <span className="muted">{pt.statLabel}</span></span>
            {pt.note && <span className={s.note}>{pt.note}</span>}
            <Link href={pt.href} className="btn btn-primary">{pt.cta}</Link>
          </div>
          <div className={s.bandRight}>
            <Items items={pt.items} empty={pt.empty} />
          </div>
        </section>
      ))}
    </div>
  );
}

/** v3: a 1-2-3 path; the step to act on now is marked, and one step at a time opens below */
function Steps({ parts, focus, open }: { parts: Part[]; focus: number; open: number }) {
  const cur = parts.find((pt) => pt.n === open) ?? parts[0];
  return (
    <div className={s.steps}>
      <ol className={s.path}>
        {parts.map((pt) => (
          <li key={pt.n} className={`${s.pathStep} ${pt.n === open ? s.pathOpen : ""}`}>
            <Link href={`/prototips/parskats?v=3&step=${pt.n}`} scroll={false} className={s.pathLink} aria-current={pt.n === open ? "step" : undefined}>
              <span className={`${s.dot} ${pt.n === focus ? s.dotFocus : ""}`}>{pt.n}</span>
              <span className={s.pathTitle}>{pt.verb}: {pt.title}</span>
              <span className="small muted">{pt.stat} {pt.statLabel}</span>
              {pt.n === focus && <span className={s.now}>Tagad</span>}
            </Link>
          </li>
        ))}
      </ol>
      <section className={s.stepPanel} aria-labelledby="sp">
        <div className={s.stepHead}>
          <div>
            <h2 id="sp" className={s.bandTitle}>{cur.n}. {cur.title}</h2>
            {cur.note && <span className={s.note}>{cur.note}</span>}
          </div>
          <Link href={cur.href} className="btn btn-primary">{cur.cta}</Link>
        </div>
        <Items items={cur.items} empty={cur.empty} large />
      </section>
    </div>
  );
}

/** v4: the part that matters now takes two thirds with its preview; the other two are small tiles beside it */
function Feature({ parts, focus }: { parts: Part[]; focus: number }) {
  const main = parts.find((pt) => pt.n === focus)!;
  const rest = parts.filter((pt) => pt.n !== focus);
  return (
    <div className={s.feature}>
      <section className={s.featureMain} aria-labelledby={`p${main.n}`}>
        <span className={s.kicker}>{main.n} · {main.verb} · tagad svarīgākais</span>
        <div className={s.featureHead}>
          <h2 id={`p${main.n}`} className={s.featureTitle}>{main.title}</h2>
          <span><span className={s.bandStat}>{main.stat}</span> <span className="muted">{main.statLabel}</span></span>
        </div>
        {main.note && <span className={s.note}>{main.note}</span>}
        <Items items={main.items} empty={main.empty} large />
        <Link href={main.href} className="btn btn-primary">{main.cta}</Link>
      </section>
      <div className={s.featureSide}>
        {rest.map((pt) => (
          <Link key={pt.n} href={pt.href} className={s.tile}>
            <span className={s.kicker}>{pt.n} · {pt.verb}</span>
            <span className={s.tileTitle}>{pt.title}</span>
            <span><span className={s.bandStat}>{pt.stat}</span> <span className="muted small">{pt.statLabel}</span></span>
            {pt.note && <span className="small muted">{pt.note}</span>}
            <span className={s.tileCta}>{pt.cta} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
