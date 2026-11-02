import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { getUser, listCertificates } from "@/lib/db";
import { DEMO_USER_ID, ensureDemo } from "@/lib/demo";
import { certProgress } from "@/lib/certAssign";
import { pickCert } from "@/lib/profileCerts";
import { matchesSpecialty } from "@/lib/parse";
import { readCourseIndex } from "@/lib/courses/store";
import type { Course } from "@/lib/courses/types";
import type { Check } from "@/lib/rules";
import { addMonths } from "@/lib/notifications";
import { todayLv } from "@/lib/format";
import { fmtDate, fmtNum } from "@/components/dashboard/model";
import ProtoBar from "../ProtoBar";
import NotifyButton from "../NotifyButton";
import s from "../prototips.module.css";

/**
 * PROTOTYPE (branch "prototypes", never merged): the dashboard as one next step plus a learning feed, for Ralfs Gauja
 * #10 and Ineta Ūdra #13. One sentence on where the doctor stands, the one thing worth doing next, then courses picked
 * for them and Medserti's own lectures (not launched yet). Numbers kept to one slim strip.
 * Real data of the signed-in user, or of the demo account when nobody is signed in; Latvian only.
 */

// dative month names: "līdz 2028. gada novembrim"
const MONTH_DAT = ["janvārim", "februārim", "martam", "aprīlim", "maijam", "jūnijam", "jūlijam", "augustam", "septembrim", "oktobrim", "novembrim", "decembrim"];
const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAI", "JŪN", "JŪL", "AUG", "SEP", "OKT", "NOV", "DEC"];

/** Vocative of a Latvian first name for the greeting: Jānis → Jāni, Edgars → Edgar, Anna → Anna (prototype rule) */
function vocative(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  if (/is$/.test(first)) return first.slice(0, -1);
  if (/[sš]$/.test(first)) return first.slice(0, -1);
  return first;
}

/** "Jums vēl trūkst 4 TIP …": where the doctor is short */
const GAP_WHERE: Partial<Record<Check["id"], string>> = {
  specialty: "savā specialitātē",
  emergency_points: "neatliekamajā palīdzībā",
  emergency_practical: "neatliekamās palīdzības praktiskajās nodarbībās",
  infection_control: "infekciju kontrolē",
  patient_safety: "pacientu drošībā",
  nursing: "māsas kompetences tēmās",
};

// no course field says "emergency care", so the prototype matches the title and audience
const EMERGENCY = /neatliek|reanim|pirm[āa] palīdz|\bNMP\b|\bBLS\b|\bALS\b|kardiopulmon/i;

type Next = { lead: string; why: string | null; course: Course | null; href: string; cta: string };

