import Link from "next/link";
import type { Progress } from "@/lib/rules";
import { t, type Locale } from "@/lib/i18n";
import type { RuleBasis } from "@/lib/rules";
import type { Course } from "@/lib/courses/types";
import { courseStrings } from "@/components/courses/strings";
import { specialtyLabel } from "@/lib/specialties";
import { dayMs, dictFor, fmtDate, fmtNum, type Headline } from "./model";
import styles from "./overview.module.css";

const toneClass = { ok: styles.toneOk, warn: styles.toneWarn, bad: styles.toneBad, neutral: "" };

/** Big number, time left and a single band comparing points collected with time elapsed */
/**
 * nurse: the window is a register entry, not a certificate (Medical Treatment Law Section 26(2)), counted in academic hours.
 * basis: why the target is not the point 51 number, shown as one line
 */
export function Hero({
  p,
  h,
  specialty,
  nurse = false,
  basis = null,
  locale,
  today,
}: {
  p: Progress;
  h: Headline;
  specialty: string;
  nurse?: boolean;
  basis?: RuleBasis | null;
  locale: Locale;
  today: Date;
}) {
  const dict = dictFor(locale, nurse);
  const d = dict.dashboard;
  const n = (v: number) => fmtNum(v, locale);
  const pointsPct = p.required > 0 ? Math.min(100, (p.total / p.required) * 100) : 0;
  let timePct: number | null = null;
  if (p.windowStart && p.windowEnd) {
    const a = dayMs(p.windowStart);
    const b = dayMs(p.windowEnd);
    timePct = Math.max(0, Math.min(100, ((today.getTime() - a) / (b - a)) * 100));
  }
  const behind = timePct != null && pointsPct + 5 < timePct;
  // requirements other than the total that are still open, as plain phrases ("2 TIP of emergency care training")
  const missing = p.checks
    .filter((c) => !c.met && c.id !== "total")
    .map((c) => {
      const gap = Math.max(0, c.need - c.have);
      if (c.id === "specialty") return d.missingSpecialty(n(gap));
      if (c.id === "emergency_points") return d.missingEmergencyPoints(n(gap));
      if (c.id === "infection_control") return d.missingInfection(n(gap));
      if (c.id === "patient_safety") return d.missingPatientSafety(n(gap));
      if (c.id === "nursing") return d.missingNursing(n(gap));
      return d.missingEmergencyHours(n(gap), Math.ceil(gap));
    });
  // listed specialties show in the UI language; unlisted free text as typed
  const eyebrow = [specialtyLabel(specialty, locale), p.windowEnd ? (nurse ? d.registrationUntilShort : d.validUntilShort)(fmtDate(p.windowEnd, locale)) : null].filter(Boolean).join(" · ");

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <div className={styles.heroRow}>
        <h1 id="hero-title" className={styles.bigLine}>
          <span className={styles.big}>{n(p.total)}</span>
          <span className={styles.of}>{d.ofRequired(p.required)}</span>
        </h1>
        {p.daysLeft != null && (
          <div className={styles.heroSide}>
            {p.daysLeft >= 0 ? (
              <>
                <div className={styles.daysLeft}>{d.daysLeftShort(p.daysLeft)}</div>
                {p.perMonthNeeded != null && p.remaining > 0 && (
                  <div className={behind ? styles.pace : "muted"}>{d.paceShort(n(p.perMonthNeeded))}</div>
                )}
              </>
            ) : (
              <div className={styles.toneBad}>
                {d.expiredOn} {fmtDate(p.windowEnd, locale)}
              </div>
            )}
          </div>
        )}
      </div>

      <p className={styles.status}>
        {p.remaining > 0
          ? d.statusRemaining(n(p.remaining), p.windowEnd && (p.daysLeft ?? 0) >= 0 ? fmtDate(p.windowEnd, locale) : null)
          : d.statusDone}{" "}
      </p>
      {/* one requirement per chip, so a phrase never breaks across two cramped lines */}
      {missing.length > 0 && (
        <p className={styles.missing}>
          <span className={styles.missingLabel}>{d.statusMissing}</span>
          {missing.map((m) => (
            <span key={m} className={styles.missingItem}>{m}</span>
          ))}
        </p>
      )}

      {timePct != null && p.windowStart && p.windowEnd ? (
        <div className={styles.band} role="img" aria-label={`${d.collected(Math.round(pointsPct))}, ${d.timeElapsed(Math.round(timePct))}`}>
          <div className={styles.track}>
            <div className={`${styles.fill} ${pointsPct > 0 ? styles.fillSome : ""}`} style={{ width: `${pointsPct}%` }} />
            <div className={styles.todayMark} style={{ left: `${timePct}%` }}>
              <span className={styles.todayLabel}>{d.today}</span>
            </div>
          </div>
          <div className={styles.bandLabels}>
            <span>{p.windowStart.slice(0, 4)}</span>
            <span className={styles.bandLegend}>
              <i className={styles.keyFill} /> {d.collected(Math.round(pointsPct))}
              <i className={styles.keyTime} /> {d.timeElapsed(Math.round(timePct))}
            </span>
            <span>{p.windowEnd.slice(0, 4)}</span>
          </div>
        </div>
      ) : (
        <div className={`bar ${styles.plainBar}`}>
          <span style={{ width: `${pointsPct}%` }} />
        </div>
      )}

      {h.message && <p className={`${styles.message} ${toneClass[h.tone]}`}>{h.message}</p>}
      {basis && <p className={`small muted ${styles.basis}`}>{basis === "nurse" ? dict.profile.nurseRule : dict.profile.functionalTransition}</p>}
    </section>
  );
}

