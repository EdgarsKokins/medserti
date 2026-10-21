"use client";

import { useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { t, type Locale } from "@/lib/i18n";
import { NURSE_RULES } from "@/lib/rules";
import { buildNurseChecklist, buildReRegistration, toBlob, type NurseExportCertificate, type NursePerson } from "@/lib/export/docs";
import s from "./export.module.css";

export type NurseExportRow = NurseExportCertificate & { id: string; fileName: string };

/** ASCII-safe file name part for the ZIP */
const slug = (x: string) =>
  x.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "sertifikats";

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
  const [f, setF] = useState<NursePerson>({ ...prefill, address: "", phone: "", notifyBy: "email" });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<{ busy: boolean; done: number; total: number; msg: string | null; warn: boolean }>({
    busy: false,
    done: 0,
    total: 0,
    msg: null,
    warn: false,
  });
  const set = <K extends keyof NursePerson>(k: K, v: NursePerson[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrors((e) => ({ ...e, [k]: false }));
  };

  async function download(ev: React.FormEvent) {
    ev.preventDefault();
    const req: (keyof NursePerson)[] = ["firstName", "lastName", "address", "phone", "email"];
    const e: Record<string, boolean> = {};
    for (const k of req) if (!String(f[k]).trim()) e[k] = true;
    setErrors(e);
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
    let failed = 0;
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      try {
        const res = await fetch(`/api/certificates/${encodeURIComponent(r.id)}/file`);
        if (!res.ok) throw new Error(String(res.status));
        const ext = (r.fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? ".pdf").toLowerCase();
        zip.file(`${folder}/2_Sertifikati/${String(i + 1).padStart(2, "0")}_${r.date}_${slug(r.title)}${ext}`, await res.blob());
      } catch {
        failed++;
      }
      setState((st) => ({ ...st, done: i + 1 }));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${folder}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setState({ busy: false, done: rows.length, total: rows.length, msg: failed ? d.failed : d.done, warn: failed > 0 });
  }

  const input = (k: "firstName" | "lastName" | "practitionerId" | "address" | "phone" | "email", label: string, extra: { hint?: string; auto?: string; mode?: "tel" | "email" } = {}) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} value={f[k]} onChange={(e) => set(k, e.target.value)} autoComplete={extra.auto ?? "off"} inputMode={extra.mode} aria-invalid={errors[k] || undefined} />
      {extra.hint && <span className="small muted">{extra.hint}</span>}
      {errors[k] && <span className={s.err}>{d.required}</span>}
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
          <p className={s.strong}>{d.included(rows.length)}</p>
          {unconfirmed > 0 && (
            <p className="alert" style={{ margin: 0 }}>
              {d.unconfirmed(unconfirmed)} <Link href="/certificates">{d.reviewLink}</Link>
            </p>
          )}
        </div>
      </section>

      <form className={s.form} onSubmit={download} noValidate>
        <p className={s.privacy}>{d.privacy}</p>
        <fieldset className={s.group}>
          <legend>{d.you}</legend>
          <div className="form-grid">
            {input("firstName", d.firstName, { auto: "given-name" })}
            {input("lastName", d.lastName, { auto: "family-name" })}
            {input("practitionerId", d.practitionerId, { hint: d.practitionerIdHint })}
            {input("address", d.nurseAddress, { auto: "street-address" })}
            {input("phone", d.phone, { auto: "tel", mode: "tel" })}
            {input("email", d.email, { auto: "email", mode: "email" })}
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
          {state.msg && <span className={state.warn ? s.err : s.ok} role="status">{state.msg}</span>}
        </div>
      </form>
    </main>
  );
}
