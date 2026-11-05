"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { swapUnit, type Locale } from "@/lib/locale";
import { freeForFilter, LMA_REGISTER_URL, SOURCE_URLS, type Course, type CourseDetails, type CourseExtra, type CourseKind, type Lecture, type SourceStatus } from "@/lib/courses/types";
import { useDict } from "@/components/i18n/DictProvider";
import AbroadEstimator from "./AbroadEstimate";
import type { Dict } from "@/lib/i18n/en";
import styles from "./courses.module.css";
import { IconCal, IconDoc, IconPlay } from "../PartIcons";
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
const KIND_ICONS: Record<CourseKind, ReactNode> = { event: <IconCal />, recorded: <IconPlay />, ongoing: <IconDoc /> };
const KIND_TONES: Record<CourseKind, string> = { event: styles.toneGreen, recorded: styles.toneBlue, ongoing: styles.toneGray };

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const pill = (key: string, on: boolean, label: string, onClick: () => void, title?: string, disabled = false) => (
    <button key={key} type="button" className={`${styles.pill} ${on ? styles.pillOn : ""}`} aria-pressed={on} onClick={onClick} title={title} disabled={disabled}>
      {on && <span aria-hidden>✓ </span>}{label}
    </button>
  );
  // what sits behind "Filtri": the specialty pill stays outside, so it is not counted
  const hiddenFilters = (format ? 1 : 0) + (freeOnly ? 1 : 0) + (period !== "all" ? 1 : 0) + (minTip ? 1 : 0) + (city ? 1 : 0);
  const needText = s.needShort(formatNumber(remaining, 1));

  return (
    <main className="container stack">
      <div className={styles.head}>
        <h1>{s.title}</h1>
        {remaining > 0 && <span className={styles.need}>{hoursUnit ? swapUnit(needText, hoursUnit) : needText}</span>}
      </div>

      <section className={styles.controls} aria-label={s.filters}>
        {/* three plain choices first; the online ones are one click away (Ineta Ūdra's test, November 2026) */}
        <div className={styles.kinds} role="tablist">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={`${styles.kind} ${KIND_TONES[k]} ${kind === k ? styles.kindOn : ""}`}
              onClick={() => reset(() => (setKind(k), setCity("")))}
            >
              <span className={styles.kindIcon}>{KIND_ICONS[k]}</span>
              <span className={styles.kindName}>{s.tabsShort[k]}</span>
              <span className={styles.kindCount}>{counts[k]}</span>
            </button>
          ))}
        </div>

        <div className={styles.searchRow}>
          <label className={styles.search}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" aria-label={s.search} placeholder={s.searchShort} value={q} onChange={(e) => reset(() => setQ(e.target.value))} />
          </label>
          <button type="button" className={`${styles.filterBtn} ${filtersOpen ? styles.pillOn : ""}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
            {s.filters}{hiddenFilters ? ` (${hiddenFilters})` : ""}
          </button>
        </div>

        <div className={styles.pills}>
          {nurse
            ? pill("mine", mine, s.forNurses, () => reset(() => setMine(!mine)), s.forNursesHint)
            : pill("mine", mine, s.mySpecialty, () => reset(() => setMine(!mine)), specialty ? s.mySpecialtyHint(specialtyLabel(specialty, locale)) : s.noSpecialty, !specialty)}
        </div>

        {filtersOpen && (
          <div className={styles.filterPanel}>
            <div className={styles.pills}>
              {pill("in_person", format === "in_person", s.formats.in_person, () => reset(() => setFormat(format === "in_person" ? "" : "in_person")))}
              {pill("online", format === "online", s.online, () => reset(() => setFormat(format === "online" ? "" : "online")))}
              {pill("free", freeOnly, s.freeOnly, () => reset(() => setFreeOnly(!freeOnly)), s.freeOnlyHint)}
            </div>
            <div className={styles.pills}>
              {kind === "event" && pill("30", period === "30", s.next30, () => reset(() => setPeriod(period === "30" ? "all" : "30")))}
              {kind === "event" && pill("90", period === "90", s.next90, () => reset(() => setPeriod(period === "90" ? "all" : "90")))}
              {[2, 4, 8, 16].map((n) => pill(`tip${n}`, minTip === n, `≥ ${n} TIP`, () => reset(() => setMinTip(minTip === n ? 0 : n))))}
            </div>
            {cities.length > 1 && (
              <div className={styles.pills}>
                {cities.map((c) => pill(`city${c}`, city === c, cityLabel(c, s), () => reset(() => setCity(city === c ? "" : c))))}
              </div>
            )}
          </div>
        )}
        {!specialty && !nurse && <div className="alert">{s.noSpecialty} <a href="/profile">→</a></div>}
      </section>

      {/* the break between the choices above and the courses below */}
      <div className={styles.listHead}>
        <h2>{s.results(filtered.length)}</h2>
        <p className="small muted">{nurse ? s.nurseLead : s.notOurs}</p>
        {nurse && (
          <p className="small muted">
            {s.nurseMore}{" "}
            <a href={LMA_REGISTER_URL} target="_blank" rel="noreferrer">{s.lmaRegister} ↗</a>
            {" · "}
            <a href={SOURCE_URLS.lma} target="_blank" rel="noreferrer">{s.lmaCourses} ↗</a>
          </p>
        )}
      </div>

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

      {/* collapsed until opened; nurses re-register on hours with the Health Inspectorate (Reg. 630), not on LĀB TIP */}
      {!nurse && <AbroadEstimator locale={locale} />}

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
  const online = r.city === "Online" || r.format === "online_live" || r.format === "recorded";
  const place = online || !r.city ? null : cityLabel(r.city, s);
  const location = extra?.location ?? null;
  const venue = location && location !== r.city ? location : null;
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
          <span className={styles.badges}>{audienceBadge(r, s, locale)}</span>
        </span>
        {/* TIP and price are what doctors compare first (Ralfs Gauja's test, November 2026) */}
        <span className={styles.side}>
          <span className={styles.tip} aria-label={r.tip != null ? `${formatNumber(r.tip, 1)} TIP` : s.tipUnknown}>
            {r.tip != null ? `+${formatNumber(r.tip, 1)}` : "?"} <span className={styles.tipUnit}>TIP</span>
          </span>
          <span className={r.free || r.price ? styles.price : styles.priceNone}>{r.free ? s.free : (r.price ?? s.priceNotListed)}</span>
        </span>
        <span className={styles.chevron} aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={panelId} className={styles.panel}>
          <CourseFacts r={r} extra={extra} date={date} place={place} venue={venue} online={online} hours={hours} />
          <ApplyBox r={r} extra={extra} locale={locale} />
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
  const direct = !!extra && (r.source === "lab_courses" || r.source === "kursiarstiem" || r.source === "medicinaskursi" || r.source === "evisit" || r.source === "lfa" || r.source === "lupsk" || r.source === "lza" || r.source === "kosmetologs" || (r.source === "lumpii" && !url.endsWith("/kursi")) || (r.source === "lma" && url !== SOURCE_URLS.lma));
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
      {/* testers asked whether lectures play on Medserti and who gets paid (Ineta Ūdra's test, November 2026) */}
      {r.format === "recorded" || r.format === "online_live" ? (
        <p className="small muted" style={{ margin: 0 }}>{a.onlineNote}</p>
      ) : (
        !r.free && <p className="small muted" style={{ margin: 0 }}>{a.paidNote}</p>
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

/**
 * The same facts on every course, in the same order. A fact the source does not give says so ("Nav norādīts")
 * instead of being left out: testers read a missing price or address as an error (Ineta Ūdra's test, November 2026).
 */
function CourseFacts({
  r,
  extra,
  date,
  place,
  venue,
  online,
  hours,
}: {
  r: CourseRow;
  extra: CourseExtra | null | undefined;
  date: string | null;
  place: string | null;
  venue: string | null;
  online: boolean;
  hours: string | null;
}) {
  const s = useDict().courses;
  const d = s.details;
  const none = d.notListed;
  // venue, time and approval come with the opened course's details; "…" until they arrive
  const later = (v: string | null | undefined) => (extra === undefined ? "…" : (v ?? none));
  const event = r.kind === "event";
  const facts: [string, string][] = [
    event ? [d.date, date ?? none] : [d.available, date ?? d.anytime],
    ...(event ? ([[d.time, later(extra?.time)]] as [string, string][]) : []),
    [d.format, s.formats[r.format]],
    ...((online
      ? [[d.where, later(venue)]]
      : [
          [d.city, place ?? none],
          [d.address, later(venue && (!place || venue !== place) ? venue : null)],
        ]) as [string, string][]),
    [d.duration, hours ? `${s.hours(hours)} (${r.minutes} ${s.minutesUnit})` : none],
    [d.tip, r.tip == null ? none : r.kind === "ongoing" ? d.tipWhole(formatNumber(r.tip, 1)) : formatNumber(r.tip, 1)],
    [d.price, r.free ? s.free : (r.price ?? d.priceUnknown)],
    [d.organizer, r.organizer ?? none],
    [d.audience, r.audience || s.noAudience],
  ];
  return (
    <dl className={styles.facts}>
      {facts.map(([k, v]) => (
        <Fact key={k} k={k} v={v} muted={v === none || v === d.priceUnknown || v === s.noAudience} />
      ))}
      {extra?.approvalId && <Fact k={r.source === "lma" ? d.approvalLma : d.approval} v={`${extra.approvalId}${extra.annexItem ? `, ${s.annex(extra.annexItem)}` : ""}`} />}
    </dl>
  );
}

function Fact({ k, v, muted = false }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className={styles.fact}>
      <dt>{k}</dt>
      <dd className={muted ? "muted" : undefined}>{v}</dd>
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
              {[l.lecturer, l.minutes ? `${l.minutes} ${cs.minutesUnit}` : null].filter(Boolean).join(" · ")}
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
