"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NURSE_TOPICS, type CmeCategory, type CmeCertificate, type ConfidenceField, type NurseTopic, type ParseNote, type TipCandidate } from "@/lib/types";
import { registryUrl } from "@/lib/parse/tipMatch";
import { daysBetween, estimateAbroad } from "@/lib/abroad";
import { AbroadResult } from "@/components/courses/AbroadEstimate";
import { needsApprovalCheck, nurseTopicOf } from "@/lib/nurse";
import { isUnsure } from "@/lib/parse/confidence";
import { inHours, type Locale } from "@/lib/locale";
import { useDict } from "@/components/i18n/DictProvider";
import ReportProblem from "@/components/monitoring/ReportProblem";
import { reportFailure } from "@/components/monitoring/report";
import { trackEvent } from "@/components/monitoring/track";
import { COUNTRY_CODES, countryCode, countryName, parseNoteLines, STATUS_CLASS } from "./format";
import { formatDate, formatNumber } from "@/lib/format";
import { CHECKED_FIELDS, dateNotice, fieldErrors, MISSING, type CheckedField } from "./validate";
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
  | "nurseTopic"
  | "approvalId"
  | "country"
>;

const pick = (c: CmeCertificate, nurse: boolean): Editable => ({
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
  // doctors never send it, so their saves leave it as the parser set it
  ...(nurse ? { nurseTopic: nurseTopicOf(c) } : {}),
  approvalId: c.approvalId,
  // older certificates hold an English name ("Latvia"); the select works with ISO codes
  country: countryCode(c.country) ?? c.country,
});

const toNum = (v: string) => (v.trim() === "" ? null : Number(v));

const FIELD_IDS: Record<CheckedField, string> = {
  title: "c-title",
  date: "c-date",
  endDate: "c-end",
  points: "c-points",
  academicHours: "c-hours",
  practicalHours: "c-prac",
};

