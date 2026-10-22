"use client";

import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { useDict } from "@/components/i18n/DictProvider";
import { NURSE_RULES } from "@/lib/rule-constants";
import type { NurseExportCertificate, NursePerson } from "@/lib/export/docs";
import { MAX } from "@/lib/export/validate";
import { useExportForm, type FieldSpec } from "./useExportForm";
import { addCertificateFiles, slug } from "./zip";
import s from "./export.module.css";

export type NurseExportRow = NurseExportCertificate & { id: string; fileName: string };

type TextKey = "firstName" | "lastName" | "practitionerId" | "address" | "phone" | "email";
const SPEC: Record<TextKey, FieldSpec> = {
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
  const d = useDict().exportDocs;
  const { f, set, errors, formError, checkFields, report, textField, state, files, build, downloadFiles } = useExportForm({
    spec: SPEC,
    rows,
    d,
    initial: (): NursePerson => ({
      firstName: prefill.firstName.slice(0, MAX.name),
      lastName: prefill.lastName.slice(0, MAX.name),
      email: prefill.email.slice(0, MAX.email),
      practitionerId: prefill.practitionerId.slice(0, MAX.practitionerId),
      address: "",
      phone: "",
      notifyBy: "email",
    }),
  });

  async function download(ev: React.FormEvent) {
    ev.preventDefault();
    if (!report(checkFields())) return;
    const folder = `Medserti_parregistracija_${slug(f.lastName)}`;
    await build(folder, async (zip, docs, onProgress) => {
      zip.file(`${folder}/1_Iesniegums_parregistracijai.docx`, await docs.toBlob(docs.buildReRegistration(f, profession, rows)));
      zip.file(
        `${folder}/Pirms_iesniegsanas.txt`,
        docs.buildNurseChecklist(rows, registrationUntil, unconfirmed, {
          total: NURSE_RULES.points,
          emergency: NURSE_RULES.emergencyMinHours,
          infection_control: NURSE_RULES.infectionControlMinHours,
          patient_safety: NURSE_RULES.patientSafetyMinHours,
          nursing: NURSE_RULES.nursingMinHours,
          from: NURSE_RULES.emergencyFrom,
        }),
      );
      return addCertificateFiles(zip, `${folder}/2_Sertifikati`, rows, onProgress);
    });
  }

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
            {textField("firstName", d.firstName, d.phFirstName, { auto: "given-name" })}
            {textField("lastName", d.lastName, d.phLastName, { auto: "family-name" })}
            {textField("practitionerId", d.practitionerId, d.phPractitionerId, { hint: d.practitionerIdHint, mode: "numeric" })}
            {textField("address", d.nurseAddress, d.phAddress, { auto: "street-address" })}
            {textField("phone", d.phone, d.phPhone, { auto: "tel", mode: "tel" })}
            {textField("email", d.email, d.phEmail, { auto: "email", mode: "email" })}
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
