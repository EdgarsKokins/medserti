"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { rowConfirmEligible } from "@/lib/parse/confidence";
import { useRouter } from "next/navigation";
import type { CmeCertificate } from "@/lib/types";
import { inHours, type Locale } from "@/lib/locale";
import { useDict } from "@/components/i18n/DictProvider";
import { needsApprovalCheck, nurseTopicOf } from "@/lib/nurse";
import { exclusionReason, type ExclusionReason } from "@/lib/rules";
import { displayOrganizer, STATUS_CLASS } from "./format";
import { formatDate, formatNumber, formatPeriod } from "@/lib/format";
import UploadZone from "./UploadZone";
import ReviewPanel from "./ReviewPanel";
import FileLink from "./FileLink";
import Lectures from "./Lectures";
import { mergeStored } from "./merge";
import { FADE_MS, LEAVE_MS, nextFocusId, settle, stripHeight, type LeaveKind, type Section } from "./leave";
import { forgetStored, getUploadSnapshot, subscribeUploads } from "./uploadStore";
import { reportFailure } from "@/components/monitoring/report";
import { trackEvent } from "@/components/monitoring/track";
import styles from "./certificates.module.css";

/** how long "Apstiprināts · Atsaukt" stays after an in-row confirm */
const UNDO_MS = 6000;

/** a row on its way out (leave.ts): its height, the height it shrinks to first, and where the bin is */
type Leaving = { kind: LeaveKind; h: number; s: number; bx: number; bb: number };
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

const sortCerts = (list: CmeCertificate[]) =>
  [...list].sort((a, b) => (b.date ?? b.uploadedAt).localeCompare(a.date ?? a.uploadedAt));

