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
import { addMonths } from "@/lib/notifications";
import { todayLv } from "@/lib/format";
import { dictFor, fmtDate, fmtNum, missingPhrases, timeLeft } from "@/components/dashboard/model";
import { DateBlock } from "@/components/dashboard/DateBlock";
import ProtoBar from "../ProtoBar";
import s from "../prototips.module.css";

/**
 * PROTOTYPE (branch "prototypes", never merged): the dashboard cut to four blocks for Ralfs Gauja #10 and Ineta Ūdra
 * #13. Real data of the signed-in user, or of the demo account when nobody is signed in; Latvian only. ?v=1: part 3 says "Drīzumā"; ?v=2: part 3 shows the recordings
 * we already list, with Medserti's own lectures "drīzumā".
 */
export default async function ProtoDashboard({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  // signed out (e.g. opened in another browser): show the demo account, so the prototype opens anywhere
  const signedIn = await currentUser();
  if (!signedIn) await ensureDemo();
  const user = signedIn ?? (await getUser(DEMO_USER_ID))!;
  const { v } = await searchParams;
  const variant = v === "2" ? "2" : "1";
  const [certs, idx] = await Promise.all([listCertificates(user.id), readCourseIndex().catch(() => null)]);
  const dict = dictFor("lv");
  const d = dict.dashboard;
  const today = new Date();
  const todayIso = todayLv(today);
  const cert = pickCert(user.profile, null);
  const p = certProgress(user.profile, certs, cert, today).progress;
  const specialty = cert.specialty.trim();
  const mine = (c: Course) => !!specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty);
  const all = idx?.courses ?? [];
  const next = all
    .filter((c) => c.kind === "event" && c.startDate && c.startDate >= todayIso && (mine(c) || c.allSpecialties))
    .sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.startDate!.localeCompare(b.startDate!))
    .slice(0, 2)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));
  const recorded = all.filter((c) => c.kind === "recorded" && (mine(c) || c.allSpecialties)).slice(0, 2);

  const done = p.checks.every((c) => c.met);
  const left = p.windowEnd && (p.daysLeft ?? -1) >= 0 ? timeLeft(todayIso, p.windowEnd) : null;
  const leftText = left ? (left.years || left.months ? d.timeLeftShort(left.years, left.months) : d.daysLeftShort(p.daysLeft!)) : null;
  const waiting = certs.filter((c) => c.status === "needs_review").length;
  const confirmed = certs.filter((c) => c.status === "confirmed").length;

  // at most three things to do, most urgent first; each one is a button to where it gets done
  const todo: { text: string; href: string; cta: string }[] = [];
  if (!profileComplete(user.profile)) todo.push({ text: "Ievadiet, līdz kuram mēnesim derīgs sertifikāts", href: "/profile", cta: "Uz profilu" });
  if (waiting) todo.push({ text: `Pārbaudiet ${waiting} ${waiting === 1 ? "sertifikātu" : "sertifikātus"}`, href: "/certificates", cta: "Pārbaudīt" });
  if (done && p.windowEnd) todo.push({ text: `Sagatavojiet un iesniedziet dokumentus līdz ${fmtDate(addMonths(p.windowEnd, -3), "lv")}`, href: "/export", cta: "Sagatavot" });
  for (const m of missingPhrases(p, d, fmtNum)) todo.push({ text: `Savāciet vēl ${m}`, href: "/courses", cta: "Atrast kursus" });
  if (!done && p.remaining > 0 && todo.length < 3) todo.push({ text: `Savāciet vēl ${fmtNum(p.remaining)} TIP`, href: "/courses", cta: "Atrast kursus" });

  const pct = p.required ? Math.min(100, (p.total / p.required) * 100) : 0;

  return (
    <>
      <ProtoBar
        title="Pārskats"
        active={variant === "1" ? "3. daļa: Drīzumā" : "3. daļa: ieraksti"}
        links={[
          { href: "/prototips/parskats?v=1", label: "3. daļa: Drīzumā" },
          { href: "/prototips/parskats?v=2", label: "3. daļa: ieraksti" },
          // signed out, the current dashboard opens through the demo sign-in, as "Apskatīt demo" does
          { href: signedIn ? "/dashboard" : "/api/auth/demo", label: "Pašreizējais pārskats" },
        ]}
      />
      <main className={`container ${s.page}`}>
        {/* 1. one status line and one bar */}
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

        {/* 2. what to do now (Ineta #13) */}
        {todo.length > 0 && (
          <section className={s.todo} aria-labelledby="todo">
            <h2 id="todo">Jādara</h2>
            <ol className={s.todoList}>
              {todo.slice(0, 3).map((t, i) => (
                <li key={i}>
                  <span className={s.todoText}><span className={s.todoNum}>{i + 1}.</span>{t.text}</span>
                  <Link href={t.href} className={`btn ${i === 0 ? "btn-primary" : ""}`}>{t.cta}</Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* 3. the landing page's three parts */}
        <div className={s.cards}>
          <section className={s.card} aria-labelledby="c1">
            <div className={s.cardHead}><span className={s.cardNum}>1 · Saskaitiet</span></div>
            <h3 id="c1">Sertifikāti</h3>
            <span className={s.big}>{confirmed}</span>
            <span className="small muted">apstiprināti{waiting ? ` · ${waiting} gaida pārbaudi` : ""}</span>
            <div className={s.cardFoot}>
              <Link href="/certificates" className="btn btn-primary">Pievienot sertifikātu</Link>
            </div>
          </section>

          <section className={s.card} aria-labelledby="c2">
            <div className={s.cardHead}><span className={s.cardNum}>2 · Plānojiet</span></div>
            <h3 id="c2">Nākamie kursi</h3>
            {next.length ? (
              <ul className={s.mini}>
                {next.map((c) => (
                  <li key={c.id}>
                    <Link href={`/courses?open=${encodeURIComponent(c.id)}`} className={s.miniTitle}>{c.title}</Link>
                    <span className={s.miniTip}>{c.tip != null ? `+${fmtNum(c.tip)}` : ""}</span>
                    <span className="small muted">{fmtDate(c.startDate, "lv")}{c.city ? ` · ${c.city === "Online" ? "Tiešsaistē" : c.city}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">Tuvākajā laikā Jūsu specialitātei pasākumu nav.</p>
            )}
            <div className={s.cardFoot}>
              <Link href="/courses" className="btn">Visi kursi</Link>
            </div>
          </section>

          <section className={s.card} aria-labelledby="c3">
            <div className={s.cardHead}><span className={s.cardNum}>3 · Papildiniet</span></div>
            <h3 id="c3">Tiešsaistes lekcijas</h3>
            {variant === "1" ? (
              <div className={s.soon}>
                <strong>Drīzumā</strong>
                <span className="small muted">Lekcijas ar TIP, ko varēs noskatīties Medserti jebkurā laikā.</span>
              </div>
            ) : (
              <>
                <ul className={s.mini}>
                  {recorded.map((c) => (
                    <li key={c.id}>
                      <Link href={`/courses?open=${encodeURIComponent(c.id)}`} className={s.miniTitle}>{c.title}</Link>
                      <span className={s.miniTip}>{c.tip != null ? `+${fmtNum(c.tip)}` : ""}</span>
                      <span className="small muted">{c.free ? "Bez maksas" : (c.price ?? "Cena nav norādīta")}</span>
                    </li>
                  ))}
                </ul>
                <span className="small muted">Medserti pašu lekcijas: drīzumā.</span>
              </>
            )}
            <div className={s.cardFoot}>
              {variant === "2" && <Link href="/courses?tab=recorded" className="btn">Visas lekcijas</Link>}
            </div>
          </section>
        </div>

        {/* the chart, categories and recent list move to the certificates page */}
        <p className={`muted ${s.details}`}>
          Grafiks, sadalījums pa kategorijām un pēdējie sertifikāti: <Link href="/certificates">Sertifikāti → Detaļas</Link>
        </p>
      </main>
    </>
  );
}
