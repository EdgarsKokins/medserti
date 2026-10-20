"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatNumber, type Locale } from "@/lib/i18n";
import { SOURCE_LABELS, SOURCE_URLS, type Course, type CourseDetails, type CourseKind, type Lecture, type SourceStatus } from "@/lib/courses/types";
import { courseStrings } from "./strings";
import styles from "./courses.module.css";
import { DateBlock } from "@/components/dashboard/Overview";

export type CourseRow = Omit<Course, never> & { forMe: boolean };

const PAGE = 40;
const KINDS: CourseKind[] = ["event", "recorded", "ongoing"];

function addDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export default function CoursesView({
  locale,
  rows,
  fetchedAt,
  sources,
  specialty,
  remaining,
}: {
  locale: Locale;
  rows: CourseRow[];
  fetchedAt: string;
  sources: SourceStatus[];
  specialty: string;
  remaining: number;
}) {
  const s = courseStrings(locale);
  const [kind, setKind] = useState<CourseKind>("event");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(!!specialty);
  const [format, setFormat] = useState<"" | "in_person" | "online">("");
  const [city, setCity] = useState("");
  const [period, setPeriod] = useState<"30" | "90" | "all">("all");
  const [minTip, setMinTip] = useState(0);
  const [freeOnly, setFreeOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const counts = useMemo(() => {
    const c: Record<CourseKind, number> = { event: 0, recorded: 0, ongoing: 0 };
    for (const r of rows) if (!mine || r.forMe || r.allSpecialties) c[r.kind]++;
    return c;
  }, [rows, mine]);

  const cities = useMemo(() => {
    const set = new Map<string, number>();
    for (const r of rows) if (r.kind === kind && r.city && r.city !== "Online") set.set(r.city, (set.get(r.city) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [rows, kind]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const until = period === "all" ? null : addDays(Number(period));
    const list = rows.filter((r) => {
      if (r.kind !== kind) return false;
      if (mine && !(r.forMe || r.allSpecialties)) return false;
      if (needle && !`${r.title} ${r.organizer ?? ""} ${r.audience}`.toLowerCase().includes(needle)) return false;
      if (format === "online" && !(r.format === "online_live" || r.city === "Online")) return false;
      if (format === "in_person" && !(r.format === "in_person" || r.format === "hybrid")) return false;
      if (city && r.city !== city) return false;
      if (until && kind === "event" && r.startDate && r.startDate > until) return false;
      if (minTip && (r.tip ?? 0) < minTip) return false;
      if (freeOnly && !r.free) return false;
      return true;
    });
    // specialty matches first within the same day, then by TIP
    if (kind === "event") return list;
    return [...list].sort((a, b) => Number(b.forMe) - Number(a.forMe) || (b.tip ?? 0) - (a.tip ?? 0));
  }, [rows, kind, q, mine, format, city, period, minTip, freeOnly]);

  const reset = (fn: () => void) => {
    fn();
    setShown(PAGE);
  };

  return (
    <main className="container stack">
      <div className="page-head">
        <div>
          <h1>{s.title}</h1>
          <p className="muted">{s.lead}</p>
        </div>
        {remaining > 0 && <div className={styles.need}>{s.needLine(formatNumber(remaining, locale, 1))}</div>}
      </div>

      <div className={styles.tabs} role="tablist">
        {KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            className={`${styles.tab} ${kind === k ? styles.tabActive : ""}`}
            onClick={() => reset(() => (setKind(k), setCity("")))}
          >
            {s.tabs[k]} <span className={styles.count}>{counts[k]}</span>
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: -6 }}>{s.tabHint[kind]}</p>

      <div className={styles.filters}>
        <input
          className={styles.search}
          type="search"
          placeholder={s.search}
          value={q}
          onChange={(e) => reset(() => setQ(e.target.value))}
          aria-label={s.search}
        />
        <label className={styles.check} title={specialty ? s.mySpecialtyHint(specialty) : s.noSpecialty}>
          <input type="checkbox" checked={mine} disabled={!specialty} onChange={(e) => reset(() => setMine(e.target.checked))} />
          {s.mySpecialty}
        </label>
        <select aria-label={s.format} value={format} onChange={(e) => reset(() => setFormat(e.target.value as typeof format))}>
          <option value="">{s.format}: {s.any}</option>
          <option value="in_person">{s.formats.in_person}</option>
          <option value="online">{s.online}</option>
        </select>
        {cities.length > 1 && (
          <select aria-label={s.city} value={city} onChange={(e) => reset(() => setCity(e.target.value))}>
            <option value="">{s.city}: {s.any}</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {kind === "event" && (
          <select aria-label={s.period} value={period} onChange={(e) => reset(() => setPeriod(e.target.value as typeof period))}>
            <option value="all">{s.allDates}</option>
            <option value="30">{s.next30}</option>
            <option value="90">{s.next90}</option>
          </select>
        )}
        <select aria-label={s.minTip} value={minTip} onChange={(e) => reset(() => setMinTip(Number(e.target.value)))}>
          <option value={0}>{s.minTip}: {s.any}</option>
          {[2, 4, 8, 16].map((n) => (
            <option key={n} value={n}>≥ {n} TIP</option>
          ))}
        </select>
        <label className={styles.check}>
          <input type="checkbox" checked={freeOnly} onChange={(e) => reset(() => setFreeOnly(e.target.checked))} />
          {s.freeOnly}
        </label>
      </div>
      {!specialty && <div className="alert">{s.noSpecialty} <a href="/profile">→</a></div>}

      <div className="row small muted">{s.results(filtered.length)}</div>

      {filtered.length === 0 ? (
        <p className="muted">{s.none}</p>
      ) : (
        <ul className={styles.list}>
          {filtered.slice(0, shown).map((r) => (
            <CourseCard key={r.id} r={r} locale={locale} />
          ))}
        </ul>
      )}
      {filtered.length > shown && (
        <div className="row">
          <button className="btn" onClick={() => setShown((n) => n + PAGE)}>{s.showMore}</button>
        </div>
      )}

      <div className="card small muted stack" style={{ gap: 6 }}>
        <div>
          {s.updated}: {formatDate(fetchedAt.slice(0, 10), locale)}. {s.sources}:{" "}
          {sources.map((src, i) => (
            <span key={src.source}>
              {i > 0 && ", "}
              <a href={SOURCE_URLS[src.source]} target="_blank" rel="noreferrer">{SOURCE_LABELS[src.source]}</a>
              {src.ok ? ` (${src.count})` : ` (${s.sourceFailed})`}
            </span>
          ))}
        </div>
        <div>{s.disclaimer}</div>
      </div>
    </main>
  );
}

function hoursOf(minutes: number | null, locale: Locale) {
  return minutes ? formatNumber(Math.round((minutes / 60) * 10) / 10, locale, 1) : null;
}

function CourseCard({ r, locale }: { r: CourseRow; locale: Locale }) {
  const s = courseStrings(locale);
  const [open, setOpen] = useState(false);
  const date = r.startDate
    ? r.endDate
      ? `${formatDate(r.startDate, locale)} - ${formatDate(r.endDate, locale)}`
      : formatDate(r.startDate, locale)
    : r.availableUntil
      ? `${s.availableUntil} ${formatDate(r.availableUntil, locale)}`
      : null;
  const place = r.city === "Online" ? s.online : r.city;
  const venue = r.location && r.city !== "Online" && r.location !== r.city ? r.location : null;
  const hours = hoursOf(r.minutes, locale);
  const panelId = `course-${r.id.replace(/[^a-z0-9]/gi, "-")}`;

  return (
    <li className={`${styles.item} ${open ? styles.itemOpen : ""}`}>
      <button
        type="button"
        className={styles.summary}
        aria-expanded={open}
        aria-controls={panelId}
        title={open ? s.details.collapse : s.details.expand}
        onClick={() => setOpen((o) => !o)}
      >
        <DateBlock iso={r.startDate} locale={locale} fallback={r.kind === "recorded" ? s.recordingShort : s.ongoingShort} />
        <span className={styles.main}>
          <span className={styles.title}>{r.title}</span>
          <span className={`small muted ${styles.org}`}>
            {[
              date && r.kind !== "event" ? date : null,
              s.formats[r.format] + (place && r.format !== "recorded" ? ` · ${place}` : ""),
              hours ? s.hours(hours) : null,
              r.organizer,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </span>
          <span className={styles.badges}>
            {r.forMe && <span className="tag tag-accent">{s.matches}</span>}
            {!r.forMe && r.allSpecialties && <span className="tag">{s.forAll}</span>}
            {r.free && <span className="tag">{s.free}</span>}
            {r.price && !r.free && <span className="tag">{r.price}</span>}
          </span>
        </span>
        <span className={styles.tip} aria-label={r.tip != null ? `${r.tip} TIP` : "TIP ?"}>
          {r.tip != null ? `+${formatNumber(r.tip, locale, 1)}` : "?"} <span className={styles.tipUnit}>TIP</span>
        </span>
        <span className={styles.chevron} aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={panelId} className={styles.panel}>
          <ApplyBox r={r} locale={locale} date={date} />
          <dl className={styles.facts}>
            {date && <Fact k={s.details.date} v={date} />}
            <Fact k={s.details.format} v={s.formats[r.format]} />
            {(venue || place) && <Fact k={s.details.place} v={[venue, venue?.includes(place ?? "~") ? null : place].filter(Boolean).join(", ")} />}
            {hours && <Fact k={s.details.duration} v={`${s.hours(hours)} (${r.minutes} min)`} />}
            {r.organizer && <Fact k={s.details.organizer} v={r.organizer} />}
            {r.audience && <Fact k={s.details.audience} v={r.audience} />}
            {r.price && <Fact k={s.details.price} v={r.free ? s.free : r.price} />}
            {r.approvalId && <Fact k={s.details.approval} v={`${r.approvalId}${r.annexItem ? `, ${s.annex(r.annexItem)}` : ""}`} />}
          </dl>
          {r.detailRef && <Programme detailRef={r.detailRef} locale={locale} />}
        </div>
      )}
    </li>
  );
}

/** The one thing a doctor needs from an opened course: how to sign up */
function ApplyBox({ r, locale, date }: { r: CourseRow; locale: Locale; date: string | null }) {
  const a = courseStrings(locale).apply;
  const direct = r.source === "lab_courses" || r.source === "kursiarstiem" || r.source === "medicinaskursi" || (r.source === "lumpii" && !r.url.endsWith("/kursi"));
  const c = r.contact;
  return (
    <section className={styles.apply} aria-label={a.title}>
      <h3 className={styles.applyTitle}>{a.title}</h3>
      {direct ? (
        <div className="row">
          <a className="btn btn-primary" href={r.url} target="_blank" rel="noreferrer">
            {r.kind === "recorded" ? a.watch : a.online} ↗
          </a>
        </div>
      ) : c && (c.email || c.phone) ? (
        <>
          <div className="row">
            {c.email && (
              <a
                className="btn btn-primary"
                href={`mailto:${c.email}?subject=${encodeURIComponent(a.subject(r.title, date))}&body=${encodeURIComponent(a.body(r.title, date))}`}
              >
                {a.email}
              </a>
            )}
            {c.phone && (
              <a className="btn" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
                {a.call} {c.phone}
              </a>
            )}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {[r.organizer, c.name, c.email].filter(Boolean).join(" · ")}
            <br />
            {a.contactNote}
          </p>
        </>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {a.noContact}{" "}
          <a href={r.url} target="_blank" rel="noreferrer">{r.source === "lab_tip" ? a.listLink : courseStrings(locale).open} ↗</a>
        </p>
      )}
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className={styles.fact}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

const SHOW_LECTURES = 6;

function Programme({ detailRef, locale }: { detailRef: string; locale: Locale }) {
  const s = courseStrings(locale).details;
  const [state, setState] = useState<{ status: "loading" | "ok" | "error"; lectures: Lecture[] }>({ status: "loading", lectures: [] });
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/courses/details?ref=${encodeURIComponent(detailRef)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: CourseDetails) => alive && setState({ status: "ok", lectures: d.lectures }))
      .catch(() => alive && setState({ status: "error", lectures: [] }));
    return () => {
      alive = false;
    };
  }, [detailRef]);

  if (state.status === "loading") return <p className="small muted">{s.loading}</p>;
  if (state.status === "error") return <p className="small muted">{s.failed}</p>;
  if (!state.lectures.length) return <p className="small muted">{s.noProgramme}</p>;
  const list = all ? state.lectures : state.lectures.slice(0, SHOW_LECTURES);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3 className={styles.progTitle}>{s.programme}</h3>
      <ol className={styles.lectures}>
        {list.map((l, i) => (
          <li key={i}>
            <span className={styles.lectureTitle}>{l.title}</span>
            <span className="small muted">
              {[l.lecturer, l.minutes ? `${l.minutes} min` : null].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ol>
      {!all && state.lectures.length > SHOW_LECTURES && (
        <button type="button" className="btn" onClick={() => setAll(true)}>{s.more(state.lectures.length - SHOW_LECTURES)}</button>
      )}
    </div>
  );
}
