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
import { todayLv } from "@/lib/format";
import { fmtDate, fmtNum } from "@/components/dashboard/model";
import ProtoBar from "../ProtoBar";
import NotifyButton from "../NotifyButton";
import s from "../prototips.module.css";

/**
 * PROTOTYPE (branch "prototypes", never merged): the dashboard as three equal rows, for Ralfs Gauja #10 and Ineta
 * Ūdra #13: my certificates, courses for me, Medserti's own lectures (not launched yet). Each row has the same shape:
 * a title, one line on what it does for the doctor, and cards. TIP is one small badge by the greeting, not the headline.
 * Real data of the signed-in user, or of the demo account when nobody is signed in; Latvian only.
 */

const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAI", "JŪN", "JŪL", "AUG", "SEP", "OKT", "NOV", "DEC"];

/** Vocative of a Latvian first name for the greeting: Jānis → Jāni, Edgars → Edgar, Anna → Anna (prototype rule) */
function vocative(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  if (/is$/.test(first)) return first.slice(0, -1);
  if (/[sš]$/.test(first)) return first.slice(0, -1);
  return first;
}

/** "Jums noder: …": the requirement a course helps with */
const GAP_TAG: Partial<Record<Check["id"], string>> = {
  specialty: "Jūsu specialitāte",
  emergency_points: "neatliekamā palīdzība",
  emergency_practical: "neatliekamās palīdzības prakse",
  infection_control: "infekciju kontrole",
  patient_safety: "pacientu drošība",
  nursing: "māsas kompetences",
};

