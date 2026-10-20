"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profession, Profile } from "@/lib/types";
import { addYears, requiredPoints, ruleRequiredPoints, RULES } from "@/lib/rules";
import { OTHER_SPECIALTY, resolveSpecialty, specialtyByCode } from "@/lib/specialties";
import { formatDate, t, type Locale } from "@/lib/i18n";
import SpecialtyPicker from "./SpecialtyPicker";
import s from "./profile.module.css";

type FieldErrors = Partial<Record<"fullName" | "specialtyText" | "override", string>>;

const MAX_REQUIRED = 5000;

export default function ProfileForm({ initial, locale }: { initial: Profile; locale: Locale }) {
  const dict = t(locale);
  const d = dict.profile;
  const professions = dict.professions;
  const router = useRouter();
  const [p, setP] = useState<Profile>(initial);
  const [spec, setSpec] = useState(() => resolveSpecialty(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setMsg(null);
    setP((prev) => ({ ...prev, [k]: v }));
  };
  const clearError = (k: keyof FieldErrors) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined }));

  /** Kind or profession changes the rule; an override that only repeated the old rule goes with it */
  const setRuleInput = (patch: Partial<Pick<Profile, "profession" | "certificationKind">>) => {
    setMsg(null);
    setP((prev) => {
      const next = { ...prev, ...patch };
      if (prev.requiredPointsOverride === ruleRequiredPoints(prev)) next.requiredPointsOverride = null;
      return next;
    });
  };

  const defaultExpiry = p.certificateIssued ? addYears(p.certificateIssued, RULES.validityYears) : null;
  const ruleTarget = ruleRequiredPoints(p);
  const override = p.requiredPointsOverride;
  const hasOverride = override != null && override !== ruleTarget;
  const target = requiredPoints(p);

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!p.fullName.trim()) e.fullName = dict.api.nameRequired;
    if (spec.code === OTHER_SPECIALTY && !spec.text.trim()) e.specialtyText = d.specialtyOtherRequired;
    if (override != null && (!Number.isInteger(override) || override < 1 || override > MAX_REQUIRED)) e.override = dict.api.requiredPointsInvalid;
    return e;
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const found = validate();
    setErrors(found);
    const firstBad = (Object.keys(found) as (keyof FieldErrors)[])[0];
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    const listed = specialtyByCode(spec.code);
    const body: Profile = {
      ...p,
      specialtyCode: spec.code,
      specialty: listed ? listed.lv : spec.code === OTHER_SPECIALTY ? spec.text.trim() : "",
      requiredPointsOverride: hasOverride ? override : null,
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
            <label htmlFor="specialty">{d.specialty}</label>
            <SpecialtyPicker
              id="specialty"
              code={spec.code}
              locale={locale}
              labels={{ other: d.specialtyOther, placeholder: d.specialtyPlaceholder, noMatch: d.specialtyNoMatch }}
              onChange={(code) => {
                setMsg(null);
                setSpec((prev) => ({ code, text: code === OTHER_SPECIALTY ? prev.text : "" }));
                clearError("specialtyText");
              }}
            />
            <span className={s.hint}>{d.specialtyHint}</span>
          </div>
          {spec.code === OTHER_SPECIALTY && (
            <div className={`field ${s.wide}`}>
              <label htmlFor="specialtyText">{d.specialtyOtherLabel}</label>
              <input
                id="specialtyText"
                value={spec.text}
                maxLength={120}
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
          <h2 id="sec-cert">{d.sectionCert}</h2>
          <p className="small muted">{d.sectionCertNote}</p>
          <p className={s.summary} aria-live="polite">
            {d.summary(target, p.certificateExpires ? formatDate(p.certificateExpires, locale) : null)}
          </p>
          {!p.certificateExpires && <p className="small muted">{d.summaryNoDate}</p>}
        </div>
        <div className={s.fields}>
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
            <span id="kind-hint" className={s.hint}>
              {p.certificationKind === "method" ? d.kindMethodHint : d.kindSpecialtyHint}
            </span>
          </div>
          <div className="field">
            <label htmlFor="certNo">{d.certNo}</label>
            <input id="certNo" value={p.certificateNumber} onChange={(e) => set("certificateNumber", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="issued">{d.issued}</label>
            <input
              id="issued"
              type="date"
              value={p.certificateIssued ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setMsg(null);
                setP((prev) => ({
                  ...prev,
                  certificateIssued: v,
                  certificateExpires: v ? addYears(v, RULES.validityYears) : prev.certificateExpires,
                }));
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="expires">{d.expires}</label>
            <input id="expires" type="date" value={p.certificateExpires ?? ""} onChange={(e) => set("certificateExpires", e.target.value || null)} />
            {defaultExpiry && p.certificateExpires !== defaultExpiry && (
              <span className={s.hint}>{d.ruleDefault(formatDate(defaultExpiry, locale), RULES.validityYears)}</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="override">{d.required}</label>
            <input
              id="override"
              type="number"
              min={1}
              max={MAX_REQUIRED}
              step={1}
              inputMode="numeric"
              placeholder={d.requiredPlaceholder(ruleTarget)}
              value={override ?? ""}
              onChange={(e) => {
                set("requiredPointsOverride", e.target.value ? Number(e.target.value) : null);
                clearError("override");
              }}
              {...errorProps("override")}
            />
            {errorText("override")}
            {hasOverride ? (
              <span className={s.hint}>
                {d.overrideNote(override, ruleTarget)}{" "}
                <button
                  type="button"
                  className={s.inlineBtn}
                  onClick={() => {
                    set("requiredPointsOverride", null);
                    clearError("override");
                  }}
                >
                  {d.useRule}
                </button>
              </span>
            ) : (
              <span className={s.hint}>{d.requiredHint(ruleTarget)}</span>
            )}
          </div>
        </div>
      </section>

      <div className={s.actions}>
        <button className="btn btn-primary" disabled={busy}>{busy ? d.saving : d.save}</button>
        <span role="status" className={msg?.ok ? "badge badge-ok" : undefined}>{msg?.ok ? msg.text : null}</span>
        {msg && !msg.ok && <div role="alert" className={`alert alert-bad ${s.saveError}`}>{msg.text}</div>}
      </div>
    </form>
  );
}
