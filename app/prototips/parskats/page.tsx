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
import { dictFor, fmtDate, fmtNum, timeLeft } from "@/components/dashboard/model";
import ProtoBar from "../ProtoBar";
import NotifyButton from "../NotifyButton";
import s from "../prototips.module.css";

/**
 * PROTOTYPE (branch "prototypes", never merged): the dashboard as "your plan" for Ralfs Gauja #10 and Ineta Ūdra #13.
 * The doctor by name, how far each requirement is, and three cards that each say what they do for this doctor:
 * certificates counted, courses that close the gap they are short on, lectures watched in Medserti (not launched yet).
 * Real data of the signed-in user, or of the demo account when nobody is signed in; Latvian only.
 */
const CHECK_LABEL: Record<Check["id"], string> = {
  total: "Kopā",
  specialty: "Savā specialitātē",
  emergency_points: "Neatliekamā palīdzība",
  emergency_practical: "NMP praktiskās stundas",
  infection_control: "Infekciju kontrole",
  patient_safety: "Pacientu drošība",
  nursing: "Māsas kompetences",
};

/** "Jums trūkst 12 TIP …": where the doctor is short */
const GAP_WHERE: Record<Check["id"], string> = {
  total: "",
  specialty: "savā specialitātē",
  emergency_points: "neatliekamajā palīdzībā",
  emergency_practical: "NMP praktiskajās nodarbībās",
  infection_control: "infekciju kontrolē",
  patient_safety: "pacientu drošībā",
  nursing: "māsas kompetences tēmās",
};

// no course field says "emergency care", so the prototype matches the title and audience
const EMERGENCY = /neatliek|reanim|pirm[āa] palīdz|\bNMP\b|\bBLS\b|\bALS\b|kardiopulmon/i;