export default function CertificatesView({
  initial,
  specialty,
  locale,
  cycle,
  today,
  readOnly = false,
  nurse = false,
  forCourse = null,
  own = [],
  assignment = {},
}: {
  /** the user's own certificates when there is more than one specialty: label, specialty and period of each */
  own?: { id: string; label: string; specialty: string; cycle: { start: string | null; end: string | null } }[];
  /** upload id -> the own certificate it counts toward (lib/certAssign.ts, worked out on the server) */
  assignment?: Record<string, string>;
  initial: CmeCertificate[];
  specialty: string;
  locale: Locale;
  /** the user's certificate window and today's date (server), for the in-row "Apstiprināt" check */
  cycle: { start: string | null; end: string | null };
  today: string;
  /** demo account: no upload, the panel only shows the fields */
  readOnly?: boolean;
  /** nurses: hours instead of TIP, the Reg. 630 topic instead of the Annex 4 category, and the point 47 approval flag */
  nurse?: boolean;
  /** opened from "Pievienot sertifikātu" on a course (/certificates?course=<id>): uploads are for that course */
  forCourse?: { id: string; title: string } | null;
}) {
  const base = useDict();
  const dict = nurse ? inHours(base) : base;
  const d = dict.certs;
  const router = useRouter();
  const [certs, setCerts] = useState(() => sortCerts(initial));
  const [openId, setOpenId] = useState<string | null>(null);
  // choices saved in the review panel this visit, before the server's assignment comes back with the page
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const assignedOf = (c: CmeCertificate) => chosen[c.id] ?? (c.countsFor && own.some((x) => x.id === c.countsFor) ? c.countsFor : assignment[c.id]) ?? "main";
  const ownOf = (c: CmeCertificate) => own.find((x) => x.id === assignedOf(c));
  const cycleOf = (c: CmeCertificate) => ownOf(c)?.cycle ?? cycle;
  const open = certs.find((c) => c.id === openId) ?? null;

  const waiting = useMemo(() => certs.filter((c) => c.status !== "confirmed").length, [certs]);
  // why each certificate is left out of the progress, by the same rule computeProgress applies on the dashboard
  const reasons = useMemo(() => {
    const ids = new Set(certs.map((c) => c.id));
    return new Map(certs.map((c) => [c.id, exclusionReason(c, ids, cycleOf(c))] as const));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certs, cycle, own, assignment, chosen]);
  const confirmedPoints = useMemo(
    () => certs.filter((c) => c.status === "confirmed" && !reasons.get(c.id)).reduce((s, c) => s + (c.points ?? 0), 0),
    [certs, reasons],
  );
  const [infoId, setInfoId] = useState<string | null>(null);
  const outsideCount = useMemo(
    () => certs.filter((c) => { const r = reasons.get(c.id); return r === "beforeWindow" || r === "afterWindow"; }).length,
    [certs, reasons],
  );
  const reasonText = (r: ExclusionReason, cyc = cycle) =>
    r === "beforeWindow"
      ? (nurse ? d.reasons.beforeWindowNurse : d.reasons.beforeWindow)(formatDate(cyc.start!, locale))
      : r === "afterWindow"
        ? d.reasons.afterWindow(formatDate(cyc.end!, locale))
        : d.reasons[r];

  // in-row "Apstiprināt": confirm without the panel, with a few seconds to undo; the server checks again
  const [undo, setUndo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const undoTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  const quick = useMemo(
    () => new Set(certs.filter((c) => rowConfirmEligible(c, certs, cycleOf(c), today)).map((c) => c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [certs, cycle, today, own, assignment, chosen],
  );

  // bin icon in the row: asks once in place, then deletes (record and file, as the review panel's Dzēst does)
  const [askDelete, setAskDelete] = useState<string | null>(null);
  // rows on their way out: they stay in the list (and the counts) until the delete is through and the animation has played
  const [leaving, setLeaving] = useState<Record<string, Leaving>>({});
  const [backId, setBackId] = useState<string | null>(null);
  useEffect(() => {
    // Escape cancels the question, not a delete already under way
    if (!askDelete || leaving[askDelete]) return;
    const id = askDelete;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancelAsk(id);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askDelete, leaving]);
  /** "Atcelt" or Escape: the question closes and focus goes back to the row's bin */
  function cancelAsk(id: string) {
    pendingFocus.current = id;
    setAskDelete(null);
  }

  const listRef = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rowEl = (id: string) => listRef.current?.querySelector<HTMLElement>(`[data-cert="${CSS.escape(id)}"]`) ?? null;
  const binOf = (id: string) => rowEl(id)?.querySelector<HTMLElement>("[data-bin]") ?? null;
  // where focus goes once a row leaves: a row id, null for the list heading, undefined for nothing pending
  const pendingFocus = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const p = pendingFocus.current;
    if (p === undefined) return;
    const bin = p ? binOf(p) : null;
    if (bin && (bin.checkVisibility?.() ?? bin.offsetParent !== null)) {
      pendingFocus.current = undefined;
      bin.focus({ preventScroll: true });
      return;
    }
    // the leaving row is inert, so its focus is gone; the heading holds it until the next row shows (the confirmed group
    // unfolds once the last waiting row is gone). Never taken from somewhere the user has moved to meanwhile.
    const at = document.activeElement;
    if (!at || at === document.body || at.closest("[inert]")) heading.current?.focus({ preventScroll: true });
    if (!p || Object.keys(leaving).length === 0) pendingFocus.current = undefined;
  });

  /** starts the row's leave animation; resolves once it has played (at once with reduced motion) */
  function leave(id: string, kind: LeaveKind, from?: HTMLElement | null): Promise<void> {
    const staying = (c: CmeCertificate) => !leaving[c.id] || c.id === id;
    pendingFocus.current = nextFocusId(sectionsOf(certs.filter(staying)), sectionsOf(certs.filter((c) => staying(c) && c.id !== id)), id);
    const li = rowEl(id);
    if (li) {
      const r = li.getBoundingClientRect();
      const s = from?.getBoundingClientRect();
      const by = s ? s.top + s.height / 2 - r.top : r.height / 2;
      setLeaving((m) => ({
        ...m,
        [id]: {
          kind,
          h: r.height,
          s: kind === "bin" ? stripHeight(r.height, by) : r.height,
          bx: s ? s.left + s.width / 2 - r.left : r.width - 24,
          bb: r.height - by,
        },
      }));
    }
    return wait(reducedMotion() ? 0 : kind === "bin" ? LEAVE_MS : FADE_MS);
  }

  function stay(id: string) {
    setLeaving((m) => {
      if (!m[id]) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  // the request goes out at once; the row folds into the bin alongside it and comes back if the delete fails
  async function deleteRow(c: CmeCertificate, yes: HTMLElement) {
    setBusyId(c.id);
    setBackId(null);
    const request = fetch(`/api/certificates/${c.id}`, { method: "DELETE" })
      .catch(() => null)
      .then((res) => {
        if (!res?.ok) reportFailure("certDeleteRow", res);
        return !!res?.ok;
      });
    const outcome = await settle(request, leave(c.id, "bin", yes));
    setBusyId(null);
    setAskDelete((a) => (a === c.id ? null : a));
    const name = c.title || c.fileName;
    if (outcome === "failed") {
      stay(c.id);
      setBackId(c.id);
      pendingFocus.current = c.id;
      setLive(d.rowDeleteError);
      return;
    }
    setLive(d.rowDeleted(name));
    removed(c.id);
  }

  // the review panel has deleted it: the panel closes, the row fades out behind it
  async function deletedInPanel(id: string) {
    setOpenId(null);
    await leave(id, "fade");
    removed(id);
  }

  async function quickConfirm(c: CmeCertificate, method: "POST" | "DELETE") {
    setBusyId(c.id);
    const res = await fetch(`/api/certificates/${c.id}/confirm`, { method }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusyId(null);
    const name = c.title || c.fileName;
    if (!res?.ok || !body.certificate) {
      reportFailure(method === "POST" ? "certConfirmRow" : "certUnconfirmRow", res);
      setLive(d.rowConfirmError);
      return;
    }
    setCerts((prev) => sortCerts(prev.map((p) => (p.id === c.id ? body.certificate : p))));
    window.clearTimeout(undoTimer.current);
    if (method === "POST") trackEvent("Certificate confirmed");
    if (method === "POST") {
      setUndo(c.id);
      setLive(d.rowConfirmed(name));
      undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
    } else {
      setUndo(null);
      setLive(d.rowUndone(name));
    }
  }

  const refreshAfterBatch = useRef(false);
  const onUploaded = useCallback(
    (added: CmeCertificate[], replay: boolean) => {
      setCerts((prev) => sortCerts(mergeStored(prev, added, replay ? "replay" : "live")));
      if (replay) return;
      // one refresh per batch, not per file: the queue is still busy while more files follow
      if (getUploadSnapshot().busy) refreshAfterBatch.current = true;
      else router.refresh();
    },
    [router],
  );
  useEffect(
    () =>
      subscribeUploads(() => {
        if (!refreshAfterBatch.current || getUploadSnapshot().busy) return;
        refreshAfterBatch.current = false;
        router.refresh();
      }),
    [router],
  );
  const close = useCallback(() => setOpenId(null), []);

  // confirmed certificates from before this period: kept as a record (what was attended, the files), apart from the current list
  const past = (c: CmeCertificate) => c.status === "confirmed" && reasons.get(c.id) === "beforeWindow";
  const pastList = certs.filter(past);
  const pastPoints = pastList.reduce((n, c) => n + (c.points ?? 0), 0);
  const current = certs.filter((c) => !past(c));
  const waitingList = current.filter((c) => c.status !== "confirmed");
  const confirmedList = current.filter((c) => c.status === "confirmed");
  // the confirmed ones fold away while something waits for review, so the waiting ones are not lost in a long list
  const grouped = confirmedList.length > 0 && waitingList.length > 0;
  const [confirmedOpen, setConfirmedOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  /** the lists as they show for these certificates, in page order (leave.ts nextFocusId) */
  const sectionsOf = (list: CmeCertificate[]): Section[] => {
    const cur = list.filter((c) => !past(c));
    const w = cur.filter((c) => c.status !== "confirmed");
    const cf = cur.filter((c) => c.status === "confirmed");
    const g = cf.length > 0 && w.length > 0;
    const ids = (l: CmeCertificate[]) => l.map((c) => c.id);
    return [
      { ids: ids(g ? w : cur), open: true },
      { ids: g ? ids(cf) : [], open: confirmedOpen },
      { ids: ids(list.filter(past)), open: pastOpen },
    ];
  };

  function replace(c: CmeCertificate) {
    if (c.countsFor) setChosen((m) => ({ ...m, [c.id]: c.countsFor! }));
    setCerts((prev) => sortCerts(prev.map((p) => (p.id === c.id ? c : p))));
    setOpenId(null);
    router.refresh();
  }

  function removed(id: string) {
    forgetStored(id);
    setCerts((prev) => prev.filter((p) => p.id !== id));
    stay(id);
    setOpenId((o) => (o === id ? null : o));
    router.refresh();
  }

  /** `inPast`: a row in "Iepriekšējie periodi", where being outside the period is the point, so the reason stays one click away */
  const row = (c: CmeCertificate, inPast = false) => {
    const attention = c.status !== "confirmed";
    const org = c.organizer ? displayOrganizer(c.organizer) : "";
    const reason = reasons.get(c.id) ?? null;
    // the rules leave it out although it may be confirmed: say so in the row, with the reason one click away.
    // Missing data, a failed read and "still reading" keep their own status, which already says what to do.
    const outside = reason === "beforeWindow" || reason === "afterWindow";
    const duplicate = reason === "duplicate" || (!!c.duplicateOf && c.status !== "confirmed");
    const explain = outside || reason === "duplicate" ? reason : null;
    // in the current list the reason is always shown: a red "Neieskaitīts" with the why behind a small button went unseen
    const inline = !!explain && !inPast;
    const infoOpen = inline || (infoId === c.id && !!explain);
    const lv = leaving[c.id];
    const vars = lv ? ({ "--row-h": `${lv.h}px`, "--row-s": `${lv.s}px`, "--bin-x": `${lv.bx}px`, "--bin-b": `${lv.bb}px` } as CSSProperties) : undefined;
    return (
      <li
        key={c.id}
        data-cert={c.id}
        inert={!!lv}
        style={vars}
        className={`${styles.item} ${attention ? (c.status === "failed" ? styles.itemBad : styles.itemWarn) : ""} ${!readOnly && quick.has(c.id) ? styles.itemQuick : ""} ${lv ? (lv.kind === "bin" ? styles.leaving : styles.fading) : ""} ${backId === c.id ? styles.back : ""}`}
      >
        <span className={styles.date}>
          {c.date ? (
            <>
              {formatDate(c.date, locale)}
              {c.endDate && c.endDate !== c.date && <span className={styles.dateEnd}>- {formatDate(c.endDate, locale)}</span>}
            </>
          ) : (
            <span className={styles.noDate}>{d.noDate}</span>
          )}
        </span>
        <span className={styles.main}>
          <span className={styles.title}>{c.title || <span className="muted">{c.fileName}</span>}</span>
          <Lectures cert={c} title={c.title} compact />
          <span className={styles.meta}>
            {[org, nurse ? dict.review.topics[nurseTopicOf(c)] : dict.categories[c.category], own.length > 1 ? ownOf(c)?.label : null].filter(Boolean).join(" · ")}
          </span>
          {nurse && needsApprovalCheck(c) && <span className="badge badge-warn">{d.approvalCheckShort}</span>}
        </span>
        <span className={styles.points}>
          {c.points != null && <>+{formatNumber(c.points)} <span className={styles.unit}>{nurse ? dict.dashboard.hoursUnit : "TIP"}</span></>}
        </span>
        <span className={styles.status}>
          <span className={outside || duplicate ? "badge badge-bad" : STATUS_CLASS[c.status]}>
            {outside
              ? d.notCounted
              : duplicate
                ? dict.review.duplicate
                : c.status === "confirmed" && c.autoConfirmed
                  ? dict.review.autoConfirmed
                  : dict.status[c.status]}
          </span>
          {explain && !inline && (
            <button
              type="button"
              className={styles.infoBtn}
              aria-expanded={infoOpen}
              aria-controls={`why-${c.id}`}
              aria-label={d.whyNotCounted}
              title={d.whyNotCounted}
              onClick={() => setInfoId(infoOpen ? null : c.id)}
            >
              i
            </button>
          )}
          {undo === c.id && c.status === "confirmed" && (
            <>
              <span className="muted" aria-hidden> · </span>
              <button type="button" className={styles.linkBtn} disabled={busyId === c.id} onClick={() => quickConfirm(c, "DELETE")}>
                {d.rowUndo}
              </button>
            </>
          )}
        </span>
        <span className={styles.actions}>
          {!readOnly && (askDelete === c.id || lv?.kind === "bin") ? (
            <span className={styles.deleteAsk} role="group" aria-label={d.rowDeleteAsk}>
              <span className="small">{d.rowDeleteAsk}</span>
              <span className={styles.slot}>
                <button type="button" className={`btn btn-danger ${styles.smallBtn}`} disabled={busyId === c.id} onClick={(e) => deleteRow(c, e.currentTarget)} autoFocus>
                  {d.rowDeleteYes}
                </button>
                {lv?.kind === "bin" && (
                  <span className={styles.binDrop} aria-hidden="true">
                    <BinIcon size={18} />
                  </span>
                )}
              </span>
              <button type="button" className={styles.linkBtn} onClick={() => cancelAsk(c.id)}>
                {d.rowDeleteNo}
              </button>
            </span>
          ) : (
          <>
          <FileLink id={c.id} fileName={c.fileName} locale={locale} className={styles.linkBtn} />
          {readOnly ? (
            <button type="button" className={styles.linkBtn} onClick={() => setOpenId(c.id)}>
              {dict.demo.view}
            </button>
          ) : attention ? (
            <>
              {quick.has(c.id) && (
                <button type="button" className={`btn ${styles.smallBtn}`} disabled={busyId === c.id} onClick={() => quickConfirm(c, "POST")}>
                  {d.rowConfirm}
                </button>
              )}
              <button type="button" className={`btn btn-primary ${styles.smallBtn}`} onClick={() => setOpenId(c.id)}>
                {d.review}
              </button>
            </>
          ) : (
            <button type="button" className={styles.linkBtn} onClick={() => setOpenId(c.id)}>
              {d.edit}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              data-bin=""
              className={styles.binBtn}
              aria-label={d.rowDelete(c.title || c.fileName)}
              title={d.rowDeleteYes}
              onClick={() => {
                setBackId(null);
                setAskDelete(c.id);
              }}
            >
              <BinIcon />
            </button>
          )}
          </>
          )}
        </span>
        {infoOpen && (
          <p id={`why-${c.id}`} className={`alert small ${styles.reason}`} role="note">
            {reasonText(explain, cycleOf(c))}
          </p>
        )}
        {lv?.kind === "bin" && <span className={styles.dropCard} aria-hidden="true" />}
      </li>
    );
  };

  return (
    <>
      <p className="sr-only" aria-live="polite" role="status">{live}</p>
      {waiting > 0 && (
        <p className={styles.waiting}>
          <span className="badge badge-warn">{d.waitingShort(waiting)}</span>
        </p>
      )}

      {readOnly ? (
        <p className="alert">{dict.demo.uploadOff}</p>
      ) : (
        <>
          {forCourse && (
            <p className="alert">
              {d.forCourse(forCourse.title)} <a href="/certificates">{d.forCourseCancel}</a>
            </p>
          )}
          <UploadZone onUploaded={onUploaded} locale={locale} courseId={forCourse?.id ?? null} />
        </>
      )}

      <section aria-labelledby="certs-title" ref={listRef}>
        <div className={styles.listHead}>
          <h2 id="certs-title" ref={heading} tabIndex={-1}>{d.allTitle}</h2>
          <span className="small muted">{d.summary(certs.length, formatNumber(confirmedPoints))}</span>
        </div>
        {outsideCount > 0 && cycle.start && (
          <p className="alert">
            {d.outsideAlert(outsideCount, formatPeriod(cycle.start, cycle.end, locale))}{" "}
            <a href="/profile">{d.outsideAlertLink}</a>
          </p>
        )}
        {certs.length === 0 ? (
          <p className="muted">{d.empty}</p>
        ) : (
          <>
            <ul className={styles.list}>
              <li className={styles.colHead} aria-hidden>
                <span>{d.colDate}</span>
                <span>{d.colTitle}</span>
                <span className={styles.numHead}>{d.colPoints}</span>
                <span>{d.colStatus}</span>
                <span />
              </li>
              {(grouped ? waitingList : current).map((c) => row(c))}
            </ul>
            {grouped && (
              <details className={styles.group} open={confirmedOpen} onToggle={(e) => setConfirmedOpen(e.currentTarget.open)}>
                <summary>{d.confirmedGroup(confirmedList.length)}</summary>
                <ul className={styles.list}>{confirmedList.map((c) => row(c))}</ul>
              </details>
            )}
            {pastList.length > 0 && (
              <details className={styles.group} open={pastOpen} onToggle={(e) => setPastOpen(e.currentTarget.open)}>
                <summary>{d.pastGroup(pastList.length, formatNumber(pastPoints))}</summary>
                <p className="small muted">{d.pastNote}</p>
                <ul className={styles.list}>{pastList.map((c) => row(c, true))}</ul>
              </details>
            )}
          </>
        )}
      </section>

      {open && (
        <ReviewPanel
          key={open.id}
          cert={open}
          specialty={specialty}
          locale={locale}
          onClose={close}
          onSaved={replace}
          onDeleted={deletedInPanel}
          readOnly={readOnly}
          nurse={nurse}
          cycle={cycleOf(open)}
          today={today}
          own={own.length > 1 ? own : []}
          assignedTo={assignedOf(open)}
        />
      )}
    </>
  );
}

function BinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
