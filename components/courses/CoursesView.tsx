"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { swapUnit, type Locale } from "@/lib/locale";
import { freeForFilter, LMA_REGISTER_URL, SOURCE_URLS, type Course, type CourseDetails, type CourseExtra, type CourseKind, type Lecture, type SourceStatus } from "@/lib/courses/types";
import { useDict } from "@/components/i18n/DictProvider";
import AbroadEstimator from "./AbroadEstimate";
import type { Dict } from "@/lib/i18n/en";
import styles from "./courses.module.css";
import { DateBlock } from "@/components/dashboard/DateBlock";
import { specialtyLabel } from "@/lib/specialties";
import { formatDate, formatNumber, round1 } from "@/lib/format";

type CourseStrings = Dict["courses"];

/** Email to an organiser: always Latvian, whatever the UI language, since the organisers are Latvian. `date` is an LV date. */
const applyEmail = {
  subject: (title: string, date: string | null) => `Pieteikšanās: ${title}${date ? ` (${date})` : ""}`,
  body: (title: string, date: string | null) =>
    `Labdien!\n\nVēlos pieteikties pasākumam „${title}”${date ? ` (${date})` : ""}.\n\nVārds, uzvārds:\nTālrunis:\n\nPaldies!`,
};

/** What the list renders and filters on; the rest (CourseExtra) loads when a course is opened */
export type CourseRow = Omit<Course, keyof CourseExtra> & { forMe: boolean };

