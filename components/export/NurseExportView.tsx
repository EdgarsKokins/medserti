"use client";

import { useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { t, type Locale } from "@/lib/i18n";
import { NURSE_RULES } from "@/lib/rules";
import { buildNurseChecklist, buildReRegistration, toBlob, type NurseExportCertificate, type NursePerson } from "@/lib/export/docs";
import { MAX, finalProblem, liveProblem, type Problem } from "@/lib/export/validate";
import { addCertificateFiles, saveBlob, slug } from "./zip";
import s from "./export.module.css";

export type NurseExportRow = NurseExportCertificate & { id: string; fileName: string };

type TextKey = "firstName" | "lastName" | "practitionerId" | "address" | "phone" | "email";
const SPEC: Record<TextKey, { kind: "name" | "practitionerId" | "phone" | "email" | "text"; required: boolean; max: number }> = {
  firstName: { kind: "name", required: true, max: MAX.name },
  lastName: { kind: "name", required: true, max: MAX.name },
  practitionerId: { kind: "practitionerId", required: false, max: MAX.practitionerId },
  address: { kind: "text", required: true, max: MAX.address },
  phone: { kind: "phone", required: true, max: MAX.phone },
  email: { kind: "email", required: true, max: MAX.email },
};

/**
 * Nurses re-register with the Health Inspectorate, not LĀB: one application (Reg. 630 Annex 4) with the course
 * table of item 9, the certificate copies and a checklist of hours per topic. Built in the browser like the LĀB export.
 */
export default function NurseExportView({
  locale,
  rows,
  unconfirmed,
  registrationUntil,
  profession,
  prefill,
}: {
  locale: Locale;
  rows: NurseExportRow[];
  unconfirmed: number;
  registrationUntil: string | null;
  /** profession as written in the register (Latvian) */
  profession: string;
  prefill: { firstName: string; lastName: string; email: string; practitionerId: string };
}) {
  const d = t(locale).exportDocs;
  const [f, setF] = useState<NursePerson>({
    firstName: prefill.firstName.slice(0, MAX.name),
    lastName: prefill.lastName.slice(0, MAX.name),
    email: prefill.email.slice(0, MAX.email),
    practitionerId: prefill.practitionerId.slice(0, MAX.practitionerId),
    address: "",
    phone: "",
    notifyBy: "email",
  });
  const [errors, setErrors] = useState<Record<string, Problem>>({});
  const [formError, setFormError] = useState(false);
  const [files, setFiles] = useState<{ busy: boolean; done: number; msg: string | null; warn: boolean }>({ busy: false, done: 0, msg: null, warn: false });
  const [state, setState] = useState<{ busy: boolean; done: number; total: number; msg: string | null; warn: boolean }>({
    busy: false,
    done: 0,
    total: 0,
    msg: null,
    warn: false,
  });
  const set = <K extends keyof NursePerson>(k: K, v: NursePerson[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    const spec = SPEC[k as TextKey];
    const p = spec && spec.kind !== "email" && spec.kind !== "text" ? liveProblem(spec.kind, String(v)) : null;
    setErrors((e) => {
      const n = { ...e };
      if (p) n[k] = p;
      else delete n[k];
      return n;
    });
  };

  async function download(ev: React.FormEvent) {
    ev.preventDefault();
    const e: Record<string, Problem> = {};
    for (const k of Object.keys(SPEC) as TextKey[]) {
      const p = finalProblem(SPEC[k].kind, f[k], SPEC[k].required, SPEC[k].max);
      if (p) e[k] = p;
    }
    setErrors(e);
    setFormError(Object.keys(e).length > 0);
    if (Object.keys(e).length) {
      document.getElementById(Object.keys(e)[0])?.focus();
      return;
    }
    setState({ busy: true, done: 0, total: rows.length, msg: null, warn: false });
    const zip = new JSZip();
    const folder = `Medserti_parregistracija_${slug(f.lastName)}`;
    zip.file(`${folder}/1_Iesniegums_parregistracijai.docx`, await toBlob(buildReRegistration(f, profession, rows)));
    zip.file(
      `${folder}/Pirms_iesniegsanas.txt`,
      buildNurseChecklist(rows, registrationUntil, unconfirmed, {
        total: NURSE_RULES.points,
        emergency: NURSE_RULES.emergencyMinHours,
        infection_control: NURSE_RULES.infectionControlMinHours,
        patient_safety: NURSE_RULES.patientSafetyMinHours,
        nursing: NURSE_RULES.nursingMinHours,
        from: NURSE_RULES.emergencyFrom,
      }),
    );
    const failed = await addCertificateFiles(zip, `${folder}/2_Sertifikati`, rows, (done) => setState((st) => ({ ...st, done })));
    saveBlob(await zip.generateAsync({ type: "blob" }), `${folder}.zip`);
    setState({ busy: false, done: rows.length, total: rows.length, msg: failed ? d.failed : d.done, warn: failed > 0 });
  }

  async function downloadFiles() {
    setFiles({ busy: true, done: 0, msg: null, warn: false });
    const zip = new JSZip();
    const failed = await addCertificateFiles(zip, "Medserti_sertifikati", rows, (done) => setFiles((st) => ({ ...st, done })));
    saveBlob(await zip.generateAsync({ type: "blob" }), "Medserti_sertifikati.zip");
    setFiles({ busy: false, done: rows.length, msg: failed ? d.failed : d.filesDone, warn: failed > 0 });
  }

  const message = (p: Problem) =>
    ({
      required: d.required,
      letters: d.errLetters,
      digits: d.errDigits,
      personalCode: d.errPersonalCode,
      practitionerId: d.errPractitionerId,
      phone: d.errPhone,
      email: d.errEmail,
      tooLong: d.errTooLong,
    })[p];

  const input = (k: TextKey, label: string, placeholder: string, extra: { hint?: string; auto?: string; mode?: "numeric" | "tel" | "email" } = {}) => (
    <div className="field">
      <label htmlFor={k}>
        {label}
        {SPEC[k].required && <span className={s.req} aria-hidden="true"> *</span>}
      </label>
      <input
        id={k}
        value={f[k]}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
        maxLength={SPEC[k].max}
        required={SPEC[k].required}
        autoComplete={extra.auto ?? "off"}
        inputMode={extra.mode}
        aria-invalid={!!errors[k] || undefined}
        aria-describedby={errors[k] ? `${k}-err` : undefined}
      />
      {extra.hint && <span className="small muted">{extra.hint}</span>}
      {errors[k] && (
        <span id={`${k}-err`} className={s.err} role="alert">
          {message(errors[k])}
        </span>
      )}
    </div>
  );

  if (!registrationUntil) {
    return (
      <main className="container stack">
        <h1>{d.nurseTitle}</h1>
        <div className="alert">
          {d.nurseNoProfile} <Link href="/profile">→</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container stack">
      <div className="page-head">
        <div>
          <h1>{d.nurseTitle}</h1>
          <p className="muted">{d.nurseLead}</p>
          {locale !== "lv" && <p className="muted">{d.nurseLanguageNote}</p>}
        </div>
      </div>

      <section className={s.summary}>
        <div>
          <h2 className={s.h2}>{d.contents}</h2>
          <ul className={s.contents}>
            {d.nurseContentsItems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <p className={s.strong}>
            {d.included(rows.length)} <Link href="/certificates">{d.certList}</Link>
          </p>
          {rows.length > 0 && (
            <div className={s.filesRow}>
              <button type="button" className="btn" onClick={downloadFiles} disabled={files.busy}>
                {files.busy ? d.preparing(files.done, rows.length) : d.downloadFiles}
              </button>
              {files.msg && <span className={files.warn ? s.err : s.ok} role="status">{files.msg}</span>}
            </div>
          )}
          {unconfirmed > 0 && (
            <p className="alert" style={{ margin: 0 }}>
              {d.unconfirmed(unconfirmed)} <Link href="/certificates">{d.reviewLink}</Link>
            </p>
          )}
        </div>
      </section>

      <form className={s.form} onSubmit={download} noValidate>
        <p className={s.privacy}>{d.privacy}</p>
        <p className="small muted" style={{ margin: 0 }}>{d.requiredNote}</p>
        <fieldset className={s.group}>
          <legend>{d.you}</legend>
          <div className="form-grid">
            {input("firstName", d.firstName, d.phFirstName, { auto: "given-name" })}
            {input("lastName", d.lastName, d.phLastName, { auto: "family-name" })}
            {input("practitionerId", d.practitionerId, d.phPractitionerId, { hint: d.practitionerIdHint, mode: "numeric" })}
            {input("address", d.nurseAddress, d.phAddress, { auto: "street-address" })}
            {input("phone", d.phone, d.phPhone, { auto: "tel", mode: "tel" })}
            {input("email", d.email, d.phEmail, { auto: "email", mode: "email" })}
          </div>
          <div className={s.radios} role="radiogroup" aria-label={d.notifyBy}>
            <span className="small muted">{d.notifyBy}:</span>
            <label className={s.check}>
              <input type="radio" name="notify" checked={f.notifyBy === "email"} onChange={() => set("notifyBy", "email")} /> {d.notifyEmail}
            </label>
            <label className={s.check}>
              <input type="radio" name="notify" checked={f.notifyBy === "eaddress"} onChange={() => set("notifyBy", "eaddress")} /> {d.notifyEaddress}
            </label>
          </div>
        </fieldset>
        <div className={s.actions}>
          <button className={`btn btn-primary ${s.go}`} disabled={state.busy}>
            {state.busy ? d.preparing(state.done, state.total) : d.download}
          </button>
          {formError && Object.keys(errors).length > 0 ? (
            <span className={s.err} role="alert">{d.fixErrors}</span>
          ) : (
            state.msg && <span className={state.warn ? s.err : s.ok} role="status">{state.msg}</span>
          )}
        </div>
      </form>
    </main>
  );
}