export default async function ProtoDashboard() {
  // signed out (e.g. opened in another browser): show the demo account, so the prototype opens anywhere
  const signedIn = await currentUser();
  if (!signedIn) await ensureDemo();
  const user = signedIn ?? (await getUser(DEMO_USER_ID))!;
  const [certs, idx] = await Promise.all([listCertificates(user.id), readCourseIndex().catch(() => null)]);
  const today = new Date();
  const todayIso = todayLv(today);
  const cert = pickCert(user.profile, null);
  const p = certProgress(user.profile, certs, cert, today).progress;
  const specialty = cert.specialty.trim();
  const mine = (c: Course) => !!specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty);
  const upcoming = (idx?.courses ?? [])
    .filter((c) => c.kind === "event" && c.startDate && c.startDate >= todayIso && (mine(c) || c.allSpecialties))
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));

  const done = p.checks.every((c) => c.met);
  const waiting = certs.filter((c) => c.status === "needs_review").length;
  const gap = (c: Check) => Math.max(0, c.need - c.have);
  const open = p.checks.filter((c) => !c.met && c.id !== "total").sort((a, b) => gap(b) - gap(a))[0];
  const own = upcoming.filter(mine);
  const covering =
    open?.id === "specialty" ? own
    : open?.id === "emergency_points" || open?.id === "emergency_practical" ? upcoming.filter((c) => EMERGENCY.test(`${c.title} ${c.audience}`))
    : own.length ? own : upcoming;

  const end = p.windowEnd ? new Date(p.windowEnd + "T00:00:00Z") : null;
  const by = end ? ` līdz ${end.getUTCFullYear()}. gada ${MONTH_DAT[end.getUTCMonth()]}` : "";
  const name = vocative(user.profile.fullName);

  // the one thing worth doing next, most urgent first
  let next: Next;
  if (certs.length === 0) {
    next = { lead: "Sāciet ar sertifikātiem, kas Jums jau ir.", why: "Augšupielādējiet PDF vai foto, un punkti tiks saskaitīti automātiski.", course: null, href: "/certificates", cta: "Pievienot sertifikātus" };
  } else if (waiting) {
    next = {
      lead: `Vispirms pārbaudiet ${waiting} ${waiting === 1 ? "sertifikātu" : "sertifikātus"}, ko augšupielādējāt.`,
      why: "Tas aizņem minūti, un tad punkti tiks ieskaitīti.",
      course: null,
      href: "/certificates",
      cta: "Pārbaudīt",
    };
  } else if (done) {
    next = {
      lead: "Visas prasības ir izpildītas.",
      why: p.windowEnd ? `Sagatavojiet un iesniedziet dokumentus līdz ${fmtDate(addMonths(p.windowEnd, -3), "lv")}.` : "Sagatavojiet dokumentus resertifikācijai.",
      course: null,
      href: "/export",
      cta: "Sagatavot dokumentus",
    };
  } else {
    const c = covering[0] ?? upcoming[0] ?? null;
    const short = open ? gap(open) : 0;
    const why = open && c && covering.includes(c)
      ? `Jums vēl trūkst ${fmtNum(short)} ${open.id === "emergency_practical" ? "stundu" : "TIP"} ${GAP_WHERE[open.id]}, un šis kurss ${c.tip != null && c.tip >= short ? "tos sedz" : "palīdz tos savākt"}.`
      : c && mine(c) ? "Tuvākais kurss Jūsu specialitātē." : null;
    next = c
      ? { lead: "Vislabāk sākt ar šo kursu.", why, course: c, href: `/courses?open=${encodeURIComponent(c.id)}`, cta: "Skatīt kursu" }
      : { lead: "Tuvākajā laikā Jums piemērotu kursu nav.", why: "Paziņosim, tiklīdz parādīsies jauni.", course: null, href: "/courses", cta: "Visi kursi" };
  }

  const feed = upcoming
    .filter((c) => c.id !== next.course?.id)
    .sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.startDate!.localeCompare(b.startDate!))
    .slice(0, 4)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  const pct = p.required ? Math.min(100, (p.total / p.required) * 100) : 0;

  return (
    <>
      <ProtoBar
        title="Pārskats"
        active="Nākamais solis"
        links={[
          { href: "/prototips/parskats", label: "Nākamais solis" },
          // signed out, the current dashboard opens through the demo sign-in, as "Apskatīt demo" does
          { href: signedIn ? "/dashboard" : "/api/auth/demo", label: "Pašreizējais pārskats" },
        ]}
      />
      <main className={`container ${s.page}`}>
        {/* 1. where you stand, in one sentence, and the one next step */}
        <section className={s.hero} aria-labelledby="hi">
          <p className={s.heroHello}>Labdien{name ? `, ${name}` : ""}!</p>
          <h1 id="hi" className={s.heroLine}>
            {done ? (
              <>Jums ir savākti visi vajadzīgie punkti.</>
            ) : (
              <>Jums vēl jāsavāc <span className={s.heroNum}>{fmtNum(p.remaining)} TIP</span>{by}.</>
            )}
          </h1>

          <div className={s.next}>
            <p className={s.nextLead}>{next.lead}</p>
            {next.course ? (
              <Link href={next.href} className={s.nextCourse}>
                <DateBlock iso={next.course.startDate} />
                <span className={s.nextBody}>
                  <span className={s.nextTitle}>{next.course.title}</span>
                  <span className={s.meta}>
                    {[next.course.city === "Online" ? "Tiešsaistē" : next.course.city, next.course.time, next.course.organizer].filter(Boolean).join(" · ")}
                  </span>
                  {next.why && <span className={s.nextWhy}>{next.why}</span>}
                </span>
                {next.course.tip != null && <span className={s.tipBadge}>+{fmtNum(next.course.tip)} TIP</span>}
              </Link>
            ) : (
              next.why && <p className={s.nextWhy}>{next.why}</p>
            )}
            <div className={s.nextActions}>
              <Link href={next.href} className="btn btn-primary">{next.cta}</Link>
              {next.course && <Link href="/courses" className={s.quiet}>Citi kursi →</Link>}
            </div>
          </div>

          <div className={s.strip}>
            <span className={s.stripTrack} aria-hidden><span style={{ width: `${pct}%` }} /></span>
            <span className={s.stripText}>
              {fmtNum(p.total)} no {p.required} TIP · <Link href="/certificates">Sertifikāti un detaļas</Link>
            </span>
          </div>
        </section>

        {/* 2. courses picked for this doctor */}
        <section aria-labelledby="feed1" className={s.feedSection}>
          <div className={s.feedHead}>
            <h2 id="feed1">{specialty ? `${specialty}: tuvākie kursi` : "Tuvākie kursi"}</h2>
            <Link href="/courses" className={s.quiet}>Visi kursi →</Link>
          </div>
          {feed.length ? (
            <ul className={s.feed}>
              {feed.map((c) => (
                <li key={c.id}>
                  <Link href={`/courses?open=${encodeURIComponent(c.id)}`} className={s.feedCard}>
                    <span className={s.feedTop}>
                      <DateBlock iso={c.startDate} small />
                      {c.tip != null && <span className={s.tipBadge}>+{fmtNum(c.tip)} TIP</span>}
                    </span>
                    <span className={s.feedTitle}>{c.title}</span>
                    <span className={s.meta}>{c.city === "Online" ? "Tiešsaistē" : (c.city ?? "Vieta nav norādīta")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Tuvākajā laikā Jūsu specialitātei kursu nav.</p>
          )}
        </section>

        {/* 3. Medserti's own lectures: not launched, so honest placeholders and a way to say "I want this" */}
        <section aria-labelledby="feed2" className={s.feedSection}>
          <div className={s.feedHead}>
            <h2 id="feed2">Skatieties Medserti</h2>
            <span className={s.soonTag}>Drīzumā</span>
          </div>
          <div className={s.lectures}>
            <div className={s.lectureIntro}>
              <p>Lekcijas ar TIP, ko varēsiet noskatīties tepat, kad Jums ir laiks. Sertifikāts un punkti pievienosies paši.</p>
              <NotifyButton />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className={s.lectureTile} aria-hidden>
                <span className={s.play}>▶</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function DateBlock({ iso, small }: { iso: string | null | undefined; small?: boolean }) {
  if (!iso) return null;
  const [, m, d] = iso.split("-").map(Number);
  return (
    <span className={`${s.date} ${small ? s.dateSmall : ""}`}>
      <span className={s.dateDay}>{d}</span>
      <span className={s.dateMonth}>{MONTH_SHORT[m - 1]}</span>
    </span>
  );
}
