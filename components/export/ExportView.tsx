"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { type Locale } from "@/lib/locale";
import { useDict } from "@/components/i18n/DictProvider";
import type { ExportCertificateInfo, ExportPerson, ExportWorkplace } from "@/lib/export/docs";
import { applyByDate } from "@/lib/export/dates";
import { FILE_ACCEPT, MAX, MAX_FILE_BYTES, finalProblem } from "@/lib/export/validate";
import { suggestCountries, suggestInstitutions } from "@/lib/export/suggest";
import Autocomplete from "./Autocomplete";
import { FieldError, Label } from "./Field";
import { useExportForm, type FieldSpec } from "./useExportForm";
import { addCertificateFiles, extOf, slug } from "./zip";
import s from "./export.module.css";
import { formatDate } from "@/lib/format";

export interface ExportRow {
  id: string;
  approvalId: string | null;
  organizer: string;
  title: string;
  date: string;
  endDate: string | null;
  points: number;
  rawPoints?: number;
  inSpecialty: boolean;
  fileName: string;
}

type Work = ExportWorkplace & { now: boolean };
const emptyWork = (): Work => ({ name: "", position: "", from: "", to: "", now: true });

type TextKey = "firstName" | "lastName" | "personalCode" | "practitionerId" | "address" | "phone" | "email" | "commission";
const SPEC: Record<TextKey, FieldSpec> = {
  firstName: { kind: "name", required: true, max: MAX.name },
  lastName: { kind: "name", required: true, max: MAX.name },
  personalCode: { kind: "personalCode", required: true, max: MAX.personalCode },
  practitionerId: { kind: "practitionerId", required: false, max: MAX.practitionerId },
  address: { kind: "text", required: true, max: MAX.address },
  phone: { kind: "phone", required: true, max: MAX.phone },
  email: { kind: "email", required: true, max: MAX.email },
  commission: { kind: "text", required: true, max: MAX.commission },
};

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
  const d = useDict().exportDocs;
  const { f, set, errors, setErr, formError, checkFields, report, textField, state, files, build, downloadFiles } = useExportForm({
    spec: SPEC,
    rows,
    d,
    initial: () => ({
    firstName: prefill.firstName.slice(0, MAX.name),
    lastName: prefill.lastName.slice(0, MAX.name),
    personalCode: "",
    practitionerId: "",
    address: "",
    phone: "",
    email: prefill.email.slice(0, MAX.email),
    notifyBy: "email" as "email" | "eaddress",
    commission: "",
    earlierActivities: false,
    earlierNote: "",
    languageDoc: false,
    otherDocsOn: false,
    otherDocs: "",
    paperCertificate: false,
    delivery: "pickup" as "pickup" | "post",
    deliveryAddress: "",
    declarations: false,
    }),
  });
  const [work, setWork] = useState<Work[]>([emptyWork()]);
  const [abroad, setAbroad] = useState<{ country: string; w: Work }[]>([]);
  const [noMisconduct, setNoMisconduct] = useState(true);
  const [langFile, setLangFile] = useState<File | null>(null);
  const by = applyByDate(cert.validUntil);

  const updateWork = (i: number, w: Work) => {
    setWork((ws) => ws.map((x, j) => (j === i ? w : x)));
    setErr(`w${i}name`, null);
  };
  const updateAbroad = (i: number, a: { country: string; w: Work }) => {
    setAbroad((as) => as.map((x, j) => (j === i ? a : x)));
    setErr(`ab${i}country`, null);
  };

  function validate() {
    const e = checkFields();
    work.forEach((w, i) => {
      const p = finalProblem("text", w.name, i === 0, MAX.workplace);
      if (p) e[`w${i}name`] = p;
    });
    abroad.forEach((a, i) => {
      const p = finalProblem("text", a.country, true, MAX.country);
      if (p) e[`ab${i}country`] = p;
    });
    if (f.languageDoc && !langFile) e.langFile = "file";
    if (f.paperCertificate && f.delivery === "post" && !f.deliveryAddress.trim()) e.deliveryAddress = "required";
    if (f.otherDocsOn && !f.otherDocs.trim()) e.otherDocs = "required";
    if (!f.declarations) e.declarations = "declarations";
    return report(e);
  }

  async function download(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    const person: ExportPerson = {
      ...f,
      personalCode: f.personalCode.trim(),
      practitionerId: f.practitionerId.trim(),
      otherDocs: f.otherDocsOn ? f.otherDocs : "",
      earlierNote: f.earlierActivities ? f.earlierNote : "",
      languageDoc: f.languageDoc && !!langFile,
      workplaces: work.filter((w) => w.name.trim()).map((w) => ({ name: w.name, position: w.position, from: w.from, to: w.now ? "" : w.to })),
      abroad: abroad.map((a) => ({ country: a.country, workplace: { ...a.w, to: a.w.now ? "" : a.w.to } })),
      abroadNoMisconduct: noMisconduct,
    };
    const folder = `Medserti_resertifikacija_${slug(f.lastName)}`;
    const langName = person.languageDoc && langFile ? `4_Valsts_valodas_prasme${extOf(langFile.name)}` : undefined;
    await build(folder, async (zip, docs, onProgress) => {
      zip.file(`${folder}/1_Iesniegums.docx`, await docs.toBlob(docs.buildApplication(person, cert, rows.length)));
      zip.file(`${folder}/2_Resertifikacijas_lapa.docx`, await docs.toBlob(docs.buildRecertificationSheet(person, cert, rows)));
      zip.file(`${folder}/Pirms_iesniegsanas.txt`, docs.buildChecklist(cert, rows.length, unconfirmed, langName));
      if (langName && langFile) zip.file(`${folder}/${langName}`, langFile);
      return addCertificateFiles(zip, `${folder}/3_Sertifikati`, rows, onProgress);
    });
  }

  const err = (k: string) => <FieldError id={k} problem={errors[k]} d={d} />;
  const label = (htmlFor: string, text: string, required: boolean) => <Label htmlFor={htmlFor} text={text} required={required} />;

  const institutions = useCallback((q: string) => suggestInstitutions(q), []);
  const countries = useCallback((q: string) => suggestCountries(q, locale), [locale]);

  const workFields = (w: Work, update: (w: Work) => void, idp: string, required: boolean, latvia: boolean) => (
    <div className="form-grid">
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        {label(`${idp}name`, d.workplace, required)}
        {latvia ? (
          <Autocomplete
            id={`${idp}name`}
            value={w.name}
            onChange={(name) => update({ ...w, name })}
            suggest={institutions}
            placeholder={d.phWorkplace}
            maxLength={MAX.workplace}
            invalid={!!errors[`${idp}name`]}
            describedBy={errors[`${idp}name`] ? `${idp}name-err` : undefined}
            noMatch={d.workNoMatch}
          />
        ) : (
          <input id={`${idp}name`} value={w.name} maxLength={MAX.workplace} onChange={(e) => update({ ...w, name: e.target.value })} />
        )}
        {latvia && idp === "w0" && <span className="small muted">{d.workHint}</span>}
        {err(`${idp}name`)}
      </div>
      <div className="field">
        <label htmlFor={`${idp}pos`}>{d.position}</label>
        <input id={`${idp}pos`} value={w.position} maxLength={MAX.position} placeholder={d.phPosition} onChange={(e) => update({ ...w, position: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}from`}>{d.from}</label>
        <input id={`${idp}from`} type="date" value={w.from} max={w.now ? undefined : w.to || undefined} onChange={(e) => update({ ...w, from: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}to`}>{d.to}</label>
        <input id={`${idp}to`} type="date" value={w.to} min={w.from || undefined} disabled={w.now} onChange={(e) => update({ ...w, to: e.target.value })} />
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
          {by && <p className="muted">{d.applyBy(formatDate(by, locale))}</p>}
        </div>
      </section>

      <form className={s.form} onSubmit={download} noValidate>
        <p className={s.privacy}>{d.privacy}</p>
        <p className="small muted" style={{ margin: 0 }}>{d.requiredNote}</p>

        <fieldset className={s.group}>
          <legend>{d.you}</legend>
          <div className={s.personal}>
            {textField("firstName", d.firstName, d.phFirstName, { auto: "given-name" })}
            {textField("lastName", d.lastName, d.phLastName, { auto: "family-name" })}
            {textField("personalCode", d.personalCode, d.phPersonalCode, { mode: "numeric" })}
            {textField("practitionerId", d.practitionerId, d.phPractitionerId, { hint: d.practitionerIdHint, mode: "numeric" })}
            {textField("phone", d.phone, d.phPhone, { auto: "tel", mode: "tel" })}
            {textField("email", d.email, d.phEmail, { auto: "email", mode: "email" })}
            {textField("address", d.address, d.phAddress, { auto: "street-address", wide: true })}
            {textField("commission", d.commission, d.phCommission, { wide: true })}
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
              {workFields(w, (nw) => updateWork(i, nw), `w${i}`, i === 0, true)}
              {i > 0 && (
                <button type="button" className="btn" onClick={() => setWork((ws) => ws.filter((_, j) => j !== i))}>
                  {d.removeWorkplace}
                </button>
              )}
            </div>
          ))}
          <button type="button" className={`btn ${s.add}`} onClick={() => setWork((ws) => [...ws, emptyWork()])}>
            + {d.addWorkplace}
          </button>
          <label className={s.check}>
            <input type="checkbox" checked={abroad.length > 0} onChange={(e) => setAbroad(e.target.checked ? [{ country: "", w: emptyWork() }] : [])} /> {d.abroad}
          </label>
          {abroad.map((a, i) => (
            <div key={i} className={s.workplace}>
              <div className="field">
                {label(`ab${i}country`, d.country, true)}
                <Autocomplete
                  id={`ab${i}country`}
                  value={a.country}
                  onChange={(country) => updateAbroad(i, { ...a, country })}
                  suggest={countries}
                  placeholder={d.phCountry}
                  maxLength={MAX.country}
                  invalid={!!errors[`ab${i}country`]}
                  describedBy={errors[`ab${i}country`] ? `ab${i}country-err` : undefined}
                />
                {err(`ab${i}country`)}
              </div>
              {workFields(a.w, (nw) => updateAbroad(i, { ...a, w: nw }), `ab${i}`, false, false)}
              {abroad.length > 1 && (
                <button type="button" className="btn" onClick={() => setAbroad((as) => as.filter((_, j) => j !== i))}>
                  {d.removeWorkplace}
                </button>
              )}
            </div>
          ))}
          {abroad.length > 0 && (
            <>
              <button type="button" className={`btn ${s.add}`} onClick={() => setAbroad((as) => [...as, { country: "", w: emptyWork() }])}>
                + {d.addAbroad}
              </button>
              <label className={s.check}>
                <input type="checkbox" checked={noMisconduct} onChange={(e) => setNoMisconduct(e.target.checked)} /> {d.noMisconduct}
              </label>
            </>
          )}
        </fieldset>

        <fieldset className={s.group}>
          <legend>{d.other}</legend>

          <label className={s.check}>
            <input type="checkbox" checked={f.earlierActivities} onChange={(e) => set("earlierActivities", e.target.checked)} /> {d.earlier}
          </label>
          {f.earlierActivities && (
            <div className={`field ${s.reveal}`}>
              <label htmlFor="earlierNote">{d.earlierWhich}</label>
              <textarea id="earlierNote" rows={2} value={f.earlierNote} maxLength={MAX.note} placeholder={d.phEarlier} onChange={(e) => set("earlierNote", e.target.value)} />
            </div>
          )}

          <label className={s.check}>
            <input
              type="checkbox"
              checked={f.languageDoc}
              onChange={(e) => {
                set("languageDoc", e.target.checked);
                setErr("langFile", null);
              }}
            />{" "}
            {d.languageDoc}
          </label>
          {f.languageDoc && (
            <div className={`field ${s.reveal}`}>
              {label("langFile", d.languageFile, true)}
              {langFile ? (
                <div className={s.fileChip}>
                  <span className={s.fileName}>{langFile.name}</span>
                  <span className="small muted">{(langFile.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button type="button" className="btn" onClick={() => setLangFile(null)}>
                    {d.removeFile}
                  </button>
                </div>
              ) : (
                <input
                  id="langFile"
                  type="file"
                  accept={FILE_ACCEPT}
                  className={s.fileInput}
                  aria-invalid={!!errors.langFile || undefined}
                  aria-describedby={errors.langFile ? "langFile-err" : undefined}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (file && file.size > MAX_FILE_BYTES) return setErr("langFile", "fileSize");
                    setLangFile(file);
                    setErr("langFile", null);
                  }}
                />
              )}
              {err("langFile")}
            </div>
          )}

          <label className={s.check}>
            <input type="checkbox" checked={f.otherDocsOn} onChange={(e) => set("otherDocsOn", e.target.checked)} /> {d.otherDocs}
          </label>
          {f.otherDocsOn && (
            <div className={`field ${s.reveal}`}>
              {label("otherDocs", d.otherDocsWhich, true)}
              <input
                id="otherDocs"
                value={f.otherDocs}
                maxLength={MAX.note}
                placeholder={d.phOtherDocs}
                aria-invalid={!!errors.otherDocs || undefined}
                onChange={(e) => set("otherDocs", e.target.value)}
              />
              {err("otherDocs")}
            </div>
          )}

          <label className={s.check}>
            <input type="checkbox" checked={f.paperCertificate} onChange={(e) => set("paperCertificate", e.target.checked)} /> {d.paper}
          </label>
          {f.paperCertificate && (
            <div className={`stack ${s.reveal}`} style={{ gap: 10 }}>
              <div className={s.radios} role="radiogroup" aria-label={d.delivery}>
                <span className="small muted">{d.delivery}:</span>
                <label className={s.check}>
                  <input type="radio" name="delivery" checked={f.delivery === "pickup"} onChange={() => set("delivery", "pickup")} /> {d.deliveryPickup}
                </label>
                <label className={s.check}>
                  <input type="radio" name="delivery" checked={f.delivery === "post"} onChange={() => set("delivery", "post")} /> {d.deliveryPost}
                </label>
              </div>
              {f.delivery === "post" && (
                <div className="field">
                  {label("deliveryAddress", d.deliveryAddress, true)}
                  <input
                    id="deliveryAddress"
                    value={f.deliveryAddress}
                    maxLength={MAX.address}
                    placeholder={d.phAddress}
                    autoComplete="street-address"
                    aria-invalid={!!errors.deliveryAddress || undefined}
                    onChange={(e) => set("deliveryAddress", e.target.value)}
                  />
                  {err("deliveryAddress")}
                </div>
              )}
            </div>
          )}

          <label className={`${s.check} ${s.declaration} ${errors.declarations ? s.declarationBad : ""}`}>
            <input
              id="declarations"
              type="checkbox"
              required
              checked={f.declarations}
              onChange={(e) => set("declarations", e.target.checked)}
              aria-invalid={!!errors.declarations || undefined}
              aria-describedby={errors.declarations ? "declarations-err" : undefined}
            />
            <span>
              {d.declarations}
              <span className={s.req} aria-hidden="true"> *</span>
            </span>
          </label>
          {err("declarations")}
        </fieldset>

        <div className={s.actions}>
          <button className={`btn btn-primary ${s.go}`} disabled={state.busy}>
            {state.busy ? d.preparing(state.done, state.total) : d.download}
          </button>
          {formError && Object.keys(errors).length > 0 ? (
            <span className={s.err} role="alert">
              {errors.declarations && Object.keys(errors).length === 1 ? d.declarationsRequired : d.fixErrors}
            </span>
          ) : (
            state.msg && <span className={state.warn ? s.err : s.ok} role="status">{state.msg}</span>
          )}
        </div>
      </form>
    </main>
  );
}
