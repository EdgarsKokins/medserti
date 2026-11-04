import Link from "next/link";
import type { Progress } from "@/lib/rules";
import type { CmeCertificate } from "@/lib/types";
import type { Course } from "@/lib/courses/types";
import type { Locale } from "@/lib/i18n";
import { certTitle, dictFor, fmtDate, fmtNum } from "./model";
import DashboardUpload from "./DashboardUpload";
import LectureNotify from "./LectureNotify";
import { IconCal, IconDoc, IconPlay } from "../PartIcons";
import styles from "./tiles.module.css";

/**
 * The dashboard's first screen (Ralfs Gauja #10, Ineta Ūdra #13, November 2026): a greeting, TIP as one small ring,
 * and three equal tiles, each with real content: the latest certificates, the next courses, Medserti's own lectures.
 */
export function Greeting({ name, p, locale, hours, href }: { name: string; p: Progress; locale: Locale; hours: boolean; href: string }) {
  const d = dictFor(locale, hours).dashboard;
  const done = p.checks.every((c) => c.met);
  const pct = p.required > 0 ? Math.min(100, (p.total / p.required) * 100) : 0;
  return (
    <header className={styles.top}>
      <h1 className={styles.hello}>{d.hello(name)}</h1>
      <Link href={href} className={`${styles.pill} ${done ? styles.pillDone : ""}`}>
        <span className={styles.ring} style={{ ["--pct" as string]: `${done ? 100 : pct}%` }} aria-hidden />
        <span>
          <b>{d.pill(fmtNum(p.total), p.required)}</b>
          <span className={styles.pillSub}>{done ? d.pillDone : p.windowEnd ? d.pillUntil(fmtDate(p.windowEnd, locale)) : ""}</span>
        </span>
      </Link>
    </header>
  );
}

