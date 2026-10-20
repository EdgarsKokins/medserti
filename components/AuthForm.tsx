"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import DemoButton from "./DemoButton";
import s from "./auth.module.css";

type Field = "fullName" | "email" | "password";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export default function AuthForm({ mode, locale }: { mode: "login" | "register"; locale: Locale }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const d = t(locale);
  const a = d.auth;
  const m = d.api;

  /** Our own messages in the selected language, instead of the browser's validation bubbles */
  function validate(values: Record<Field, string>): Partial<Record<Field, string>> {
    const errs: Partial<Record<Field, string>> = {};
    if (mode === "register" && !values.fullName.trim()) errs.fullName = m.nameRequired;
    if (!EMAIL.test(values.email.trim())) errs.email = m.badEmail;
    if (!values.password) errs.password = m.passwordRequired;
    else if (mode === "register" && values.password.length < MIN_PASSWORD) errs.password = m.passwordShort;
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
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
    const errs = validate(values);
    setFieldErrors(errs);
    const firstBad = (["fullName", "email", "password"] as Field[]).find((k) => errs[k]);
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? a.genericError);
      setBusy(false);
      return;
    }
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
                onChange={() => clearField("fullName")}
                {...invalid("fullName")}
                aria-describedby={describedBy("fullName")}
              />
              {errorText("fullName")}
            </div>
          )}
          <div className="field">
            <label htmlFor="email">{a.email}</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
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
              onChange={() => clearField("password")}
              {...invalid("password")}
              aria-describedby={describedBy("password", mode === "register" ? "password-hint" : undefined)}
            />
            {errorText("password")}
            {mode === "register" && <span id="password-hint" className={s.hint}>{a.passwordHint}</span>}
            {mode === "login" && <Link href="/aizmirsu-paroli" className={s.forgot}>{a.forgotLink}</Link>}
          </div>
          {error && <div className="alert alert-bad" role="alert">{error}</div>}
          <button className={`btn btn-primary ${s.submit}`} disabled={busy}>
            {busy ? a.wait : mode === "login" ? a.loginTitle : a.registerTitle}
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