/** Requirement checks as a ruled checklist */
export function Requirements({ p, locale, hours = false }: { p: Progress; locale: Locale; hours?: boolean }) {
  const dict = dictFor(locale, hours);
  return (
    <section aria-labelledby="req-title">
      <h2 id="req-title">{hours ? dict.dashboard.requirementsNurse : dict.dashboard.requirements}</h2>
      <ul className={styles.checklist}>
        {p.checks.map((c) => (
          <li key={c.id} className={c.met ? styles.met : ""}>
            <span className={styles.mark} aria-hidden>{c.met ? "✓" : ""}</span>
            <span className={styles.checkLabel}>
              {dict.checks[c.id]}
              <span className="sr-only">: {c.met ? dict.dashboard.met : dict.dashboard.notMet}</span>
            </span>
            <span className={styles.checkVal}>
              {fmtNum(c.have, locale)}
              <span className="muted"> / {fmtNum(c.need, locale)}</span>
            </span>
          </li>
        ))}
      </ul>
      {/* Reg. 630 point 26.3 topics, from 01 Jan 2027: they count by the topic set on each certificate */}
      {hours && p.checks.some((c) => c.id === "nursing") && <p className="small muted">{dict.dashboard.nurseTopics}</p>}
    </section>
  );
}

export const MONTHS_SHORT: Record<Locale, string[]> = {
  lv: ["JAN", "FEB", "MAR", "APR", "MAI", "JŪN", "JŪL", "AUG", "SEP", "OKT", "NOV", "DEC"],
  en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
  ru: ["ЯНВ", "ФЕВ", "МАР", "АПР", "МАЙ", "ИЮН", "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК"],
};

/** Calendar-style date block used by course rows */
export function DateBlock({ iso, locale, fallback }: { iso: string | null; locale: Locale; fallback: string }) {
  if (!iso) {
    return (
      <span className={styles.dateBlock}>
        <span className={styles.dateDay}>∞</span>
        <span className={styles.dateMon}>{fallback}</span>
      </span>
    );
  }
  return (
    <span className={styles.dateBlock}>
      <span className={styles.dateDay}>{iso.slice(8, 10)}</span>
      <span className={styles.dateMon}>{MONTHS_SHORT[locale][Number(iso.slice(5, 7)) - 1]}</span>
    </span>
  );
}

/** Next upcoming events that match the specialty (or are for all specialties) */
export function CoursePicks({ courses, locale }: { courses: Course[]; locale: Locale }) {
  const d = t(locale).dashboard;
  const cs = courseStrings(locale);
  return (
    <section aria-labelledby="picks-title">
      <div className={styles.sectionHead}>
        <h2 id="picks-title">{d.coursesForYou}</h2>
        <Link href="/courses" className={`small ${styles.headLink}`}>{d.allCourses} →</Link>
      </div>
      {courses.length === 0 ? (
        <p className="muted small">{d.noCourses}</p>
      ) : (
        <ul className={styles.picks}>
          {courses.map((c) => (
            <li key={c.id}>
              <DateBlock iso={c.startDate} locale={locale} fallback={d.recording} />
              <span className={styles.pickMain}>
                <Link href={`/courses?open=${encodeURIComponent(c.id)}`} className={styles.pickTitle}>{c.title}</Link>
                <span className="small muted">
                  {[c.city === "Online" ? cs.online : c.city === "Latvija" ? cs.wholeLatvia : c.city, c.minutes ? cs.hours(fmtNum(c.minutes / 60, locale)) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {c.tip != null && <span className={styles.pickTip}>+{fmtNum(c.tip, locale)} TIP</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