export function Tiles({
  locale,
  hours,
  latest,
  waiting,
  hasCerts,
  ready,
  exportHref,
  courses,
  helpsId,
  lecturesAsked,
  readOnly,
  proto = null,
}: {
  locale: Locale;
  hours: boolean;
  /** at most three, the ones to check first */
  latest: CmeCertificate[];
  waiting: number;
  hasCerts: boolean;
  /** every requirement met: the tile's action becomes preparing the documents */
  ready: boolean;
  exportHref: string;
  /** at most three, by date */
  courses: Course[];
  /** the course that covers an unmet emergency care requirement, tagged */
  helpsId: string | null;
  lecturesAsked: boolean;
  readOnly: boolean;
  /** PROTOTYPE (branch login-panel-prototypes): whole tiles clickable, the lectures tile grey */
  proto?: "1" | "2" | null;
}) {
  const dict = dictFor(locale, hours);
  const d = dict.dashboard;
  const cs = dict.courses;
  const unit = hours ? d.hoursUnit : "TIP";
  const month = (iso: string) => new Intl.DateTimeFormat(locale === "lv" ? "lv-LV" : locale === "ru" ? "ru-RU" : "en-GB", { month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z")).replace(".", "");

  return (
    <div className={styles.tiles}>
      <section className={`${styles.tile} ${styles.blue} ${proto ? styles.click : ""}`} aria-labelledby="tile-certs">
        <span className={styles.icon}><IconDoc /></span>
        <h2 id="tile-certs" className={styles.name}>{proto ? <Link href="/certificates" className={styles.stretch}>{d.tileCerts}</Link> : d.tileCerts}</h2>
        <p className={styles.status}>{waiting ? d.certsWaiting(waiting) : ready ? d.certsReady : hasCerts ? d.certsOk : d.certsNone}</p>
        {latest.length > 0 && (
          <ul className={styles.rows}>
            {latest.map((c) => (
              <li key={c.id}>
                <Link href="/certificates" className={styles.row}>
                  <span className={c.status === "needs_review" ? styles.dotWarn : styles.dotOk} title={c.status === "needs_review" ? d.certWaiting : d.certConfirmed} />
                  <span className="sr-only">{c.status === "needs_review" ? d.certWaiting : d.certConfirmed}:</span>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{certTitle(c)}</span>
                    <span className={styles.rowSub}>{c.date ? fmtDate(c.date, locale) : d.certNoDate}</span>
                  </span>
                  {c.points != null && <span className={styles.rowTip}>{fmtNum(c.points)} {unit}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {waiting ? (
          <Link href="/certificates" className={proto ? styles.goBtn : styles.go}>{d.certsCheck} →</Link>
        ) : ready ? (
          <Link href={exportHref} className={proto ? styles.goBtn : styles.go}>{hours ? dict.exportDocs.nurseCta : dict.exportDocs.cta} →</Link>
        ) : (
          <DashboardUpload className={proto ? styles.goBtn : styles.go} readOnly={readOnly} />
        )}
      </section>

      <section className={`${styles.tile} ${styles.green} ${proto ? styles.click : ""}`} aria-labelledby="tile-courses">
        <span className={styles.icon}><IconCal /></span>
        <h2 id="tile-courses" className={styles.name}>{proto ? <Link href="/courses" className={styles.stretch}>{d.tileCourses}</Link> : d.tileCourses}</h2>
        <p className={styles.status}>{courses.length ? d.coursesNext : d.coursesNone}</p>
        {courses.length > 0 && (
          <ul className={styles.rows}>
            {courses.map((c) => (
              <li key={c.id}>
                <Link href={`/courses?open=${encodeURIComponent(c.id)}`} className={styles.row}>
                  <span className={styles.date} aria-hidden>
                    <span>{Number(c.startDate!.slice(8, 10))}</span>
                    <span>{month(c.startDate!)}</span>
                  </span>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{c.title}</span>
                    <span className={styles.rowSub}>
                      <span className="sr-only">{fmtDate(c.startDate, locale)} · </span>
                      {c.city === "Online" ? cs.online : c.city === "Latvija" ? cs.wholeLatvia : (c.city ?? d.placeNotListed)}
                      {c.id === helpsId && <span className={styles.tag} title={d.coursesHelpsHint}>{d.coursesHelps}</span>}
                    </span>
                  </span>
                  {c.tip != null && <span className={styles.rowTip}>{fmtNum(c.tip)} TIP</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/courses" className={proto ? styles.goBtn : styles.go}>{d.allCourses} →</Link>
      </section>

      {proto === "1" ? (
        <section className={`${styles.tile} ${styles.gray} ${styles.soonCentre}`} aria-labelledby="tile-lectures">
          <span className={styles.icon}><IconPlay /></span>
          <h2 id="tile-lectures" className={styles.name}>{d.tileLectures}</h2>
          <p className={styles.soonPill}><IconClock /> {d.lecturesSoon}</p>
          <div className={styles.screenGray} aria-hidden><span className={styles.playGray}>▶</span></div>
          <p className={styles.soonLine}>Lekcijas ar TIP, ko varēs skatīties tepat</p>
          <div className={styles.goRowCentre}><LectureNotify asked={lecturesAsked} readOnly={readOnly} /></div>
        </section>
      ) : proto === "2" ? (
        <section className={`${styles.tile} ${styles.gray} ${styles.soonCentre} ${styles.ribboned}`} aria-labelledby="tile-lectures">
          <span className={styles.ribbon}>{d.lecturesSoon}</span>
          <span className={styles.icon}><IconPlay /></span>
          <h2 id="tile-lectures" className={styles.name}>{d.tileLectures}</h2>
          <p className={styles.soonLine}>Lekcijas ar TIP, ko varēs skatīties tepat</p>
          <ul className={styles.ghosts} aria-hidden>
            {[70, 88, 56].map((w, i) => (
              <li key={i}><span className={styles.ghostPlay}>▶</span><span className={styles.ghostLines}><i style={{ width: `${w}%` }} /><i style={{ width: "38%" }} /></span></li>
            ))}
          </ul>
          <div className={styles.goRowCentre}><LectureNotify asked={lecturesAsked} readOnly={readOnly} /></div>
        </section>
      ) : (
      <section className={`${styles.tile} ${styles.peach}`} aria-labelledby="tile-lectures">
        <span className={styles.icon}><IconPlay /></span>
        <h2 id="tile-lectures" className={styles.name}>{d.tileLectures}</h2>
        <p className={styles.status}>{d.lecturesSoon}</p>
        <div className={styles.screen} role="img" aria-label={d.lecturesAbout} title={d.lecturesAbout}>
          <span className={styles.play} aria-hidden>▶</span>
        </div>
        <div className={styles.goRow}>
          <LectureNotify asked={lecturesAsked} readOnly={readOnly} />
        </div>
      </section>
      )}
    </div>
  );
}

const IconClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