export default function ReviewPanel({
  cert,
  specialty,
  locale,
  onClose,
  onSaved,
  onDeleted,
  readOnly = false,
  nurse = false,
  cycle,
  today,
}: {
  cert: CmeCertificate;
  specialty: string;
  locale: Locale;
  onClose: () => void;
  onSaved: (c: CmeCertificate) => void;
  onDeleted: (id: string) => void;
  readOnly?: boolean;
  /** nurses: a Reg. 630 topic instead of the specialty and emergency checkboxes, hours instead of TIP */
  nurse?: boolean;
  /** the user's certificate window (lib/rules certificateWindow), for the warning under the date */
  cycle: { start: string | null; end: string | null };
  /** YYYY-MM-DD in Latvia: no date after it */
  today: string;
}) {
  const base = useDict();
  const dict = nurse ? inHours(base) : base;
  const d = dict.review;
  const dialog = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const [initial] = useState<Editable>(() => pick(cert, nurse));
  const [f, setF] = useState<Editable>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<"discard" | "delete" | "duplicate" | null>(null);
  // the field the server rejected, with its message, until the user changes it
  const [serverField, setServerField] = useState<{ field: string; message: string } | null>(null);
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => {
    setAsk(null);
    if (serverField?.field === k) setServerField(null);
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const errors = fieldErrors(f, today);
  const blocking = (status: "confirmed" | "needs_review") =>
    CHECKED_FIELDS.filter((k) => errors[k] && (status === "confirmed" || !MISSING.has(errors[k]!)));
  const notice = dateNotice(f.date, cycle, today);
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
    setError(null);
    setAsk(null);
    const bad = blocking(status);
    if (bad.length) {
      setError(d.invalidSummary(bad.length));
      document.getElementById(FIELD_IDS[bad[0]])?.focus();
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/certificates/${cert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // a nurse's emergency topic is the emergency-care flag too, so both views of the certificate agree
      body: JSON.stringify({ ...f, ...(nurse ? { emergencyCare: f.nurseTopic === "emergency" } : {}), status }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res || !res.ok) reportFailure("certSave", res);
    if (!res) return setError(dict.common.networkError);
    if (!res.ok) {
      if (typeof body.field === "string" && body.error) setServerField({ field: body.field, message: body.error });
      return setError(body.error ?? d.saveError);
    }
    if (status === "confirmed") trackEvent("Certificate confirmed");
    onSaved(body.certificate);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setAsk(null);
    const res = await fetch(`/api/certificates/${cert.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) reportFailure("certDelete", res);
    if (!res) return setError(dict.common.networkError);
    if (!res.ok) return setError(d.deleteError);
    onDeleted(cert.id);
  }

  // a register event the user picked: its points and approval number, and its days when the certificate gave none
  const pickCandidate = (c: TipCandidate) => {
    setAsk(null);
    setF((prev) => ({
      ...prev,
      points: c.tip,
      approvalId: c.approvalId,
      ...(prev.date || !c.start ? {} : { date: c.start, endDate: c.end && c.end !== c.start ? c.end : null }),
    }));
  };
  const lookup = cert.tipLookup?.candidates.length ? cert.tipLookup : null;
  // a course abroad: the same estimate the /courses estimator gives, from what is in the form now (lib/abroad.ts)
  const notesByCode = useMemo(() => {
    try {
      return new Map((JSON.parse(cert.parseNotes ?? "[]") as ParseNote[]).map((n) => [n.code, n]));
    } catch {
      return new Map<string, ParseNote>(); // older certificates hold plain text notes
    }
  }, [cert.parseNotes]);
  const abroad = !nurse && f.category === "training_abroad" && !!f.country && countryCode(f.country) !== "LV"
    ? estimateAbroad({
        // points the parser estimated from hours are not the organizer's credits
        credits: notesByCode.has("derivedAbroad") && f.points === initial.points ? null : f.points,
        hours: f.academicHours,
        // the parser notes whether the certificate said academic hours; unknown counts as academic (the smaller estimate)
        academic: (notesByCode.get("derivedAbroad") ?? notesByCode.get("abroadRecalc"))?.p?.academic !== false,
        days: daysBetween(f.date, f.endDate),
      })
    : null;

  const notes = useMemo(() => parseNoteLines(cert.parseNotes, dict), [cert.parseNotes, dict]);
  const countries = useMemo(() => {
    const [lv, ...rest] = COUNTRY_CODES;
    return [lv, ...rest.sort((a, b) => countryName(a, locale).localeCompare(countryName(b, locale), locale))];
  }, [locale]);
  const unknownCountry = f.country && !countryCode(f.country) ? f.country : null;
  // "found 3 of 3 fields" says how much the parser filled in; for photos the OCR text itself may be wrong, so we don't show it
  const fieldsFound = cert.confidence != null && !cert.contentType.startsWith("image/") ? Math.round(cert.confidence * 3) : null;
  const confirmed = cert.status === "confirmed";
  const duplicate = !!cert.duplicateOf && !confirmed;
  // the parser was unsure of this value and the user has not changed it yet
  const check = (k: ConfidenceField) =>
    isUnsure(cert, k) && f[k] === initial[k] ? <span className={`badge badge-warn ${styles.checkMark}`}>{d.checkField}</span> : null;
  // red frame and one line under a field that is wrong or missing, so the user sees what blocks a confirm
  const invalid = (k: CheckedField) => {
    if (readOnly) return null;
    if (serverField?.field === k) return serverField.message;
    const e = errors[k];
    return e ? d.errors[e] : null;
  };
  const fieldProps = (k: CheckedField) => {
    const msg = invalid(k);
    return msg
      ? { "aria-invalid": true as const, "aria-describedby": `${FIELD_IDS[k]}-err`, className: styles.invalid }
      : {};
  };
  const fieldError = (k: CheckedField) => {
    const msg = invalid(k);
    return msg ? <span id={`${FIELD_IDS[k]}-err`} className={styles.fieldError}>{msg}</span> : null;
  };

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
              <span className={cert.duplicateOf && !confirmed ? "badge badge-bad" : STATUS_CLASS[cert.status]}>
                {cert.duplicateOf && !confirmed
                  ? d.duplicate
                  : cert.status === "confirmed" && cert.autoConfirmed
                    ? d.autoConfirmed
                    : dict.status[cert.status]}
              </span>
              <span>{cert.fileName}</span>
              <span>{d.uploaded(formatDate(cert.uploadedAt.slice(0, 10), locale))}</span>
              {fieldsFound != null && <span>{d.fieldsFound(fieldsFound)}</span>}
            </div>
          </div>
          <a className="btn" href={`/api/certificates/${cert.id}/file`} target="_blank" rel="noreferrer">
            {d.viewFile}
          </a>
        </div>

        {cert.duplicateOf && !confirmed && (
          <div className={`alert small ${styles.notes}`} role="note">{d.duplicateNote}</div>
        )}

        {nurse && needsApprovalCheck(f) && (
          <div className={`alert small ${styles.notes}`} role="note">{d.approvalCheck}</div>
        )}

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

        {lookup && (
          <div className={`alert small ${styles.notes}`} role="note">
            <strong>{lookup.status === "match" ? d.registryMatched : d.registryPick}</strong>
            <ul className={styles.registryList}>
              {lookup.candidates.map((c) => {
                const chosen = f.approvalId === c.approvalId && f.points === c.tip;
                return (
                  <li key={c.approvalId} className={styles.registryItem}>
                    <div className={styles.registryText}>
                      <span>{c.title}</span>
                      <span className="muted">
                        {[
                          c.approvalId,
                          c.start && (c.end ? `${formatDate(c.start, locale)} - ${formatDate(c.end, locale)}` : formatDate(c.start, locale)),
                          c.organizer,
                          c.tip != null && `${formatNumber(c.tip, 2)} TIP`,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <div className={styles.registryActions}>
                      <a href={registryUrl(c)} target="_blank" rel="noreferrer">{d.registryOpen}</a>
                      {!readOnly && (
                        <button type="button" className="btn" disabled={chosen} aria-pressed={chosen} onClick={() => pickCandidate(c)}>
                          {chosen ? d.registryUsed : d.registryUse}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {abroad && (
          <div className={`alert small ${styles.notes}`} role="note">
            <AbroadResult estimate={abroad} />
          </div>
        )}

        <fieldset className="ro-fieldset" disabled={readOnly}>
        <div className={`form-grid ${styles.panelBody}`}>
          <div className={`field ${styles.wide}`}>
            <label htmlFor="c-title">{d.fTitle}{check("title")}</label>
            <input id="c-title" value={f.title} maxLength={300} onChange={(e) => set("title", e.target.value)} {...fieldProps("title")} />
            {fieldError("title")}
          </div>
          <div className="field">
            <label htmlFor="c-org">{d.fOrganizer}{check("organizer")}</label>
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
            <label htmlFor="c-date">{d.fDate}{check("date")}</label>
            <input id="c-date" type="date" max={today} value={f.date ?? ""} onChange={(e) => set("date", e.target.value || null)} {...fieldProps("date")} />
            {fieldError("date")}
            {notice && (
              <p className={`alert small ${styles.dateNote}`} role="note">
                {notice.kind === "older5"
                  ? nurse ? d.older5Nurse : d.older5
                  : notice.kind === "beforePeriod"
                    ? d.beforePeriod(formatDate(notice.date, locale))
                    : d.afterPeriod(formatDate(notice.date, locale))}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="c-end">{d.fEndDate}</label>
            <input id="c-end" type="date" min={f.date ?? undefined} max={today} value={f.endDate ?? ""} onChange={(e) => set("endDate", e.target.value || null)} {...fieldProps("endDate")} />
            {fieldError("endDate")}
          </div>
          <div className="field">
            <label htmlFor="c-points">{d.fPoints}{check("points")}</label>
            <input id="c-points" type="number" min={0} max={1000} step="0.5" value={f.points ?? ""} onChange={(e) => set("points", toNum(e.target.value))} {...fieldProps("points")} />
            {fieldError("points")}
          </div>
          <div className="field">
            <label htmlFor="c-hours">{d.fHours}</label>
            <input id="c-hours" type="number" min={0} max={1000} step="0.5" value={f.academicHours ?? ""} onChange={(e) => set("academicHours", toNum(e.target.value))} {...fieldProps("academicHours")} />
            {fieldError("academicHours")}
          </div>
          <div className="field">
            <label htmlFor="c-approval">{d.fApproval}</label>
            <input id="c-approval" value={f.approvalId ?? ""} onChange={(e) => set("approvalId", e.target.value || null)} />
          </div>
          <div className="field">
            <label htmlFor="c-country">{d.fCountry}{check("country")}</label>
            <select id="c-country" value={f.country ?? ""} onChange={(e) => set("country", e.target.value || null)}>
              <option value="">{d.countryNone}</option>
              {unknownCountry && <option value={unknownCountry}>{unknownCountry}</option>}
              {countries.map((c) => (
                <option key={c} value={c}>{countryName(c, locale)}</option>
              ))}
            </select>
          </div>
          {nurse ? (
            <div className="field">
              <label htmlFor="c-topic">{d.fTopic}</label>
              <select id="c-topic" value={f.nurseTopic ?? "other"} aria-describedby="c-topic-hint" onChange={(e) => set("nurseTopic", e.target.value as NurseTopic)}>
                {NURSE_TOPICS.map((k) => (
                  <option key={k} value={k}>{d.topics[k]}</option>
                ))}
              </select>
              <span id="c-topic-hint" className="small muted">{d.fTopicHint}</span>
            </div>
          ) : (
            <>
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
                <input id="c-prac" type="number" min={0} max={1000} step="0.5" value={f.practicalHours ?? ""} onChange={(e) => set("practicalHours", toNum(e.target.value))} {...fieldProps("practicalHours")} />
                {fieldError("practicalHours")}
              </div>
            )}
            </>
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
              {ask === "discard" ? d.discardQuestion : ask === "duplicate" ? d.duplicateConfirm : d.deleteConfirm(cert.title || cert.fileName)}
            </p>
            <div className={styles.footBtns}>
              {ask === "discard" ? (
                <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>{d.discard}</button>
              ) : ask === "duplicate" ? (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save("confirmed")} autoFocus>{d.duplicateConfirmYes}</button>
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
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              // a flagged duplicate is not counted; confirming it counts the same certificate twice, so ask once
              onClick={() => (duplicate ? setAsk("duplicate") : save("confirmed"))}
            >
              {busy ? d.saving : confirmed ? d.saveConfirmed : d.confirm}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => save("needs_review")}>{d.saveDraft}</button>
            <button type="button" className="btn" disabled={busy} onClick={requestClose}>{d.cancel}</button>
            <button type="button" className={`btn btn-danger ${styles.deleteBtn}`} disabled={busy} onClick={() => setAsk("delete")}>
              {d.delete}
            </button>
          </div>
        )}
        <div className={styles.footReport}>
          <ReportProblem certId={cert.id} demo={readOnly} />
        </div>
      </div>
    </dialog>
  );
}
