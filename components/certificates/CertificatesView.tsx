"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CmeCertificate } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";
import { displayOrganizer, formatDate, formatNumber, STATUS_CLASS } from "./format";
import UploadZone from "./UploadZone";
import ReviewPanel from "./ReviewPanel";
import ConfirmChecked from "./ConfirmChecked";
import { confirmCheckedEligible } from "@/lib/parse/confidence";
import styles from "./certificates.module.css";

const sortCerts = (list: CmeCertificate[]) =>
  [...list].sort((a, b) => (b.date ?? b.uploadedAt).localeCompare(a.date ?? a.uploadedAt));

export default function CertificatesView({
  initial,
  specialty,
  locale,
  window,
  today,
  readOnly = false,
}: {
  initial: CmeCertificate[];
  specialty: string;
  locale: Locale;
  /** the user's certificate window and today's date (server), for "Confirm all checked" */
  window: { start: string | null; end: string | null };
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
  const checked = useMemo(() => certs.filter((c) => confirmCheckedEligible(c, certs, window, today)), [certs, window, today]);
  const confirmedPoints = useMemo(
    () => certs.filter((c) => c.status === "confirmed").reduce((s, c) => s + (c.points ?? 0), 0),
    [certs],
  );

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
        <>
          <UploadZone onUploaded={onUploaded} locale={locale} />
          <ConfirmChecked items={checked} locale={locale} onConfirmed={onUploaded} />
        </>
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
                <li key={c.id} className={`${styles.item} ${attention ? (c.status === "failed" ? styles.itemBad : styles.itemWarn) : ""}`}>
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
                  </span>
                  <span className={styles.actions}>
                    <a className={styles.linkBtn} href={`/api/certificates/${c.id}/file`} target="_blank" rel="noreferrer">
                      {d.file}
                    </a>
                    {readOnly ? (
                      <button type="button" className={styles.linkBtn} onClick={() => setOpenId(c.id)}>
                        {dict.demo.view}
                      </button>
                    ) : attention ? (
                      <button type="button" className={`btn btn-primary ${styles.smallBtn}`} onClick={() => setOpenId(c.id)}>
                        {d.review}
                      </button>
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
