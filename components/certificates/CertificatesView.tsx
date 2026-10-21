"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rowConfirmEligible } from "@/lib/parse/confidence";
import { useRouter } from "next/navigation";
import type { CmeCertificate } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";
import { displayOrganizer, formatDate, formatNumber, STATUS_CLASS } from "./format";
import UploadZone from "./UploadZone";
import ReviewPanel from "./ReviewPanel";
import FileLink from "./FileLink";
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
}: {
  initial: CmeCertificate[];
  specialty: string;
  locale: Locale;
  /** the user's certificate window and today's date (server), for the in-row "Apstiprināt" check */
  cycle: { start: string | null; end: string | null };
  today: string;
  /** demo account: no upload, the panel only shows the fields */
  readOnly?: boolean;
}) {
  const dict = t(locale);
  const d = dict.certs;
  const router = useRouter();
  const [certs, setCerts] = useState(() => sortCerts(initial));
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const open = certs.find((c) => c.id === openId) ?? null;

  const waiting = useMemo(() => certs.filter((c) => c.status !== "confirmed").length, [certs]);
  const confirmedPoints = useMemo(
    () => certs.filter((c) => c.status === "confirmed").reduce((s, c) => s + (c.points ?? 0), 0),
    [certs],
  );

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

  async function quickConfirm(c: CmeCertificate, method: "POST" | "DELETE") {
    setBusyId(c.id);
    const res = await fetch(`/api/certificates/${c.id}/confirm`, { method }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusyId(null);
    const name = c.title || c.fileName;
    if (!res?.ok || !body.certificate) {
      setLive(d.rowConfirmError);
      return;
    }
    setCerts((prev) => sortCerts(prev.map((p) => (p.id === c.id ? body.certificate : p))));
    window.clearTimeout(undoTimer.current);
    if (method === "POST") {
      setUndo(c.id);
      setLive(d.rowConfirmed(name));
      undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
    } else {
      setUndo(null);
      setLive(d.rowUndone(name));
    }
  }

  const onUploaded = useCallback(
    (added: CmeCertificate[]) => {
      setCerts((prev) => sortCerts([...added, ...prev.filter((p) => !added.some((a) => a.id === p.id))]));
      router.refresh();
    },
    [router],
  );
  const close = useCallback(() => setOpenId(null), []);

  function replace(c: CmeCertificate) {
    setCerts((prev) => sortCerts(prev.map((p) => (p.id === c.id ? c : p))));
    setOpenId(null);
    router.refresh();
  }

  function removed(id: string) {
    setCerts((prev) => prev.filter((p) => p.id !== id));
    setOpenId(null);
    router.refresh();
  }

  const shown = onlyWaiting && waiting > 0 ? certs.filter((c) => c.status !== "confirmed") : certs;

  return (
    <>
      <p className="sr-only" aria-live="polite" role="status">{live}</p>
      {waiting > 0 && (
        <p className={styles.waiting}>
          <span className="badge badge-warn">{d.waitingShort(waiting)}</span>
          <button type="button" className={styles.linkBtn} onClick={() => setOnlyWaiting((v) => !v)} aria-pressed={onlyWaiting}>
            {onlyWaiting ? d.showAll : d.showWaiting}
          </button>
        </p>
      )}

      {readOnly ? (
        <p className="alert">{dict.demo.uploadOff}</p>
      ) : (
        <UploadZone onUploaded={onUploaded} locale={locale} />
      )}

      <section aria-labelledby="certs-title">
        <div className={styles.listHead}>
          <h2 id="certs-title">{d.allTitle}</h2>
          <span className="small muted">{d.summary(certs.length, formatNumber(confirmedPoints, locale))}</span>
        </div>
        {certs.length === 0 ? (
          <p className="muted">{d.empty}</p>
        ) : (
          <ul className={styles.list}>
            <li className={styles.colHead} aria-hidden>
              <span>{d.colDate}</span>
              <span>{d.colTitle}</span>
              <span className={styles.numHead}>{d.colPoints}</span>
              <span>{d.colStatus}</span>
              <span />
            </li>
            {shown.map((c) => {
              const attention = c.status !== "confirmed";
              const org = c.organizer ? displayOrganizer(c.organizer) : "";
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
                      {[org, dict.categories[c.category]].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={styles.points}>
                    {c.points != null && <>+{formatNumber(c.points, locale)} <span className={styles.unit}>TIP</span></>}
                  </span>
                  <span className={styles.status}>
                    <span className={STATUS_CLASS[c.status]}>
                      {c.status === "confirmed" && c.autoConfirmed ? dict.review.autoConfirmed : dict.status[c.status]}
                    </span>
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
                  </span>
                </li>
              );
            })}
          </ul>
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
        />
      )}
    </>
  );
}