// no course field says "emergency care", so the prototype matches the title and audience
const EMERGENCY = /neatliek|reanim|pirm[āa] palīdz|\bNMP\b|\bBLS\b|\bALS\b|kardiopulmon/i;

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

  const name = vocative(user.profile.fullName);
  const until = p.windowEnd ? `līdz ${MONTH_SHORT[Number(p.windowEnd.slice(5, 7)) - 1].toLowerCase()} ${p.windowEnd.slice(0, 4)}` : "";

  // certificates: the ones waiting for a check first, then the newest
  const myCerts = [...certs]
    .filter((c) => c.status !== "failed")
    .sort((a, b) => Number(b.status === "needs_review") - Number(a.status === "needs_review") || (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 3);

  // courses: the one that covers what the doctor is short on gets a tag saying so; then the specialty's own, by date
  const helps = !done && open ? covering[0] ?? null : null;
  const helpsTag = helps && open ? `Jums noder: ${GAP_TAG[open.id]}` : null;
  const feed = [
    ...(helps ? [helps] : []),
    ...upcoming
      .filter((c) => c.id !== helps?.id)
      .sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.startDate!.localeCompare(b.startDate!))
      .slice(0, helps ? 3 : 4),
  ].sort((a, b) => a.startDate!.localeCompare(b.startDate!));

  return (
    <>
      <ProtoBar
        title="Pārskats"
        active="Trīs rindas"
        links={[
          { href: "/prototips/parskats", label: "Trīs rindas" },
          // signed out, the current dashboard opens through the demo sign-in, as "Apskatīt demo" does
          { href: signedIn ? "/dashboard" : "/api/auth/demo", label: "Pašreizējais pārskats" },
        ]}
      />
      <main className={`container ${s.page}`}>
        <header className={s.top}>
          <div>
            <h1 className={s.topHello}>Labdien{name ? `, ${name}` : ""}!</h1>
            {specialty && <p className="muted">{specialty}</p>}
          </div>
          <Link href="/certificates" className={`${s.tipPill} ${done ? s.tipPillDone : ""}`} title="Sertifikāti un detaļas">
            <span className={s.ring} style={{ ["--pct" as string]: `${Math.min(100, (p.total / (p.required || 1)) * 100)}%` }} aria-hidden />
            <span>
              <b>{fmtNum(p.total)} / {p.required} TIP</b>
              <span className={s.pillSub}>{done ? "Prasības izpildītas" : until}</span>
            </span>
          </Link>
        </header>

        {/* 1. my certificates */}
        <Row
          id="r1"
          title="Mani sertifikāti"
          value="Visas Jūsu apmācības vienuviet, saskaitītas un gatavas iesniegšanai."
          link={{ href: "/certificates", label: "Visi sertifikāti" }}
          badge={waiting ? `${waiting} gaida pārbaudi` : null}
        >
          <ul className={s.feed}>
            <li>
              <Link href="/certificates" className={`${s.feedCard} ${s.addCard}`}>
                <span className={s.addPlus} aria-hidden>+</span>
                <span className={s.feedTitle}>Pievienot sertifikātu</span>
                <span className={s.meta}>PDF vai foto, punkti tiks nolasīti automātiski</span>
              </Link>
            </li>
            {myCerts.map((c) => (
              <li key={c.id}>
                <Link href="/certificates" className={s.feedCard}>
                  <span className={s.feedTop}>
                    <span className={c.status === "needs_review" ? s.chipWarn : s.chipOk}>{c.status === "needs_review" ? "Jāpārbauda" : "Apstiprināts"}</span>
                    {c.points != null && <span className={s.tipSmall}>{fmtNum(c.points)} TIP</span>}
                  </span>
                  <span className={s.feedTitle}>{c.title || "Bez nosaukuma"}</span>
                  <span className={s.meta}>{[c.date ? fmtDate(c.date, "lv") : null, c.organizer].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Row>

        {/* 2. courses for me */}
        <Row
          id="r2"
          title="Kursi Jums"
          value={specialty ? `Atlasīti specialitātei: ${specialty}.` : "Atlasīti Jūsu specialitātei."}
          link={{ href: "/courses", label: "Visi kursi" }}
        >
          {feed.length ? (
            <ul className={s.feed}>
              {feed.map((c) => (
                <li key={c.id}>
                  <Link href={`/courses?open=${encodeURIComponent(c.id)}`} className={`${s.feedCard} ${c.id === helps?.id ? s.helpsCard : ""}`}>
                    <span className={s.feedTop}>
                      <DateBlock iso={c.startDate} small />
                      {c.tip != null && <span className={s.tipSmall}>{fmtNum(c.tip)} TIP</span>}
                    </span>
                    {c.id === helps?.id && helpsTag && <span className={s.helpsTag}>{helpsTag}</span>}
                    <span className={s.feedTitle}>{c.title}</span>
                    <span className={s.meta}>{c.city === "Online" ? "Tiešsaistē" : (c.city ?? "Vieta nav norādīta")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Tuvākajā laikā Jūsu specialitātei kursu nav.</p>
          )}
        </Row>

        {/* 3. Medserti's own lectures: not launched, so honest placeholders and a way to say "I want this" */}
        <Row id="r3" title="Lekcijas Medserti" value="Skatieties tepat, kad Jums ir laiks. Sertifikāts un punkti pievienosies paši." badge="Drīzumā">
          <div className={s.lectures}>
            <div className={s.lectureIntro}>
              <p>Pirmās lekcijas Jūsu specialitātei vēl top. Pastāstīsim, kad tās būs pieejamas.</p>
              <NotifyButton />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className={s.lectureTile} aria-hidden>
                <span className={s.play}>▶</span>
              </div>
            ))}
          </div>
        </Row>
      </main>
    </>
  );
}

/** One of the three rows: same shape for each, so none outranks the others */
function Row({ id, title, value, link, badge, children }: { id: string; title: string; value: string; link?: { href: string; label: string }; badge?: string | null; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={s.row}>
      <div className={s.rowHead}>
        <div>
          <h2 id={id}>{title}{badge && <span className={s.rowBadge}>{badge}</span>}</h2>
          <p className={s.rowValue}>{value}</p>
        </div>
        {link && <Link href={link.href} className={s.quiet}>{link.label} →</Link>}
      </div>
      {children}
    </section>
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
