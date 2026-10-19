"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CmeCertificate } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";
import { formatNumber, formatRange, STATUS_CLASS } from "./format";
import UploadZone from "./UploadZone";
import ReviewPanel from "./ReviewPanel";
import styles from "./certificates.module.css";

const sortCerts = (list: CmeCertificate[]) =>
  [...list].sort((a, b) => (b.date ?? b.uploadedAt).localeCompare(a.date ?? a.uploadedAt));

export default function CertificatesView({
  initial,
  specialty,
  locale,
}: {
  initial: CmeCertificate[];
  specialty: string;
  locale: Locale;
}) {
  const dict = t(locale);
  const d = dict.certs;
  const router = useRouter();
  const [certs, setCerts] = useState(() => sortCerts(initial));
  const [openId, setOpenId] = useState<string | null>(null);
  const open = certs.find((c) => c.id === openId) ?? null;

  const waiting = useMemo(() => certs.filter((c) => c.status !== "confirmed").length, [certs]);
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

  return (
    <>
      {waiting > 0 && (
        <div className="alert">
          {d.waiting(waiting)}
        </div>
      )}

      <UploadZone onUploaded={onUploaded} locale={locale} />

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{d.allTitle}</h2>
          <span className="small muted">
            {d.summary(certs.length, formatNumber(confirmedPoints, locale))}
          </span>
        </div>
        {certs.length === 0 ? (
          <p className="muted">{d.empty}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{d.colDate}</th>
                  <th>{d.colTitle}</th>
                  <th>{d.colOrganizer}</th>
                  <th>{d.colCategory}</th>
                  <th className="num">{d.colPoints}</th>
                  <th>{d.colStatus}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.id} className={c.status === "needs_review" ? styles.reviewRow : undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatRange(c, locale) || <span className="muted">{d.noDate}</span>}</td>
                    <td className={styles.titleCell}>{c.title || <span className="muted">{c.fileName}</span>}</td>
                    <td>{c.organizer}</td>
                    <td>{dict.categories[c.category]}</td>
                    <td className="num">{formatNumber(c.points, locale)}</td>
                    <td>
                      <span className={STATUS_CLASS[c.status]}>{dict.status[c.status]}</span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <a className="btn" href={`/api/certificates/${c.id}/file`} target="_blank" rel="noreferrer">
                          {d.file}
                        </a>
                        <button className={c.status === "confirmed" ? "btn" : "btn btn-primary"} onClick={() => setOpenId(c.id)}>
                          {c.status === "confirmed" ? d.edit : d.review}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <ReviewPanel
          key={open.id}
          cert={open}
          specialty={specialty}
          locale={locale}
          onClose={close}
          onSaved={replace}
          onDeleted={removed}
        />
      )}
    </>
  );
}
