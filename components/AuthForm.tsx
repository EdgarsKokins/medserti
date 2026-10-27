"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { localePath, type Locale } from "@/lib/locale";
import { useDict } from "@/components/i18n/DictProvider";
import type { Profession } from "@/lib/types";
import { EMAIL_MAX, NAME_MAX, PASSWORD_MAX, validEmail, validName, validPassword } from "@/lib/validation";
import DemoButton from "./DemoButton";
import s from "./auth.module.css";
import { trackEvent } from "@/components/monitoring/track";

type Field = "fullName" | "profession" | "email" | "password" | "consent";

/** Sign-up profession list, in the order practitioners look for it; the profile can change it later */
const PROFESSIONS: Profession[] = ["doctor", "dentist", "nurse", "physician_assistant", "midwife", "functional_specialist", "other_practitioner"];

export default function AuthForm({ mode, locale }: { mode: "login" | "register"; locale: Locale }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  // the password is in a known breach: the next submit keeps it if the user chooses to
  const [breached, setBreached] = useState(false);
  const d = useDict();
  const a = d.auth;
  const m = d.api;

  /** Our own messages in the selected language, instead of the browser's validation bubbles */
  function validate(values: Record<Exclude<Field, "consent">, string> & { consent: boolean }): Partial<Record<Field, string>> {
    const errs: Partial<Record<Field, string>> = {};
    if (mode === "register") {
      if (!values.fullName.trim()) errs.fullName = m.nameRequired;
      else if (!validName(values.fullName)) errs.fullName = m.nameInvalid;
    }
    if (mode === "register" && !values.profession) errs.profession = m.professionRequired;
    if (!validEmail(values.email)) errs.email = m.badEmail;
    if (!values.password) errs.password = m.passwordRequired;
    // the range applies to new passwords only; an older, longer password still logs in
    else if (mode === "register" && !validPassword(values.password)) errs.password = m.passwordShort;
    if (mode === "register" && !values.consent) errs.consent = d.legal.consent.required;
    return errs;
  }

  const clearField = (k: Field) => fieldErrors[k] && setFieldErrors((e) => ({ ...e, [k]: undefined }));
  const invalid = (k: Field) => (fieldErrors[k] ? { "aria-invalid": true as const } : {});
  const describedBy = (k: Field, hint?: string) =>
    [fieldErrors[k] ? `${k}-error` : null, hint].filter(Boolean).join(" ") || undefined;
  const errorText = (k: Field) =>
    fieldErrors[k] ? <span id={`${k}-error`} className={s.error}>{fieldErrors[k]}</span> : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const values = {
      fullName: String(form.get("fullName") ?? ""),
      profession: String(form.get("profession") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      consent: form.get("consent") === "on",
    };
    const errs = validate(values);
    setFieldErrors(errs);
    const firstBad = (["fullName", "profession", "email", "password", "consent"] as Field[]).find((k) => errs[k]);
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    if (!res?.ok) {
      setError(res ? (body.error ?? a.genericError) : d.common.networkError);
      setBreached(body.code === "breached");
      setBusy(false);
      return;
    }
    if (mode === "register") trackEvent("Signup completed");
    router.push(mode === "register" ? "/profile?welcome=1" : "/dashboard");
    router.refresh();
  }

  return (
    <main className={s.page}>
      <div className={s.brand}>
        <span className={`brand-seal ${s.seal}`} aria-hidden>M</span>
        <strong className={s.wordmark}>{d.brand.name}</strong>
        <span className={s.tagline}>{d.brand.tagline}</span>
      </div>

      <section className={s.value} aria-label={a.valueTitle}>
        <ol className={s.points}>
          {a.valuePoints.map((point, i) => (
            <li key={i}>
              <span className={s.num} aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <span>{point}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className={s.card}>
        <h1 className={s.title}>{mode === "login" ? a.loginTitle : a.registerTitle}</h1>
        <p className={s.lead}>{mode === "login" ? a.loginLead : a.registerLead}</p>
        <form className={s.form} onSubmit={onSubmit} noValidate>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="fullName">{a.fullName}</label>
              <input
                id="fullName"
                name="fullName"
                autoComplete="name"
                maxLength={NAME_MAX}
                onChange={() => clearField("fullName")}
                {...invalid("fullName")}
                aria-describedby={describedBy("fullName")}
              />
              {errorText("fullName")}
            </div>
          )}
          {mode === "register" && (
            <div className="field">
              <label htmlFor="profession">{a.profession}</label>
              <select
                id="profession"
                name="profession"
                defaultValue=""
                onChange={() => clearField("profession")}
                {...invalid("profession")}
                aria-describedby={describedBy("profession")}
              >
                <option value="" disabled>{a.professionPick}</option>
                {PROFESSIONS.map((p) => (
                  <option key={p} value={p}>{d.professions[p]}</option>
                ))}
              </select>
              {errorText("profession")}
            </div>
          )}
          <div className="field">
            <label htmlFor="email">{a.email}</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={EMAIL_MAX}
              onChange={() => clearField("email")}
              {...invalid("email")}
              aria-describedby={describedBy("email")}
            />
            {errorText("email")}
          </div>
          <div className="field">
            <label htmlFor="password">{a.password}</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              maxLength={mode === "register" ? PASSWORD_MAX : undefined}
              onChange={() => {
                clearField("password");
                if (breached) {
                  setBreached(false);
                  setError(null);
                }
              }}
              {...invalid("password")}
              aria-describedby={describedBy("password", mode === "register" ? "password-hint" : undefined)}
            />
            {errorText("password")}
            {mode === "register" && <span id="password-hint" className={s.hint}>{a.passwordHint}</span>}
            {mode === "login" && <Link href="/aizmirsu-paroli" className={s.forgot}>{a.forgotLink}</Link>}
          </div>
          {mode === "register" && (
            <div className={s.consent}>
              <label className={s.consentLabel}>
                <input
                  id="consent"
                  name="consent"
                  type="checkbox"
                  required
                  onChange={() => clearField("consent")}
                  {...invalid("consent")}
                  aria-describedby={describedBy("consent")}
                />
                <span>
                  {d.legal.consent.agree}{" "}
                  <Link href={localePath("/noteikumi", locale)} target="_blank">{d.legal.consent.terms}</Link>{" "}
                  {d.legal.consent.and}{" "}
                  <Link href={localePath("/privatums", locale)} target="_blank">{d.legal.consent.privacy}</Link>
                </span>
              </label>
              {errorText("consent")}
            </div>
          )}
          {error && <div className={`alert ${breached ? "alert-warn" : "alert-bad"}`} role="alert">{error}</div>}
          {breached && <input type="hidden" name="acceptBreached" value="on" />}
          <button className={`btn btn-primary ${s.submit}`} disabled={busy}>
            {busy ? a.wait : breached ? m.passwordBreachedContinue : mode === "login" ? a.loginTitle : a.registerTitle}
          </button>
        </form>
        <p className={s.switch}>
          {mode === "login" ? (
            <>{a.noAccount} <Link href="/register">{a.signup}</Link></>
          ) : (
            <>{a.already} <Link href="/login">{a.login}</Link></>
          )}
        </p>
        {mode === "login" && (
          <div className={s.demo}>
            <DemoButton label={d.demo.try} className={`btn ${s.submit}`} />
          </div>
        )}
      </div>
    </main>
  );
}
