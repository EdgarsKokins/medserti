"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { mergeStored } from "./merge";
import { forgetStored, getUploadSnapshot, subscribeUploads } from "./uploadStore";
import { reportFailure } from "@/components/monitoring/report";
import { trackEvent } from "@/components/monitoring/track";
import styles from "./certificates.module.css";

/** how long "Apstiprināts · Atsaukt" stays after an in-row confirm */
const UNDO_MS = 6000;

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
}: {
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
  const open = certs.find((c) => c.id === openId) ?? null;

  const waiting = useMemo(() => certs.filter((c) => c.status !== "confirmed").length, [certs]);
  // why each certificate is left out of the progress, by the same rule computeProgress applies on the dashboard
  const reasons = useMemo(() => {
    const ids = new Set(certs.map((c) => c.id));
    return new Map(certs.map((c) => [c.id, exclusionReason(c, ids, cycle)] as const));
  }, [certs, cycle]);
  const confirmedPoints = useMemo(
    () => certs.filter((c) => c.status === "confirmed" && !reasons.get(c.id)).reduce((s, c) => s + (c.points ?? 0), 0),
    [certs, reasons],
  );
  const [infoId, setInfoId] = useState<string | null>(null);
  const outsideCount = useMemo(
    () => certs.filter((c) => { const r = reasons.get(c.id); return r === "beforeWindow" || r === "afterWindow"; }).length,
    [certs, reasons],
  );
  const reasonText = (r: ExclusionReason) =>
    r === "beforeWindow"
      ? (nurse ? d.reasons.beforeWindowNurse : d.reasons.beforeWindow)(formatDate(cycle.start!, locale))
      : r === "afterWindow"
        ? d.reasons.afterWindow(formatDate(cycle.end!, locale))
        : d.reasons[r];

  // in-row "Apstiprināt": confirm without the panel, with a few seconds to undo; the server checks again
  const [undo, setUndo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const undoTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  const quick = useMemo(
    () => new Set(certs.filter((c) => rowConfirmEligible(c, certs, cycle, today)).map((c) => c.id)),
    [certs, cycle, today],
  );

  // bin icon in the row: asks once in place, then deletes (record and file, as the review panel's Dzēst does)
  const [askDelete, setAskDelete] = useState<string | null>(null);
  useEffect(() => {
    if (!askDelete) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAskDelete(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askDelete]);

  async function deleteRow(c: CmeCertificate) {
    setBusyId(c.id);
    const res = await fetch(`/api/certificates/${c.id}`, { method: "DELETE" }).catch(() => null);
    setBusyId(null);
    setAskDelete(null);
    const name = c.title || c.fileName;
    if (!res?.ok) {
      reportFailure("certDeleteRow", res);
      setLive(d.rowDeleteError);
      return;
    }
    setLive(d.rowDeleted(name));
    removed(c.id);
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

  function replace(c: CmeCertificate) {
    setCerts((prev) => sortCerts(prev.map((p) => (p.id === c.id ? c : p))));
    setOpenId(null);
    router.refresh();
  }

  function removed(id: string) {
    forgetStored(id);
    setCerts((prev) => prev.filter((p) => p.id !== id));
    setOpenId(null);
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
    return (
      <li
        key={c.id}
        className={`${styles.item} ${attention ? (c.status === "failed" ? styles.itemBad : styles.itemWarn) : ""} ${!readOnly && quick.has(c.id) ? styles.itemQuick : ""}`}
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
          <span className={styles.meta}>
            {[org, nurse ? dict.review.topics[nurseTopicOf(c)] : dict.categories[c.category]].filter(Boolean).join(" · ")}
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
          {!readOnly && askDelete === c.id ? (
            <span className={styles.deleteAsk} role="group" aria-label={d.rowDeleteAsk}>
              <span className="small">{d.rowDeleteAsk}</span>
              <button type="button" className={`btn btn-danger ${styles.smallBtn}`} disabled={busyId === c.id} onClick={() => deleteRow(c)} autoFocus>
                {d.rowDeleteYes}
              </button>
              <button type="button" className={styles.linkBtn} onClick={() => setAskDelete(null)}>
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
            <button type="button" className={styles.binBtn} aria-label={d.rowDelete(c.title || c.fileName)} title={d.rowDeleteYes} onClick={() => setAskDelete(c.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
          </>
          )}
        </span>
        {infoOpen && (
          <p id={`why-${c.id}`} className={`alert small ${styles.reason}`} role="note">
            {reasonText(explain)}
          </p>
        )}
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

      <section aria-labelledby="certs-title">
        <div className={styles.listHead}>
          <h2 id="certs-title">{d.allTitle}</h2>
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
              <details className={styles.group}>
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
          onDeleted={removed}
          readOnly={readOnly}
          nurse={nurse}
          cycle={cycle}
          today={today}
        />
      )}
    </>
  );
}
