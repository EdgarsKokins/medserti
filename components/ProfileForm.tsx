"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profession, Profile } from "@/lib/types";
import { addYears, certificateWindow, ruleBasis, ruleRequiredPoints, RULES } from "@/lib/rules";
import { findSpecialty, OTHER_SPECIALTY, resolveSpecialty, specialtiesFor, specialtyByCode } from "@/lib/specialties";
import { formatDate, inHours, t, type Locale } from "@/lib/i18n";
import { profileComplete } from "@/lib/profile";
import { CERT_NO_MAX, NAME_MAX, SPECIALTY_MAX, todayIso, validCertNo, validName, validPlainText } from "@/lib/validation";
import SpecialtyPicker from "./SpecialtyPicker";
import s from "./profile.module.css";

type FieldErrors = Partial<Record<"fullName" | "specialtyText" | "certNo" | "issued" | "expires", string>>;

/**
 * readOnly: the demo account, fields shown but disabled and no save button.
 * onboarding: the profile has never been completed; the save that completes it goes on to the dashboard.
 */
export default function ProfileForm({
  initial,
  locale,
  readOnly = false,
  onboarding = false,
}: {
  initial: Profile;
  locale: Locale;
  readOnly?: boolean;
  onboarding?: boolean;
}) {
  const dict = t(locale);
  const professions = dict.professions;
  const router = useRouter();
  const [p, setP] = useState<Profile>(initial);
  // nurses count academic hours, not TIP (Reg. 630 Annex 6)
  const d = (p.profession === "nurse" ? inHours(dict) : dict).profile;
  const [spec, setSpec] = useState(() => resolveSpecialty(initial));
  // an end date that is not issue + 5 years was set by hand; keep it and show the field
  const [customEnd, setCustomEnd] = useState(
    () => !!initial.certificateExpires && (!initial.certificateIssued || initial.certificateExpires !== addYears(initial.certificateIssued, RULES.validityYears)),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // "Certification needed": the dates put the certificate period in the past, so this is not recertification
  const expiredDialog = useRef<HTMLDialogElement>(null);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setMsg(null);
    setP((prev) => ({ ...prev, [k]: v }));
  };
  const clearError = (k: keyof FieldErrors) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined }));

  const specList = useMemo(() => specialtiesFor(p.profession, p.certificationKind), [p.profession, p.certificationKind]);
  // the rule can depend on the specialty picked but not yet saved (physiotherapists, Reg. 391 point 86)
  const ruleInput = { ...p, specialtyCode: spec.code, specialty: specialtyByCode(spec.code)?.lv ?? spec.text };
  const ruleTarget = ruleRequiredPoints(ruleInput);
  const basis = ruleBasis(ruleInput);
  const nurse = p.profession === "nurse";

  /** Kind or profession changes the rule; an override that only repeated the old rule goes with it */
  const setRuleInput = (patch: Partial<Pick<Profile, "profession" | "certificationKind">>) => {
    setMsg(null);
    const next = { ...p, ...patch };
    // nurses hold no certificate, so no method certificate either
    if (next.profession === "nurse") next.certificationKind = "specialty";
    setP(next);
    // the specialty follows the new profession's list; a value that does not fit it is dropped, so only one specialty field shows
    const list = specialtiesFor(next.profession, next.certificationKind);
    const current = specialtyByCode(spec.code);
    const only = list.length === 1 ? { code: list[0].code, text: "" } : { code: null, text: "" };
    if (list.length === 0) {
      // free text only: a pick from the old list does not carry over, text typed under "Cita" does
      if (specList.length > 0) setSpec({ code: OTHER_SPECIALTY, text: spec.code === OTHER_SPECIALTY ? spec.text : "" });
    } else if (specList.length === 0) {
      // from free text to a list: keep the text only when it names a specialty on the new list
      const hit = findSpecialty(spec.text);
      setSpec(hit && list.some((x) => x.code === hit.code) ? { code: hit.code, text: "" } : only);
    } else if (current && !list.some((x) => x.code === current.code)) setSpec(only);
    else if (!spec.code) setSpec(only);
  };

  const defaultExpiry = p.certificateIssued ? addYears(p.certificateIssued, RULES.validityYears) : null;

  // the requirement always follows the rules; an override stored before is ignored
  const target = ruleTarget;
  const today = todayIso();
  /** The certificate (or VI registration) period has already ended */
  const ended = (q: Profile) => {
    const end = certificateWindow(q).end;
    return !!end && end < today;
  };
  const dateField = nurse ? "expires" : customEnd ? "expires" : "issued";
  const checkEnded = () => {
    if (!ended(p)) return false;
    setErrors((e) => ({ ...e, [dateField]: dict.api.certExpired }));
    expiredDialog.current?.showModal();
    return true;
  };

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!p.fullName.trim()) e.fullName = dict.api.nameRequired;
    else if (!validName(p.fullName)) e.fullName = dict.api.nameInvalid;
    if (spec.code === OTHER_SPECIALTY && !spec.text.trim()) e.specialtyText = d.specialtyOtherRequired;
    else if (spec.code === OTHER_SPECIALTY && !validPlainText(spec.text, SPECIALTY_MAX)) e.specialtyText = dict.api.specialtyInvalid;
    if (!validCertNo(p.certificateNumber)) e.certNo = dict.api.certNoInvalid;
    if (!nurse && p.certificateIssued && p.certificateIssued > today) e.issued = dict.api.issuedFuture;
    if (ended(p)) e[dateField] = dict.api.certExpired;
    return e;
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const found = validate();
    setErrors(found);
    const firstBad = (Object.keys(found) as (keyof FieldErrors)[])[0];
    // a past deadline is never saved; the dialog explains why and sends the user back to the date
    if (found[dateField] === dict.api.certExpired) return expiredDialog.current?.showModal();
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    const listed = specialtyByCode(spec.code);
    const body: Profile = {
      ...p,
      specialtyCode: spec.code,
      specialty: listed ? listed.lv : spec.code === OTHER_SPECIALTY ? spec.text.trim() : "",
      requiredPointsOverride: null,
    };
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? d.saveError });
    if (onboarding && profileComplete(data.profile)) return router.push("/dashboard");
    setP(data.profile);
    setSpec(resolveSpecialty(data.profile));
    setMsg({ ok: true, text: d.saved });
    router.refresh();
  }

  const errorProps = (k: keyof FieldErrors) =>
    errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-error` } : {};
  const errorText = (k: keyof FieldErrors) =>
    errors[k] ? <span id={`${k}-error`} className={s.error}>{errors[k]}</span> : null;

  return (
    <form className={s.form} onSubmit={save} noValidate>
      <fieldset className="ro-fieldset" disabled={readOnly}>
      <section className={s.section} aria-labelledby="sec-you">
        <div className={s.aside}>
          <h2 id="sec-you">{d.sectionYou}</h2>
          <p className="small muted">{d.sectionYouNote}</p>
        </div>
        <div className={s.fields}>
          <div className={`field ${s.wide}`}>
            <label htmlFor="fullName">{d.fullName}</label>
            <input
              id="fullName"
              value={p.fullName}
              onChange={(e) => {
                set("fullName", e.target.value);
                clearError("fullName");
              }}
              autoComplete="name"
              maxLength={NAME_MAX}
              {...errorProps("fullName")}
            />
            {errorText("fullName")}
          </div>
          <div className={`field ${s.wide}`}>
            <label htmlFor="profession">{d.profession}</label>
            <select id="profession" value={p.profession} onChange={(e) => setRuleInput({ profession: e.target.value as Profession })}>
              {Object.entries(professions).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className={`field ${s.wide}`}>
            <label htmlFor={specList.length ? "specialty" : "specialtyText"}>{d.specialty}</label>
            {specList.length === 0 ? (
              <>
                <input
                  id="specialtyText"
                  value={spec.code === OTHER_SPECIALTY ? spec.text : specialtyByCode(spec.code)?.[locale] ?? ""}
                  maxLength={SPECIALTY_MAX}
                  onChange={(e) => {
                    setMsg(null);
                    setSpec({ code: OTHER_SPECIALTY, text: e.target.value });
                    clearError("specialtyText");
                  }}
                  {...errorProps("specialtyText")}
                />
                {errorText("specialtyText")}
              </>
            ) : (
              <SpecialtyPicker
                id="specialty"
                code={spec.code}
                list={specList}
                locale={locale}
                labels={{ other: d.specialtyOther, placeholder: d.specialtyPlaceholder, noMatch: d.specialtyNoMatch }}
                onChange={(code) => {
                  setMsg(null);
                  setSpec((prev) => ({ code, text: code === OTHER_SPECIALTY ? prev.text : "" }));
                  clearError("specialtyText");
                }}
              />
            )}
            <span className={s.hint}>{nurse ? d.specialtyHintNurse : d.specialtyHint}</span>
          </div>
          {specList.length > 0 && spec.code === OTHER_SPECIALTY && (
            <div className={`field ${s.wide}`}>
              <label htmlFor="specialtyText">{d.specialtyOtherLabel}</label>
              <input
                id="specialtyText"
                value={spec.text}
                maxLength={SPECIALTY_MAX}
                onChange={(e) => {
                  setMsg(null);
                  setSpec({ code: OTHER_SPECIALTY, text: e.target.value });
                  clearError("specialtyText");
                }}
                {...errorProps("specialtyText")}
              />
              {errorText("specialtyText")}
            </div>
          )}
        </div>
      </section>

      <section className={s.section} aria-labelledby="sec-cert">
        <div className={s.aside}>
          <h2 id="sec-cert">{nurse ? d.sectionRegistration : d.sectionCert}</h2>
          <p className="small muted">{nurse ? d.sectionRegistrationNote : d.sectionCertNote}</p>
          <p className={s.summary} aria-live="polite">
            {d.summary(target, p.certificateExpires ? formatDate(p.certificateExpires, locale) : null)}
          </p>
          {!p.certificateExpires && <p className="small muted">{nurse ? d.summaryNoDateNurse : d.summaryNoDate}</p>}
          {basis && <p className="small muted">{basis === "nurse" ? d.nurseRule : d.functionalTransition}</p>}
        </div>
        <div className={s.fields}>
          {!nurse && (
            <div className="field">
              <label htmlFor="kind">{d.kind}</label>
              <select
                id="kind"
                value={p.certificationKind}
                aria-describedby="kind-hint"
                onChange={(e) => setRuleInput({ certificationKind: e.target.value as Profile["certificationKind"] })}
              >
                <option value="specialty">{d.kindSpecialty}</option>
                <option value="method">{d.kindMethod}</option>
              </select>
              <span id="kind-hint" className={s.hint}>{d.kindHint}</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="certNo">{nurse ? d.regNo : d.certNo}</label>
            <input
              id="certNo"
              value={p.certificateNumber}
              maxLength={CERT_NO_MAX}
              onChange={(e) => {
                set("certificateNumber", e.target.value);
                clearError("certNo");
              }}
              {...errorProps("certNo")}
            />
            {errorText("certNo")}
          </div>
          {nurse ? (
            // the register shows the date the registration runs to; the 5-year term behind it follows (Reg. 630 point 33)
            <div className="field">
              <label htmlFor="expires">{d.registrationUntil}</label>
              <input
                id="expires"
                type="date"
                value={p.certificateExpires ?? ""}
                onChange={(e) => {
                  set("certificateExpires", e.target.value || null);
                  clearError("expires");
                }}
                onBlur={checkEnded}
                {...errorProps("expires")}
              />
              {errorText("expires")}
              <span className={s.hint}>{d.registrationUntilHint}</span>
            </div>
          ) : (
            <>
            <div className="field">
              <label htmlFor="issued">{d.issued}</label>
              <input
                id="issued"
                type="date"
                max={today}
                value={p.certificateIssued ?? ""}
                onBlur={checkEnded}
                {...errorProps("issued")}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setMsg(null);
                  clearError("issued");
                  clearError("expires");
                  setP((prev) => ({
                    ...prev,
                    certificateIssued: v,
                    // a hand-set end date stays; otherwise the end follows the rule
                    certificateExpires: customEnd ? prev.certificateExpires : v ? addYears(v, RULES.validityYears) : null,
                  }));
                }}
              />
              {errorText("issued")}
              {!customEnd && (
                <span className={s.hint}>
                  {defaultExpiry && <>{d.ruleDefault(formatDate(defaultExpiry, locale), RULES.validityYears)} </>}
                  <button
                    type="button"
                    className={s.inlineBtn}
                    aria-controls="expires"
                    onClick={() => {
                      setCustomEnd(true);
                      requestAnimationFrame(() => document.getElementById("expires")?.focus());
                    }}
                  >
                    {d.customEnd}
                  </button>
                </span>
              )}
            </div>
            {customEnd && (
              <div className="field">
                <label htmlFor="expires">{d.expires}</label>
                <input
                  id="expires"
                  type="date"
                  value={p.certificateExpires ?? ""}
                  onChange={(e) => {
                    set("certificateExpires", e.target.value || null);
                    clearError("expires");
                  }}
                  onBlur={checkEnded}
                  {...errorProps("expires")}
                />
                {errorText("expires")}
                {defaultExpiry && (
                  <span className={s.hint}>
                    <button
                      type="button"
                      className={s.inlineBtn}
                      onClick={() => {
                        setCustomEnd(false);
                        set("certificateExpires", defaultExpiry);
                      }}
                    >
                      {d.useRuleEnd(formatDate(defaultExpiry, locale))}
                    </button>
                  </span>
                )}
              </div>
            )}
            </>
          )}
        </div>
      </section>

      </fieldset>
      <dialog
        ref={expiredDialog}
        className={s.dialog}
        aria-labelledby="expired-title"
        aria-describedby="expired-body"
        onClose={() => document.getElementById(dateField)?.focus()}
      >
        <h2 id="expired-title">{nurse ? d.expiredTitleNurse : d.expiredTitle}</h2>
        <div id="expired-body">
          <p className={s.dialogQuestion}>{nurse ? d.expiredQuestionNurse : d.expiredQuestion}</p>
          <p className="muted">{nurse ? d.expiredBodyNurse : d.expiredBody}</p>
        </div>
        {/* a button, not <form method="dialog">: this dialog sits inside the profile form */}
        <div className={s.dialogActions}>
          <button type="button" className="btn btn-primary" autoFocus onClick={() => expiredDialog.current?.close()}>{d.expiredFix}</button>
        </div>
      </dialog>
      <div className={s.actions}>
        {readOnly ? (
          <span className="small muted">{dict.demo.readOnly}</span>
        ) : (
          <button className="btn btn-primary" disabled={busy}>{busy ? d.saving : d.save}</button>
        )}
        <span role="status" className={msg?.ok ? "badge badge-ok" : undefined}>{msg?.ok ? msg.text : null}</span>
        {msg && !msg.ok && <div role="alert" className={`alert alert-bad ${s.saveError}`}>{msg.text}</div>}
      </div>
    </form>
  );
}