/** One request per course per page view, shared by every card that opens it; a failed load is retried on the next open */
const extras = new Map<string, Promise<CourseExtra | null>>();
function loadExtra(id: string): Promise<CourseExtra | null> {
  let p = extras.get(id);
  if (!p) {
    p = fetch(`/api/courses/item?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<CourseExtra>) : null))
      .catch(() => null);
    extras.set(id, p);
    p.then((v) => v || extras.delete(id));
  }
  return p;
}

const PAGE = 40;
const KINDS: CourseKind[] = ["event", "recorded", "ongoing"];

function addDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** "Latvija" in the source data means the whole country, not a city */
const WHOLE_LATVIA = "Latvija";
const cityLabel = (city: string, s: CourseStrings) => (city === WHOLE_LATVIA ? s.wholeLatvia : city);

export default function CoursesView({
  locale,
  rows,
  fetchedAt,
  sources,
  specialty,
  remaining,
  hoursUnit = null,
  nurse = false,
  openId = null,
  openExtra = null,
  initialKind = null,
}: {
  locale: Locale;
  rows: CourseRow[];
  fetchedAt: string;
  sources: SourceStatus[];
  specialty: string;
  remaining: number;
  /** nurses: the unit their remaining amount is counted in ("akad. st."), null for TIP */
  hoursUnit?: string | null;
  /** nurses: "for me" = courses for nurses (rows' forMe), on by default, and doctor-wide "all specialties" rows left out */
  nurse?: boolean;
  /** course to show opened and scrolled into view (/courses?open=<id>, from the dashboard picks) */
  openId?: string | null;
  /** the linked course's details, sent with the page so it opens without a request */
  openExtra?: CourseExtra | null;
  /** tab to start on (/courses?tab=recorded, from the overview's online block); a linked course's own tab wins */
  initialKind?: CourseKind | null;
}) {
  const s = useDict().courses;
  const target = useMemo(() => (openId ? rows.find((r) => r.id === openId) ?? null : null), [rows, openId]);
  const [kind, setKind] = useState<CourseKind>(target?.kind ?? initialKind ?? "event");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(nurse ? !target || target.forMe : !!specialty && (!target || target.forMe || target.allSpecialties));
  const fits = (r: CourseRow) => r.forMe || (!nurse && r.allSpecialties);
  const [format, setFormat] = useState<"" | "in_person" | "online">("");
  const [city, setCity] = useState("");
  const [period, setPeriod] = useState<"30" | "90" | "all">("all");
  const [minTip, setMinTip] = useState(0);
  const [freeOnly, setFreeOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const counts = useMemo(() => {
    const c: Record<CourseKind, number> = { event: 0, recorded: 0, ongoing: 0 };
    for (const r of rows) if (!mine || fits(r)) c[r.kind]++;
    return c;
  }, [rows, mine, nurse]);

  // every filter except the city one; the city list is built from these rows so no option leads to zero results
  const beforeCity = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const until = period === "all" ? null : addDays(Number(period));
    return rows.filter((r) => {
      if (r.kind !== kind) return false;
      if (mine && !fits(r)) return false;
      if (needle && !`${r.title} ${r.organizer ?? ""} ${r.audience}`.toLowerCase().includes(needle)) return false;
      if (format === "online" && !(r.format === "online_live" || r.city === "Online")) return false;
      if (format === "in_person" && !(r.format === "in_person" || r.format === "hybrid")) return false;
      if (until && kind === "event" && r.startDate && r.startDate > until) return false;
      if (minTip && (r.tip ?? 0) < minTip) return false;
      if (freeOnly && !freeForFilter(r)) return false;
      return true;
    });
  }, [rows, kind, q, mine, format, period, minTip, freeOnly, nurse]);

  const cities = useMemo(() => {
    const set = new Map<string, number>();
    for (const r of beforeCity) if (r.city && r.city !== "Online") set.set(r.city, (set.get(r.city) ?? 0) + 1);
    // keep the chosen city in the list even if other filters now exclude it, so the select still shows it
    if (city && !set.has(city)) set.set(city, 0);
    return [...set.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [beforeCity, city]);

  const filtered = useMemo(() => {
    const list = city ? beforeCity.filter((r) => r.city === city) : beforeCity;
    // specialty matches first within the same day, then by TIP
    if (kind === "event") return list;
    return [...list].sort((a, b) => Number(b.forMe) - Number(a.forMe) || (b.tip ?? 0) - (a.tip ?? 0));
  }, [beforeCity, city, kind]);

  // the linked course may sit past the first page
  useEffect(() => {
    if (!target) return;
    const i = filtered.findIndex((r) => r.id === target.id);
    if (i >= PAGE) setShown(Math.ceil((i + 1) / PAGE) * PAGE);
    // only on arrival; later filter changes are the user's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const anyFilter = !!q.trim() || mine || !!format || !!city || period !== "all" || minTip > 0 || freeOnly;
  const clearFilters = () => {
    setQ("");
    setMine(false);
    setFormat("");
    setCity("");
    setPeriod("all");
    setMinTip(0);
    setFreeOnly(false);
    setShown(PAGE);
  };

  const reset = (fn: () => void) => {
    fn();
    setShown(PAGE);
  };

  return (
    <main className="container stack">
      <div className="page-head">
        <div>
          <h1>{s.title}</h1>
          <p className="muted">{nurse ? s.nurseLead : s.lead}</p>
        </div>
        {remaining > 0 && <div className={styles.need}>{hoursUnit ? swapUnit(s.needLine(formatNumber(remaining, 1)), hoursUnit) : s.needLine(formatNumber(remaining, 1))}</div>}
      </div>

      {/* collapsed until opened; nurses re-register on hours with the Health Inspectorate (Reg. 630), not on LĀB TIP */}
      {!nurse && <AbroadEstimator locale={locale} />}

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
        <label className={styles.searchField}>
          <span className={styles.searchLabel}>{s.search}</span>
          <input
            className={styles.search}
            type="search"
            placeholder={s.searchShort}
            value={q}
            onChange={(e) => reset(() => setQ(e.target.value))}
          />
        </label>
        <div className={styles.selects}>
          <select aria-label={s.format} value={format} onChange={(e) => reset(() => setFormat(e.target.value as typeof format))}>
            <option value="">{s.anyFormat}</option>
            <option value="in_person">{s.formats.in_person}</option>
            <option value="online">{s.online}</option>
          </select>
          {cities.length > 1 && (
            <select aria-label={s.city} value={city} onChange={(e) => reset(() => setCity(e.target.value))}>
              <option value="">{s.anyCity}</option>
              {cities.map((c) => (
                <option key={c} value={c}>{cityLabel(c, s)}</option>
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
            <option value={0}>{s.anyTip}</option>
            {[2, 4, 8, 16].map((n) => (
              <option key={n} value={n}>≥ {n} TIP</option>
            ))}
          </select>
        </div>
        <div className={styles.checks}>
          {nurse ? (
            <label className={styles.check} title={s.forNursesHint}>
              <input type="checkbox" checked={mine} onChange={(e) => reset(() => setMine(e.target.checked))} />
              {s.forNurses}
            </label>
          ) : (
            <label className={styles.check} title={specialty ? s.mySpecialtyHint(specialtyLabel(specialty, locale)) : s.noSpecialty}>
              <input type="checkbox" checked={mine} disabled={!specialty} onChange={(e) => reset(() => setMine(e.target.checked))} />
              {s.mySpecialty}
            </label>
          )}
          <label className={styles.check} title={s.freeOnlyHint}>
            <input type="checkbox" checked={freeOnly} onChange={(e) => reset(() => setFreeOnly(e.target.checked))} />
            {s.freeOnly}
          </label>
        </div>
      </div>
      {!specialty && !nurse && <div className="alert">{s.noSpecialty} <a href="/profile">→</a></div>}
      {nurse && (
        <p className="small muted">
          {s.nurseMore}{" "}
          <a href={LMA_REGISTER_URL} target="_blank" rel="noreferrer">{s.lmaRegister} ↗</a>
          {" · "}
          <a href={SOURCE_URLS.lma} target="_blank" rel="noreferrer">{s.lmaCourses} ↗</a>
        </p>
      )}

      <div className="row small muted">{s.results(filtered.length)}</div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className="muted">{s.none}</p>
          {anyFilter && <button type="button" className="btn" onClick={clearFilters}>{s.clearFilters}</button>}
        </div>
      ) : (
        <ul className={styles.list}>
          {filtered.slice(0, shown).map((r) => (
            <CourseCard key={r.id} r={r} locale={locale} linked={r.id === target?.id} preloaded={r.id === target?.id ? openExtra : null} />
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
          {s.updatedLine(formatDate(fetchedAt.slice(0, 10), locale))} {s.sources}:{" "}
          {sources.map((src, i) => (
            <span key={src.source}>
              {i > 0 && ", "}
              <a href={SOURCE_URLS[src.source]} target="_blank" rel="noreferrer">{s.sourceLabels[src.source]}</a>
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
  return minutes ? formatNumber(round1(minutes / 60), 1) : null;
}

/** Audience badge: yours, all specialties, the named specialties, or honestly "not stated" */
function audienceBadge(r: CourseRow, s: CourseStrings, locale: Locale) {
  if (r.forMe && r.source === "lma") return <span className="tag tag-accent">{s.forNurses}</span>;
  if (r.forMe) return <span className="tag tag-accent">{s.matches}</span>;
  if (r.allSpecialties) return <span className="tag">{s.forAll}</span>;
  const named = r.audience.split(/[;,]\s*(?=\p{Lu})/u).map((a) => a.trim()).filter(Boolean);
  if (!named.length) return <span className="tag">{s.noAudience}</span>;
  const first = specialtyLabel(named[0], locale);
  return (
    <span className={`tag ${styles.audienceTag}`} title={r.audience}>
      {named.length > 1 ? `${first} +${named.length - 1}` : first}
    </span>
  );
}

function CourseCard({ r, locale, linked = false, preloaded = null }: { r: CourseRow; locale: Locale; linked?: boolean; preloaded?: CourseExtra | null }) {
  const s = useDict().courses;
  const [open, setOpen] = useState(linked);
  // undefined: not loaded yet; null: the request failed
  const [extra, setExtra] = useState<CourseExtra | null | undefined>(preloaded ?? undefined);
  useEffect(() => {
    if (!open || extra) return;
    let alive = true;
    setExtra(undefined);
    loadExtra(r.id).then((v) => alive && setExtra(v));
    return () => {
      alive = false;
    };
    // load on open (and retry a failed load on the next open), not on every state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, r.id]);
  const item = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!linked) return;
    // after the browser's own scroll restoration on reload, which would otherwise win
    const id = window.setTimeout(() => item.current?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(id);
  }, [linked]);
  const date = r.startDate
    ? r.endDate
      ? `${formatDate(r.startDate, locale)} - ${formatDate(r.endDate, locale)}`
      : formatDate(r.startDate, locale)
    : r.availableUntil
      ? `${r.kind === "ongoing" ? s.approvedUntil : s.availableUntil} ${formatDate(r.availableUntil, locale)}`
      : null;
  // an online course's format already says "Online", so it gets no separate place
  const online = r.city === "Online";
  const place = online || !r.city ? null : cityLabel(r.city, s);
  const location = extra?.location ?? null;
  const venue = location && !online && location !== r.city ? location : null;
  const hours = hoursOf(r.minutes, locale);
  const panelId = `course-${r.id.replace(/[^a-z0-9]/gi, "-")}`;

  return (
    <li ref={item} className={`${styles.item} ${open ? styles.itemOpen : ""}`}>
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
            {audienceBadge(r, s, locale)}
            {r.free && <span className="tag">{s.free}</span>}
            {r.price && !r.free && <span className="tag">{r.price}</span>}
          </span>
        </span>
        <span className={styles.tip} aria-label={r.tip != null ? `${formatNumber(r.tip, 1)} TIP` : s.tipUnknown}>
          {r.tip != null ? `+${formatNumber(r.tip, 1)}` : "?"} <span className={styles.tipUnit}>TIP</span>
        </span>
        <span className={styles.chevron} aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={panelId} className={styles.panel}>
          <ApplyBox r={r} extra={extra} locale={locale} />
          <dl className={styles.facts}>
            {date && <Fact k={s.details.date} v={date} />}
            <Fact k={s.details.format} v={s.formats[r.format]} />
            {(venue || place) && <Fact k={s.details.place} v={[venue, place && venue?.includes(place) ? null : place].filter(Boolean).join(", ")} />}
            {hours && <Fact k={s.details.duration} v={`${s.hours(hours)} (${r.minutes} min)`} />}
            {r.kind === "ongoing" && r.tip != null && <Fact k={s.details.tip} v={s.details.tipWhole(formatNumber(r.tip, 1))} />}
            {r.organizer && <Fact k={s.details.organizer} v={r.organizer} />}
            {r.audience && <Fact k={s.details.audience} v={r.audience} />}
            <Fact k={s.details.price} v={r.free ? s.free : (r.price ?? s.details.priceUnknown)} />
            {extra?.approvalId && <Fact k={r.source === "lma" ? s.details.approvalLma : s.details.approval} v={`${extra.approvalId}${extra.annexItem ? `, ${s.annex(extra.annexItem)}` : ""}`} />}
          </dl>
          {extra?.detailRef && <Programme detailRef={extra.detailRef} locale={locale} />}
        </div>
      )}
    </li>
  );
}

/** The one thing a doctor needs from an opened course: how to sign up */
function ApplyBox({ r, extra, locale }: { r: CourseRow; extra: CourseExtra | null | undefined; locale: Locale }) {
  const cs = useDict().courses;
  const a = cs.apply;
  if (extra === undefined)
    return (
      <section className={styles.apply} aria-label={a.title} aria-busy="true">
        <h3 className={styles.applyTitle}>{a.title}</h3>
        <p className="small muted" style={{ margin: 0 }}>…</p>
      </section>
    );
  // details failed to load: the source's own list is still a way to sign up
  const url = extra?.url ?? SOURCE_URLS[r.source];
  // the email goes to a Latvian organiser, so subject, body and date are always Latvian
  const lvDate = r.startDate
    ? `${formatDate(r.startDate, "lv")}${r.endDate ? ` - ${formatDate(r.endDate, "lv")}` : ""}`
    : null;
  const direct = !!extra && (r.source === "lab_courses" || r.source === "kursiarstiem" || r.source === "medicinaskursi" || r.source === "evisit" || (r.source === "lumpii" && !url.endsWith("/kursi")) || (r.source === "lma" && url !== SOURCE_URLS.lma));
  const c = extra?.contact;
  return (
    <section className={styles.apply} aria-label={a.title}>
      <h3 className={styles.applyTitle}>{a.title}</h3>
      {direct ? (
        <div className="row">
          <a className="btn btn-primary" href={url} target="_blank" rel="noreferrer">
            {r.kind === "recorded" ? a.watch : a.online} ↗
          </a>
        </div>
      ) : c && (c.email || c.phone) ? (
        <>
          {c.email ? (
            <EmailApply email={c.email} subject={applyEmail.subject(r.title, lvDate)} body={applyEmail.body(r.title, lvDate)} phone={c.phone} />
          ) : (
            <div className="row">
              <a className="btn btn-primary" href={`tel:${c.phone!.replace(/[^\d+]/g, "")}`}>
                {a.call} {c.phone}
              </a>
            </div>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            {[r.organizer, c.name, c.email].filter(Boolean).join(" · ")}
            <br />
            {a.contactNote}
          </p>
        </>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {a.noContact}{" "}
          <a href={url} target="_blank" rel="noreferrer">{r.source === "lab_tip" ? a.listLink : cs.open} ↗</a>
        </p>
      )}
      {/* LĀB publishes no organiser website: a search is the quickest way to the organiser's own page */}
      {!direct && r.organizer && (
        <p className="small" style={{ margin: 0 }}>
          <a href={`https://www.google.com/search?q=${encodeURIComponent(`${r.organizer} ${r.title}`)}`} target="_blank" rel="noreferrer">
            {a.findSite} ↗
          </a>
        </p>
      )}
      {/* after the course: its certificate goes in from here, and the course fills what the certificate leaves out */}
      <p className="small" style={{ margin: 0 }}>
        <Link href={`/certificates?course=${encodeURIComponent(r.id)}`}>{a.addCertificate} →</Link>
      </p>
    </section>
  );
}

