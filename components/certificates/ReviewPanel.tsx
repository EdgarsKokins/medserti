"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CmeCategory, CmeCertificate } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";
import { COUNTRY_CODES, countryCode, countryName, formatDate, parseNoteLines, STATUS_CLASS } from "./format";
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
  // older certificates hold an English name ("Latvia"); the select works with ISO codes
  country: countryCode(c.country) ?? c.country,
});

const toNum = (v: string) => (v.trim() === "" ? null : Number(v));

export default function ReviewPanel({
  cert,
  specialty,
  locale,
  onClose,
  onSaved,
  onDeleted,
  readOnly = false,
}: {
  cert: CmeCertificate;
  specialty: string;
  locale: Locale;
  onClose: () => void;
  onSaved: (c: CmeCertificate) => void;
  onDeleted: (id: string) => void;
  readOnly?: boolean;
}) {
  const dict = t(locale);
  const d = dict.review;
  const dialog = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const [initial] = useState<Editable>(() => pick(cert));
  const [f, setF] = useState<Editable>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<"discard" | "delete" | null>(null);
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => {
    setAsk(null);
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  // Native modal: focus trap, inert page and Escape come with showModal(). We add the scroll lock and focus return.
  useEffect(() => {
    const el = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    if (el && !el.open) el.showModal();
    return () => {
      root.style.overflow = prevOverflow;
      if (el?.open) el.close();
      opener?.focus?.();
    };
  }, []);

  function requestClose() {
    if (busy) return;
    if (dirty) setAsk("discard");
    else onClose();
  }

  async function save(status: "confirmed" | "needs_review") {
    setBusy(true);
    setError(null);
    setAsk(null);
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
    setBusy(true);
    setError(null);
    setAsk(null);
    const res = await fetch(`/api/certificates/${cert.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError(d.deleteError);
    onDeleted(cert.id);
  }

  const notes = useMemo(() => parseNoteLines(cert.parseNotes, dict), [cert.parseNotes, dict]);
  const countries = useMemo(() => {
    const [lv, ...rest] = COUNTRY_CODES;
    return [lv, ...rest.sort((a, b) => countryName(a, locale).localeCompare(countryName(b, locale), locale))];
  }, [locale]);
  const unknownCountry = f.country && !countryCode(f.country) ? f.country : null;
  // "found 3 of 3 fields" says how much the parser filled in; for photos the OCR text itself may be wrong, so we don't show it
  const fieldsFound = cert.confidence != null && !cert.contentType.startsWith("image/") ? Math.round(cert.confidence * 3) : null;
  const confirmed = cert.status === "confirmed";

  return (
    <dialog
      ref={dialog}
      className={styles.panel}
      aria-labelledby="review-title"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) requestClose();
        downOnBackdrop.current = false;
      }}
    >
      <div className={styles.panelScroll}>
        <div className={styles.panelHead}>
          <div>
            <h2 id="review-title" className={styles.panelTitle}>{d.title}</h2>
            <div className={styles.panelMeta}>
              <span className={STATUS_CLASS[cert.status]}>{dict.status[cert.status]}</span>
              <span>{cert.fileName}</span>
              <span>{d.uploaded(formatDate(cert.uploadedAt.slice(0, 10), locale))}</span>
              {fieldsFound != null && <span>{d.fieldsFound(fieldsFound)}</span>}
            </div>
          </div>
          <a className="btn" href={`/api/certificates/${cert.id}/file`} target="_blank" rel="noreferrer">
            {d.viewFile}
          </a>
        </div>

        {notes.lines.length > 0 && (
          <div className={`alert small ${styles.notes}`}>
            {notes.legacy ? (
              <>
                {locale !== "en" && <strong>{d.legacyNotesNote} </strong>}
                <span lang="en">{notes.lines[0]}</span>
              </>
            ) : (
              <>
                <strong>{d.notesNote}</strong>
                <ul className={styles.noteList}>
                  {notes.lines.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </>
            )}
          </div>
        )}

        <fieldset className="ro-fieldset" disabled={readOnly}>
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
            <select id="c-country" value={f.country ?? ""} onChange={(e) => set("country", e.target.value || null)}>
              <option value="">{d.countryNone}</option>
              {unknownCountry && <option value={unknownCountry}>{unknownCountry}</option>}
              {countries.map((c) => (
                <option key={c} value={c}>{countryName(c, locale)}</option>
              ))}
            </select>
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
        </fieldset>
      </div>

      <div className={styles.panelFoot}>
        {error && <div className={`alert alert-bad ${styles.footMsg}`} role="alert">{error}</div>}
        {readOnly ? (
          <div className={styles.footBtns}>
            <span className="small muted">{dict.demo.readOnly}</span>
            <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>{dict.demo.close}</button>
          </div>
        ) : ask ? (
          <div className={styles.ask} role="alertdialog" aria-labelledby="review-ask">
            <p id="review-ask" className={styles.askText}>
              {ask === "discard" ? d.discardQuestion : d.deleteConfirm(cert.title || cert.fileName)}
            </p>
            <div className={styles.footBtns}>
              {ask === "discard" ? (
                <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>{d.discard}</button>
              ) : (
                <button type="button" className="btn btn-danger" disabled={busy} onClick={remove} autoFocus>{d.delete}</button>
              )}
              <button type="button" className="btn" onClick={() => setAsk(null)}>
                {ask === "discard" ? d.keepEditing : d.cancel}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.footBtns}>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save("confirmed")}>
              {busy ? d.saving : confirmed ? d.saveConfirmed : d.confirm}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => save("needs_review")}>{d.saveDraft}</button>
            <button type="button" className="btn" disabled={busy} onClick={requestClose}>{d.cancel}</button>
            <button type="button" className={`btn btn-danger ${styles.deleteBtn}`} disabled={busy} onClick={() => setAsk("delete")}>
              {d.delete}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
