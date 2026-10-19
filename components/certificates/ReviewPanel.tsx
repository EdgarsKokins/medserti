"use client";

import { useEffect, useState } from "react";
import type { CmeCategory, CmeCertificate } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";
import { formatDate, STATUS_CLASS } from "./format";
import styles from "./certificates.module.css";

type Editable = Pick<
  CmeCertificate,
  | "title"
  | "organizer"
  | "date"
  | "endDate"
  | "points"
  | "academicHours"
  | "category"
  | "inSpecialty"
  | "emergencyCare"
  | "practicalHours"
  | "approvalId"
  | "country"
>;

const pick = (c: CmeCertificate): Editable => ({
  title: c.title,
  organizer: c.organizer,
  date: c.date,
  endDate: c.endDate,
  points: c.points,
  academicHours: c.academicHours,
  category: c.category,
  inSpecialty: c.inSpecialty,
  emergencyCare: c.emergencyCare,
  practicalHours: c.practicalHours,
  approvalId: c.approvalId,
  country: c.country,
});

const toNum = (v: string) => (v.trim() === "" ? null : Number(v));

export default function ReviewPanel({
  cert,
  specialty,
  locale,
  onClose,
  onSaved,
  onDeleted,
}: {
  cert: CmeCertificate;
  specialty: string;
  locale: Locale;
  onClose: () => void;
  onSaved: (c: CmeCertificate) => void;
  onDeleted: (id: string) => void;
}) {
  const dict = t(locale);
  const d = dict.review;
  const [f, setF] = useState<Editable>(() => pick(cert));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setF((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save(status: "confirmed" | "needs_review") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/certificates/${cert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, status }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? d.saveError);
    onSaved(body.certificate);
  }

  async function remove() {
    if (!window.confirm(d.deleteConfirm(cert.title || cert.fileName))) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/certificates/${cert.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError(d.deleteError);
    onDeleted(cert.id);
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className={styles.panelHead}>
          <div>
            <h2 id="review-title" className={styles.panelTitle}>{d.title}</h2>
            <div className={styles.panelMeta}>
              <span className={STATUS_CLASS[cert.status]}>{dict.status[cert.status]}</span>
              <span>{cert.fileName}</span>
              <span>{d.uploaded(formatDate(cert.uploadedAt.slice(0, 10), locale))}</span>
              {cert.confidence != null && <span>{d.confidence(Math.round(cert.confidence * 100))}</span>}
            </div>
          </div>
          <a className="btn" href={`/api/certificates/${cert.id}/file`} target="_blank" rel="noreferrer">
            {d.viewFile}
          </a>
        </div>

        {cert.parseNotes && (
          <div className={`alert small ${styles.notes}`} lang="en">
            {locale !== "en" && <strong>{d.notesNote} </strong>}
            {cert.parseNotes}
          </div>
        )}

        <div className={`form-grid ${styles.panelBody}`}>
          <div className={`field ${styles.wide}`}>
            <label htmlFor="c-title">{d.fTitle}</label>
            <input id="c-title" value={f.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-org">{d.fOrganizer}</label>
            <input id="c-org" value={f.organizer} onChange={(e) => set("organizer", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-cat">{d.fCategory}</label>
            <select id="c-cat" value={f.category} onChange={(e) => set("category", e.target.value as CmeCategory)}>
              {Object.entries(dict.categories).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-date">{d.fDate}</label>
            <input id="c-date" type="date" value={f.date ?? ""} onChange={(e) => set("date", e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="c-end">{d.fEndDate}</label>
            <input id="c-end" type="date" value={f.endDate ?? ""} onChange={(e) => set("endDate", e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="c-points">{d.fPoints}</label>
            <input id="c-points" type="number" min={0} step="0.5" value={f.points ?? ""} onChange={(e) => set("points", toNum(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="c-hours">{d.fHours}</label>
            <input id="c-hours" type="number" min={0} step="0.5" value={f.academicHours ?? ""} onChange={(e) => set("academicHours", toNum(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="c-approval">{d.fApproval}</label>
            <input id="c-approval" value={f.approvalId ?? ""} onChange={(e) => set("approvalId", e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="c-country">{d.fCountry}</label>
            <input id="c-country" value={f.country ?? ""} placeholder={d.countryPlaceholder} onChange={(e) => set("country", e.target.value || null)} />
          </div>
          <div className={styles.checkRow}>
            <input id="c-spec" type="checkbox" checked={f.inSpecialty} onChange={(e) => set("inSpecialty", e.target.checked)} />
            <label htmlFor="c-spec">{d.fInSpecialty(specialty)}</label>
          </div>
          <div className={styles.checkRow}>
            <input id="c-emerg" type="checkbox" checked={f.emergencyCare} onChange={(e) => set("emergencyCare", e.target.checked)} />
            <label htmlFor="c-emerg">{d.fEmergency}</label>
          </div>
          {f.emergencyCare && (
            <div className="field">
              <label htmlFor="c-prac">{d.fPractical}</label>
              <input id="c-prac" type="number" min={0} step="0.5" value={f.practicalHours ?? ""} onChange={(e) => set("practicalHours", toNum(e.target.value))} />
            </div>
          )}
        </div>

        {error && <div className={`alert alert-bad ${styles.notes}`}>{error}</div>}

        <div className={styles.panelFoot}>
          <button className="btn btn-primary" disabled={busy} onClick={() => save("confirmed")}>
            {busy ? d.saving : d.confirm}
          </button>
          <button className="btn" disabled={busy} onClick={() => save("needs_review")}>{d.saveDraft}</button>
          <button className="btn" disabled={busy} onClick={onClose}>{d.cancel}</button>
          <button className={`btn btn-danger ${styles.deleteBtn}`} disabled={busy} onClick={remove}>
            {d.delete}
          </button>
        </div>
      </div>
    </div>
  );
}
