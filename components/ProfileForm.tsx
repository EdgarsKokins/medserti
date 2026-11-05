"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profession, Profile } from "@/lib/types";
import { addYears, certificateWindow, REGISTER_URL, ruleBasis, ruleRequiredPoints, RULES } from "@/lib/rules";
import { findSpecialty, OTHER_SPECIALTY, resolveSpecialty, specialtiesFor, specialtyByCode } from "@/lib/specialties";
import { inHours, type Locale } from "@/lib/locale";
import { useDict } from "@/components/i18n/DictProvider";
import { profileComplete } from "@/lib/profile";
import { CERT_NO_MAX, NAME_MAX, SPECIALTY_MAX, validCertNo, validName, validPlainText } from "@/lib/validation";
import SpecialtyPicker from "./SpecialtyPicker";
import ExtraCertificates from "./ExtraCertificates";
import MonthYearInput from "./MonthYearInput";
import s from "./profile.module.css";
import { formatDate, todayLv } from "@/lib/format";
import { reportFailure } from "@/components/monitoring/report";
import { trackEvent } from "@/components/monitoring/track";

type FieldErrors = Partial<Record<"fullName" | "specialtyText" | "certNo" | "expires", string>>;

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
  const dict = useDict();
  const professions = dict.professions;
  const router = useRouter();
  // method certificates are no longer offered; a profile saved as one is edited as a specialty certificate
  const [p, setP] = useState<Profile>({ ...initial, certificationKind: "specialty" });
  // nurses count academic hours, not TIP (Reg. 630 Annex 6)
  const d = (p.profession === "nurse" ? inHours(dict) : dict).profile;
  // a method picked before is not on the specialty list: start empty so the user picks their specialty
  const [spec, setSpec] = useState(() => {
    const r = resolveSpecialty(initial);
    const list = specialtiesFor(initial.profession);
    return r.code && r.code !== OTHER_SPECIALTY && list.length > 0 && !list.some((x) => x.code === r.code) ? { code: null, text: "" } : r;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  // "Citi sertifikāti": row index -> what is missing
  const [extraErrors, setExtraErrors] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // "Certification needed": the dates put the certificate period in the past, so this is not recertification
  const expiredDialog = useRef<HTMLDialogElement>(null);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setMsg(null);
    setP((prev) => ({ ...prev, [k]: v }));
  };
  const clearError = (k: keyof FieldErrors) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined }));

  // arriving from the dashboard's date alert or the guided tour: the keyboard lands on the field
  useEffect(() => {
    if (window.location.hash === "#expires") document.getElementById("expires")?.focus();
  }, []);

  const specList = useMemo(() => specialtiesFor(p.profession), [p.profession]);
  // the rule can depend on the specialty picked but not yet saved (physiotherapists, Reg. 391 point 86)
  const ruleInput = { ...p, specialtyCode: spec.code, specialty: specialtyByCode(spec.code)?.lv ?? spec.text };
  const ruleTarget = ruleRequiredPoints(ruleInput);
  const basis = ruleBasis(ruleInput);
  const nurse = p.profession === "nurse";

  /** Profession changes the rule */
  const setRuleInput = (patch: Partial<Pick<Profile, "profession">>) => {
    setMsg(null);
    const next = { ...p, ...patch };
    setP(next);
    // the specialty follows the new profession's list; a value that does not fit it is dropped, so only one specialty field shows
    const list = specialtiesFor(next.profession);
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

  // a profile saved with a start date only (before the month field) shows the month that start implies
  const validUntil = p.certificateExpires ?? (p.certificateIssued ? addYears(p.certificateIssued, RULES.validityYears) : null);

  // the requirement always follows the rules; an override stored before is ignored
  const target = ruleTarget;
  const today = todayLv();
  /** The certificate (or VI registration) period has already ended */
  const ended = (q: Profile) => {
    const end = certificateWindow(q).end;
    return !!end && end < today;
  };
  const dateField = "expires";
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
    // the date sets the period points count in: without it nothing on the dashboard can be right
    if (!validUntil) e[dateField] = d.dateRequired;
    if (ended(p)) e[dateField] = dict.api.certExpired;
    return e;
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const found = validate();
    setErrors(found);
    const extraFound: Record<number, string> = {};
    (p.extraCertificates ?? []).forEach((c, i) => {
      if (!c.specialty.trim()) extraFound[i] = d.specialtyOtherRequired;
      else if (!c.certificateExpires && !c.certificateIssued) extraFound[i] = d.dateRequired;
    });
    setExtraErrors(extraFound);
    const firstBad = (Object.keys(found) as (keyof FieldErrors)[])[0];
    // a past deadline is never saved; the dialog explains why and sends the user back to the date
    if (found[dateField] === dict.api.certExpired) return expiredDialog.current?.showModal();
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    const badExtra = Object.keys(extraFound)[0];
    if (badExtra != null) {
      document.getElementById(`extra-until-${badExtra}`)?.focus();
      return;
    }
    const listed = specialtyByCode(spec.code);
    const body: Profile = {
      ...p,
      specialtyCode: spec.code,
      specialty: listed ? listed.lv : spec.code === OTHER_SPECIALTY ? spec.text.trim() : "",
    };
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res || !res.ok) reportFailure("profileSave", res);
    if (!res) return setMsg({ ok: false, text: dict.common.networkError });
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? d.saveError });
    if (profileComplete(data.profile)) {
      if (onboarding) trackEvent("Profile completed");
      router.push("/dashboard");
      return router.refresh();
    }
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
      <section className={`card ${s.section}`} aria-labelledby="sec-you">
        <div className={s.intro}>
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

      <section className={`card ${s.section}`} aria-labelledby="sec-cert">
        <div className={s.intro}>
          <h2 id="sec-cert">{nurse ? d.sectionRegistration : d.sectionCert}</h2>
          <p className="small muted">{nurse ? d.sectionRegistrationNote : d.sectionCertNote}</p>
        </div>
        <div className={s.fields}>
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
          {/* only the month and year it is valid until: few know the day, and testers reached for the end date first
              (Ineta Ūdra, Ralfs Gauja, November 2026). The period is the 5 years before it (Reg. 391 point 6, Reg. 630 point 33). */}
          <div className="field">
            <label htmlFor="expires">{nurse ? d.registrationUntil : d.validUntil}</label>
            <MonthYearInput
              id="expires"
              value={validUntil}
              locale={locale}
              labels={{ month: d.month, year: d.year }}
              invalid={!!errors.expires}
              describedBy={errors.expires ? "expires-error" : "expires-hint"}
              onBlur={checkEnded}
              onChange={(v) => {
                setMsg(null);
                clearError("expires");
                // an exact start saved before no longer matches a new month: the start follows the month
                setP((prev) => ({ ...prev, certificateExpires: v, certificateIssued: null }));
              }}
            />
            {errorText("expires")}
          </div>
          <p id="expires-hint" className={`${s.hint} ${s.fullRow}`}>
            {nurse ? d.registrationUntilHint : d.validUntilHint} {d.registerCheck}{" "}
            <a href={REGISTER_URL} target="_blank" rel="noreferrer">{d.registerLink} ↗</a>
          </p>
        </div>
        {/* what the fields add up to; the rule behind the number is one click away */}
        <div className={s.goal}>
          <p className={s.goalText} aria-live="polite">
            {d.summary(target, p.certificateExpires ? formatDate(p.certificateExpires, locale) : null)}
          </p>
          {!p.certificateExpires && <p className="small muted">{nurse ? d.summaryNoDateNurse : d.summaryNoDate}</p>}
          <details className={s.more}>
            <summary>{d.ruleMore}</summary>
            <p className="small muted">
              {basis === "nurse"
                ? d.nurseRule
                : basis === "functionalTransition"
                  ? d.functionalTransition
                  : target === RULES.points.doctorTier
                    ? d.ruleDoctorTier
                    : d.ruleOther}
            </p>
          </details>
        </div>
      </section>

      {/* certificates in other specialties; nurses re-register once, in the profession */}
      {!nurse && (
        <ExtraCertificates
          value={p.extraCertificates ?? []}
          onChange={(next) => {
            setExtraErrors({});
            set("extraCertificates", next);
          }}
          list={specList}
          locale={locale}
          d={d}
          errors={extraErrors}
        />
      )}

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