export default async function ProtoDashboard() {
  // signed out (e.g. opened in another browser): show the demo account, so the prototype opens anywhere
  const signedIn = await currentUser();
  if (!signedIn) await ensureDemo();
  const user = signedIn ?? (await getUser(DEMO_USER_ID))!;
  const [certs, idx] = await Promise.all([listCertificates(user.id), readCourseIndex().catch(() => null)]);
  const d = dictFor("lv").dashboard;
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
  const left = p.windowEnd && (p.daysLeft ?? -1) >= 0 ? timeLeft(todayIso, p.windowEnd) : null;
  const leftText = left ? (left.years || left.months ? d.timeLeftShort(left.years, left.months) : d.daysLeftShort(p.daysLeft!)) : null;
  const waiting = certs.filter((c) => c.status === "needs_review").length;
  const confirmed = certs.filter((c) => c.status === "confirmed").length;
  const gap = (c: Check) => Math.max(0, c.need - c.have);

  // card 2 points at the requirement the doctor is short on, and the courses that cover it
  const open = p.checks.filter((c) => !c.met && c.id !== "total").sort((a, b) => gap(b) - gap(a))[0];
  const covering =
    open?.id === "specialty" ? upcoming.filter(mine)
    : open?.id === "emergency_points" || open?.id === "emergency_practical" ? upcoming.filter((c) => EMERGENCY.test(`${c.title} ${c.audience}`))
    : upcoming;
  const gapLine = open
    ? `Jums trūkst ${fmtNum(gap(open))} ${open.id === "emergency_practical" ? "stundu" : "TIP"} ${GAP_WHERE[open.id]}`
    : !done ? `Jums trūkst ${fmtNum(p.remaining)} TIP` : null;
  const soonest = covering[0];

  // the card to act on now: certificates to check or none yet, else courses while anything is missing
  const focus = waiting || confirmed === 0 ? 1 : !done ? 2 : 3;
  const pct = (have: number, need: number) => (need ? Math.min(100, (have / need) * 100) : 0);

  return (
    <>
      <ProtoBar
        title="Pārskats"
        active="Jūsu plāns"
        links={[
          { href: "/prototips/parskats", label: "Jūsu plāns" },
          // signed out, the current dashboard opens through the demo sign-in, as "Apskatīt demo" does
          { href: signedIn ? "/dashboard" : "/api/auth/demo", label: "Pašreizējais pārskats" },
        ]}
      />
      <main className={`container ${s.page}`}>
        {/* 1. who, how far, and each requirement */}
        <section className={`${s.hello} ${done ? s.done : ""}`} aria-labelledby="hi">
          <div className={s.helloTop}>
            <div>
              <p className={s.greet}>Labdien, {user.profile.fullName || "kolēģi"}</p>
              {specialty && <p className="muted">{specialty}</p>}
            </div>
            {leftText && p.windowEnd && <p className={s.deadline}>Sertifikāts derīgs līdz {fmtDate(p.windowEnd, "lv")}<br /><span className="muted">{leftText}</span></p>}
          </div>
          <h1 id="hi" className={s.statusLine}>
            {done ? <>Visas prasības izpildītas: <b>{fmtNum(p.total)} TIP</b></> : <>Trūkst <b>{fmtNum(p.remaining)} TIP</b></>}
          </h1>
          <ul className={s.reqs}>
            {p.checks.map((c) => (
              <li key={c.id} className={c.met ? s.reqMet : ""}>
                <span className={s.reqLabel}>{CHECK_LABEL[c.id]}</span>
                <span className={s.reqNum}>
                  {c.met ? "✓ " : ""}{fmtNum(c.have)} / {fmtNum(c.need)} {c.id === "emergency_practical" ? "st." : "TIP"}
                </span>
                <span className={s.reqTrack} aria-hidden><span style={{ width: `${pct(c.have, c.need)}%` }} /></span>
              </li>
            ))}
          </ul>
        </section>

        {/* 2. three things Medserti does for this doctor, in order */}
        <ol className={s.plan}>
          <li className={`${s.planCard} ${focus === 1 ? s.planFocus : ""}`}>
            <div className={s.planHead}><span className={s.planNum}>1</span>{focus === 1 && <span className={s.now}>Tagad</span>}</div>
            <h2>Saskaitiet</h2>
            <p className={s.planValue}>Neviens punkts nepazūd: katrs sertifikāts saskaitīts un gatavs iesniegšanai.</p>
            <p className={s.planStat}><b>{fmtNum(p.total)} TIP</b> saskaitīti</p>
            <p className={s.planSub}>{waiting ? `${waiting} ${waiting === 1 ? "sertifikāts gaida" : "sertifikāti gaida"} Jūsu pārbaudi` : `${confirmed} sertifikāti apstiprināti`}</p>
            <Link href="/certificates" className={`btn ${focus === 1 ? "btn-primary" : ""} ${s.planBtn}`}>{waiting ? "Pārbaudīt" : "Pievienot sertifikātu"}</Link>
          </li>

          <li className={`${s.planCard} ${focus === 2 ? s.planFocus : ""}`}>
            <div className={s.planHead}><span className={s.planNum}>2</span>{focus === 2 && <span className={s.now}>Tagad</span>}</div>
            <h2>Plānojiet</h2>
            <p className={s.planValue}>Tikai kursi, kas der tieši Jums, un tie, kas palīdz aizpildīt trūkstošo.</p>
            {gapLine ? (
              <p className={s.planStat}>{gapLine}. Šim der <b>{covering.length} {covering.length === 1 ? "kurss" : "kursi"}</b></p>
            ) : (
              <p className={s.planStat}><b>{upcoming.length}</b> kursi Jūsu specialitātei</p>
            )}
            {soonest ? (
              <Link href={`/courses?open=${encodeURIComponent(soonest.id)}`} className={s.planNext}>
                <span className="small muted">Tuvākais · {fmtDate(soonest.startDate, "lv")}{soonest.city ? ` · ${soonest.city === "Online" ? "Tiešsaistē" : soonest.city}` : ""}{soonest.tip ? ` · +${fmtNum(soonest.tip)} TIP` : ""}</span>
                <span className={s.planNextTitle}>{soonest.title}</span>
              </Link>
            ) : (
              <p className={s.planSub}>Tuvākajā laikā šādu kursu nav.</p>
            )}
            <Link href="/courses" className={`btn ${focus === 2 ? "btn-primary" : ""} ${s.planBtn}`}>Atrast kursus</Link>
          </li>

          <li className={`${s.planCard} ${focus === 3 ? s.planFocus : ""}`}>
            <div className={s.planHead}><span className={s.planNum}>3</span><span className={s.soonTag}>Drīzumā</span></div>
            <h2>Mācieties Medserti</h2>
            <p className={s.planValue}>Lekcijas ar TIP, ko skatāties tepat. Sertifikāts un punkti pievienojas paši.</p>
            <div className={s.planSoon}>
              <span className="small muted">Kad būs pieejamas pirmās lekcijas Jūsu specialitātei, nosūtīsim e-pastu.</span>
            </div>
            <span className={s.planBtn}><NotifyButton /></span>
          </li>
        </ol>

        <p className={`muted ${s.details}`}>
          Grafiks, sadalījums pa kategorijām un visi sertifikāti: <Link href="/certificates">Sertifikāti → Detaļas</Link>
        </p>
      </main>
    </>
  );
}