/**
 * "Pieteikties" by email without relying on the computer's default mail app (often not the one used):
 * the address and a ready text to copy, plus Gmail and Outlook web links with everything filled in.
 */
function EmailApply({ email, subject, body, phone }: { email: string; subject: string; body: string; phone: string | null }) {
  const a = useDict().courses.apply;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"email" | "text" | null>(null);
  const copy = (what: "email" | "text", value: string) =>
    navigator.clipboard?.writeText(value).then(
      () => setCopied(what),
      () => setCopied(null),
    );
  const q = (s: string) => encodeURIComponent(s);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <button type="button" className="btn btn-primary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {a.apply}
        </button>
        {phone && (
          <a className="btn" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
            {a.call} {phone}
          </a>
        )}
      </div>
      {open && (
        <div className={styles.emailApply}>
          <p className="small" style={{ margin: 0 }}>{a.emailHow}</p>
          <div className="row">
            <code className={styles.emailAddr}>{email}</code>
            <button type="button" className={`btn ${styles.smallBtn}`} onClick={() => copy("email", email)}>
              {copied === "email" ? a.copied : a.copyEmail}
            </button>
          </div>
          <textarea className={styles.emailText} readOnly rows={7} value={`${subject}\n\n${body}`} aria-label={a.emailTextLabel} />
          <div className="row">
            <button type="button" className={`btn ${styles.smallBtn}`} onClick={() => copy("text", body)}>
              {copied === "text" ? a.copied : a.copyText}
            </button>
            <a className={`btn ${styles.smallBtn}`} href={`https://mail.google.com/mail/?view=cm&fs=1&to=${q(email)}&su=${q(subject)}&body=${q(body)}`} target="_blank" rel="noreferrer">Gmail ↗</a>
            <a className={`btn ${styles.smallBtn}`} href={`https://outlook.live.com/mail/0/deeplink/compose?to=${q(email)}&subject=${q(subject)}&body=${q(body)}`} target="_blank" rel="noreferrer">Outlook ↗</a>
            <a className={`btn ${styles.smallBtn}`} href={`mailto:${email}?subject=${q(subject)}&body=${q(body)}`}>{a.mailApp}</a>
          </div>
        </div>
      )}
    </div>
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
  const cs = useDict().courses;
  const s = cs.details;
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
  // the lecture total can differ from the list's own length (TIP2025/8727: 1440 min listed, 14,400 min of lectures)
  const total = hoursOf(state.lectures.reduce((n, l) => n + (l.minutes ?? 0), 0), locale);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h3 className={styles.progTitle}>{s.programme}{total && state.lectures.length > 1 ? ` · ${cs.hours(total)}` : ""}</h3>
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
