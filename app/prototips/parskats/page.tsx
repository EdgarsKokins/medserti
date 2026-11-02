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
import { fmtNum } from "@/components/dashboard/model";
import ProtoBar from "../ProtoBar";
import NotifyButton from "../NotifyButton";
import s from "../prototips.module.css";

/**
 * PROTOTYPE (branch "prototypes", never merged): the dashboard as three soft tiles, for Ralfs Gauja #10 and Ineta
 * Ūdra #13: certificates, courses, Medserti's own lectures (not launched yet). One word and one short status per tile;
 * TIP is one small ring by the greeting. Real data of the signed-in user, or of the demo account when nobody is
 * signed in; Latvian only.
 */

const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAI", "JŪN", "JŪL", "AUG", "SEP", "OKT", "NOV", "DEC"];

/** Vocative of a Latvian first name for the greeting: Jānis → Jāni, Edgars → Edgar, Anna → Anna (prototype rule) */
function vocative(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  if (/is$/.test(first)) return first.slice(0, -1);
  if (/[sš]$/.test(first)) return first.slice(0, -1);
  return first;
}

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

  const pct = Math.min(100, (p.total / (p.required || 1)) * 100);
  // the latest certificates, the ones waiting for a check first
  const latest = [...certs]
    .filter((c) => c.status !== "failed")
    .sort((a, b) => Number(b.status === "needs_review") - Number(a.status === "needs_review") || (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 3);
  // the next three courses for the specialty; the one covering what the doctor is short on takes the last place if it is later
  const helps = !done && open ? covering[0] ?? null : null;
  const own3 = (own.length ? own : upcoming).slice(0, 3);
  const nextCourses = (helps && !own3.some((c) => c.id === helps.id) ? [...own3.slice(0, 2), helps] : own3).sort((a, b) =>
    a.startDate!.localeCompare(b.startDate!),
  );

  return (
    <>
      <ProtoBar
        title="Pārskats"
        active="Vienkāršs"
        links={[
          { href: "/prototips/parskats", label: "Vienkāršs" },
          // signed out, the current dashboard opens through the demo sign-in, as "Apskatīt demo" does
          { href: signedIn ? "/dashboard" : "/api/auth/demo", label: "Pašreizējais pārskats" },
        ]}
      />
      <main className={`container ${s.calm}`}>
        <header className={s.top}>
          <h1 className={s.topHello}>Labdien{name ? `, ${name}` : ""}!</h1>
          <Link href="/certificates" className={`${s.tipPill} ${done ? s.tipPillDone : ""}`}>
            <span className={s.ring} style={{ ["--pct" as string]: `${pct}%` }} aria-hidden />
            <span>
              <b>{fmtNum(p.total)} / {p.required} TIP</b>
              <span className={s.pillSub}>{done ? "Izpildīts" : until}</span>
            </span>
          </Link>
        </header>

        <div className={s.tiles}>
          <section className={`${s.tile2} ${s.tBlue}`} aria-labelledby="t1">
            <span className={s.icon}><IconDoc /></span>
            <h2 id="t1" className={s.tileName}>Sertifikāti</h2>
            <span className={s.tileStatus}>{waiting ? `${waiting} jāpārbauda` : certs.length ? "Viss kārtībā ✓" : "Pievienojiet pirmo"}</span>
            {latest.length > 0 && (
              <ul className={s.rows}>
                {latest.map((c) => (
                  <li key={c.id}>
                    <Link href="/certificates" className={s.rowItem}>
                      <span className={c.status === "needs_review" ? s.dotWarn : s.dotOk} title={c.status === "needs_review" ? "Jāpārbauda" : "Apstiprināts"} />
                      <span className={s.rowText}>
                        <span className={s.rowTitle}>{c.title || "Sertifikāts"}</span>
                        <span className={s.rowSub}>{c.date ? shortDate(c.date) + " " + c.date.slice(0, 4) : "Datums nav nolasīts"}</span>
                      </span>
                      {c.points != null && <span className={s.rowTip}>{fmtNum(c.points)} TIP</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/certificates" className={s.tileGo}>{waiting ? "Pārbaudīt" : "Pievienot sertifikātu"} →</Link>
          </section>

          <section className={`${s.tile2} ${s.tGreen}`} aria-labelledby="t2">
            <span className={s.icon}><IconCal /></span>
            <h2 id="t2" className={s.tileName}>Kursi</h2>
            <span className={s.tileStatus}>{nextCourses.length ? "Tuvākie Jums" : "Drīz būs jauni"}</span>
            {nextCourses.length > 0 && (
              <ul className={s.rows}>
                {nextCourses.map((c) => (
                  <li key={c.id}>
                    <Link href={`/courses?open=${encodeURIComponent(c.id)}`} className={s.rowItem}>
                      <span className={s.rowDate}>
                        <span>{Number(c.startDate!.slice(8, 10))}</span>
                        <span>{MONTH_SHORT[Number(c.startDate!.slice(5, 7)) - 1]}</span>
                      </span>
                      <span className={s.rowText}>
                        <span className={s.rowTitle}>{c.title}</span>
                        <span className={s.rowSub}>
                          {c.city === "Online" ? "Tiešsaistē" : (c.city ?? "Vieta nav norādīta")}
                          {c.id === helps?.id && <span className={s.rowTag}>Jums noder</span>}
                        </span>
                      </span>
                      {c.tip != null && <span className={s.rowTip}>{fmtNum(c.tip)} TIP</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/courses" className={s.tileGo}>Visi kursi →</Link>
          </section>

          <section className={`${s.tile2} ${s.tPeach}`} aria-labelledby="t3">
            <span className={s.icon}><IconPlay /></span>
            <h2 id="t3" className={s.tileName}>Lekcijas</h2>
            <span className={s.tileStatus}>Drīzumā</span>
            <span className={s.visual}>
              <span className={s.screen} aria-hidden><span className={s.screenPlay}>▶</span></span>
            </span>
            <span className={s.tileGo}><NotifyButton /></span>
          </section>
        </div>
      </main>
    </>
  );
}

/** "6. nov" */
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}. ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1].toLowerCase()}`;

const svg = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const IconDoc = () => (
  <svg {...svg}><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v4h4" /><path d="M9 13l2 2 4-4" /></svg>
);
const IconCal = () => (
  <svg {...svg}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><circle cx="12" cy="15" r="1.4" fill="currentColor" /></svg>
);
const IconPlay = () => (
  <svg {...svg}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10.5 9.5v5l4-2.5z" fill="currentColor" /></svg>
);
