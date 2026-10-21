"use client";

import { useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { formatDate, t, type Locale } from "@/lib/i18n";
import {
  applyByDate,
  buildApplication,
  buildChecklist,
  buildRecertificationSheet,
  toBlob,
  type ExportCertificateInfo,
  type ExportPerson,
  type ExportWorkplace,
} from "@/lib/export/docs";
import s from "./export.module.css";

export interface ExportRow {
  id: string;
  approvalId: string | null;
  organizer: string;
  title: string;
  date: string;
  endDate: string | null;
  points: number;
  inSpecialty: boolean;
  fileName: string;
}

const emptyWork = (): ExportWorkplace & { now: boolean } => ({ name: "", position: "", from: "", to: "", now: true });

/** ASCII-safe file name part for the ZIP */
const slug = (x: string) =>
  x.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "sertifikats";

export default function ExportView({
  locale,
  rows,
  unconfirmed,
  cert,
  prefill,
}: {
  locale: Locale;
  rows: ExportRow[];
  unconfirmed: number;
  cert: ExportCertificateInfo;
  prefill: { firstName: string; lastName: string; email: string };
}) {
  const d = t(locale).exportDocs;
  const [f, setF] = useState({
    firstName: prefill.firstName,
    lastName: prefill.lastName,
    personalCode: "",
    practitionerId: "",
    address: "",
    phone: "",
    email: prefill.email,
    notifyBy: "email" as "email" | "eaddress",
    commission: "",
    earlierActivities: false,
    languageDoc: false,
    paperCertificate: false,
    declarations: false,
  });
  const [work, setWork] = useState([emptyWork()]);
  const [abroad, setAbroad] = useState<null | { country: string; noMisconduct: boolean; w: ExportWorkplace & { now: boolean } }>(null);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<{ busy: boolean; done: number; total: number; msg: string | null; warn: boolean }>({
    busy: false,
    done: 0,
    total: 0,
    msg: null,
    warn: false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setErrors((e) => ({ ...e, [k]: false }));
  };
  const by = applyByDate(cert.validUntil);

  function validate() {
    const req: (keyof typeof f)[] = ["firstName", "lastName", "personalCode", "address", "phone", "email", "commission"];
    const e: Record<string, boolean> = {};
    for (const k of req) if (!String(f[k]).trim()) e[k] = true;
    if (!work[0].name.trim()) e.work0 = true;
    if (!f.declarations) e.declarations = true;
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(Object.keys(e)[0] === "work0" ? "w0name" : Object.keys(e)[0])?.focus();
      return false;
    }
    return true;
  }

  async function download(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    const person: ExportPerson = {
      ...f,
      workplaces: work.filter((w) => w.name.trim()).map((w) => ({ name: w.name, position: w.position, from: w.from, to: w.now ? "" : w.to })),
      abroad: abroad
        ? { country: abroad.country, noMisconduct: abroad.noMisconduct, workplace: { ...abroad.w, to: abroad.w.now ? "" : abroad.w.to } }
        : null,
    };
    setState({ busy: true, done: 0, total: rows.length, msg: null, warn: false });
    const zip = new JSZip();
    const folder = `Medserti_resertifikacija_${slug(f.lastName)}`;
    zip.file(`${folder}/1_Iesniegums.docx`, await toBlob(buildApplication(person, cert, rows.length)));
    zip.file(`${folder}/2_Resertifikacijas_lapa.docx`, await toBlob(buildRecertificationSheet(person, cert, rows)));
    zip.file(`${folder}/Pirms_iesniegsanas.txt`, buildChecklist(cert, rows.length, unconfirmed));
    let failed = 0;
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      try {
        const res = await fetch(`/api/certificates/${encodeURIComponent(r.id)}/file`);
        if (!res.ok) throw new Error(String(res.status));
        const ext = (r.fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? ".pdf").toLowerCase();
        zip.file(`${folder}/3_Sertifikati/${String(i + 1).padStart(2, "0")}_${r.date}_${slug(r.title)}${ext}`, await res.blob());
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

  const err = (k: string) => (errors[k] ? <span className={s.err}>{d.required}</span> : null);
  const input = (k: "firstName" | "lastName" | "personalCode" | "practitionerId" | "address" | "phone" | "email" | "commission", label: string, extra: { hint?: string; auto?: string; mode?: "numeric" | "tel" | "email" } = {}) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input
        id={k}
        value={f[k]}
        onChange={(e) => set(k, e.target.value)}
        autoComplete={extra.auto ?? "off"}
        inputMode={extra.mode}
        aria-invalid={errors[k] || undefined}
      />
      {extra.hint && <span className="small muted">{extra.hint}</span>}
      {err(k)}
    </div>
  );

  const workFields = (w: ExportWorkplace & { now: boolean }, update: (w: ExportWorkplace & { now: boolean }) => void, idp: string) => (
    <div className="form-grid">
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label htmlFor={`${idp}name`}>{d.workplace}</label>
        <input id={`${idp}name`} value={w.name} onChange={(e) => update({ ...w, name: e.target.value })} aria-invalid={(idp === "w0" && errors.work0) || undefined} />
        {idp === "w0" && err("work0")}
      </div>
      <div className="field">
        <label htmlFor={`${idp}pos`}>{d.position}</label>
        <input id={`${idp}pos`} value={w.position} onChange={(e) => update({ ...w, position: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}from`}>{d.from}</label>
        <input id={`${idp}from`} type="date" value={w.from} onChange={(e) => update({ ...w, from: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}to`}>{d.to}</label>
        <input id={`${idp}to`} type="date" value={w.to} disabled={w.now} onChange={(e) => update({ ...w, to: e.target.value })} />
        <label className={s.check}>
          <input type="checkbox" checked={w.now} onChange={(e) => update({ ...w, now: e.target.checked })} /> {d.toNow}
        </label>
      </div>
    </div>
  );

  if (!cert.validUntil || !cert.number) {
    return (
      <main className="container stack">
        <h1>{d.title}</h1>
        <div className="alert">
          {d.noProfile} <Link href="/profile">→</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container stack">
      <div className="page-head">
        <div>
          <h1>{d.title}</h1>
          <p className="muted">{d.lead}</p>
          {/* the forms are official Latvian documents in every UI language (lib/export/docs.ts) */}
          {locale !== "lv" && <p className="muted">{d.languageNote}</p>}
        </div>
      </div>

      <section className={s.summary}>
        <div>
          <h2 className={s.h2}>{d.contents}</h2>
          <ul className={s.contents}>
            {d.contentsItems.map((x) => (
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
          {by && <p className="muted">{d.applyBy(formatDate(by, locale))}</p>}
        </div>
      </section>

      <form className={s.form} onSubmit={download} noValidate>
        <p className={s.privacy}>{d.privacy}</p>

        <fieldset className={s.group}>
          <legend>{d.you}</legend>
          <div className="form-grid">
            {input("firstName", d.firstName, { auto: "given-name" })}
            {input("lastName", d.lastName, { auto: "family-name" })}
            {input("personalCode", d.personalCode)}
            {input("practitionerId", d.practitionerId, { hint: d.practitionerIdHint })}
            {input("address", d.address, { auto: "street-address" })}
            {input("phone", d.phone, { auto: "tel", mode: "tel" })}
            {input("email", d.email, { auto: "email", mode: "email" })}
            {input("commission", d.commission, { hint: d.commissionHint })}
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

        <fieldset className={s.group}>
          <legend>{d.work}</legend>
          {work.map((w, i) => (
            <div key={i} className={s.workplace}>
              {workFields(w, (nw) => setWork((ws) => ws.map((x, j) => (j === i ? nw : x))), `w${i}`)}
              {i > 0 && (
                <button type="button" className="btn" onClick={() => setWork((ws) => ws.filter((_, j) => j !== i))}>
                  {d.removeWorkplace}
                </button>
              )}
            </div>
          ))}
          {work.length < 2 && (
            <button type="button" className="btn" onClick={() => setWork((ws) => [...ws, emptyWork()])}>
              + {d.addWorkplace}
            </button>
          )}
          <label className={s.check}>
            <input type="checkbox" checked={!!abroad} onChange={(e) => setAbroad(e.target.checked ? { country: "", noMisconduct: true, w: emptyWork() } : null)} /> {d.abroad}
          </label>
          {abroad && (
            <div className={s.workplace}>
              <div className="field">
                <label htmlFor="abroadCountry">{d.country}</label>
                <input id="abroadCountry" value={abroad.country} onChange={(e) => setAbroad({ ...abroad, country: e.target.value })} />
              </div>
              {workFields(abroad.w, (nw) => setAbroad({ ...abroad, w: nw }), "ab")}
              <label className={s.check}>
                <input type="checkbox" checked={abroad.noMisconduct} onChange={(e) => setAbroad({ ...abroad, noMisconduct: e.target.checked })} /> {d.noMisconduct}
              </label>
            </div>
          )}
        </fieldset>

        <fieldset className={s.group}>
          <legend>{d.other}</legend>
          <label className={s.check}>
            <input type="checkbox" checked={f.earlierActivities} onChange={(e) => set("earlierActivities", e.target.checked)} /> {d.earlier}
          </label>
          <label className={s.check}>
            <input type="checkbox" checked={f.languageDoc} onChange={(e) => set("languageDoc", e.target.checked)} /> {d.languageDoc}
          </label>
          <label className={s.check}>
            <input type="checkbox" checked={f.paperCertificate} onChange={(e) => set("paperCertificate", e.target.checked)} /> {d.paper}
          </label>
          <label className={`${s.check} ${s.declaration}`}>
            <input id="declarations" type="checkbox" checked={f.declarations} onChange={(e) => set("declarations", e.target.checked)} aria-invalid={errors.declarations || undefined} />
            <span>{d.declarations}</span>
          </label>
          {errors.declarations && <span className={s.err}>{d.declarationsRequired}</span>}
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
