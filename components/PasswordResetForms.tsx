"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { PASSWORD_MAX, validPassword } from "@/lib/validation";
import s from "./auth.module.css";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Brand header and card, same frame as the login page */
function Frame({ locale, title, lead, children }: { locale: Locale; title: string; lead: string; children: React.ReactNode }) {
  const d = t(locale);
  return (
    <main className={s.page}>
      <div className={s.brand}>
        <span className={`brand-seal ${s.seal}`} aria-hidden>M</span>
        <strong className={s.wordmark}>{d.brand.name}</strong>
        <span className={s.tagline}>{d.brand.tagline}</span>
      </div>
      <div className={s.card}>
        <h1 className={s.title}>{title}</h1>
        <p className={s.lead}>{lead}</p>
        {children}
        <p className={s.switch}>
          <Link href="/login">{d.reset.backToLogin}</Link>
        </p>
      </div>
    </main>
  );
}

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const d = t(locale);
  const r = d.reset;
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!EMAIL.test(email)) {
      setFieldError(d.api.badEmail);
      document.getElementById("email")?.focus();
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? d.auth.genericError);
    setSent(true);
  }

  return (
    <Frame locale={locale} title={r.forgotTitle} lead={r.forgotLead}>
      {sent ? (
        <div className="alert alert-ok" role="status">{r.sent}</div>
      ) : (
        <form className={s.form} onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">{d.auth.email}</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              onChange={() => fieldError && setFieldError(null)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "email-error" : undefined}
            />
            {fieldError && <span id="email-error" className={s.error}>{fieldError}</span>}
          </div>
          {error && <div className="alert alert-bad" role="alert">{error}</div>}
          <button className={`btn btn-primary ${s.submit}`} disabled={busy}>{busy ? d.auth.wait : r.send}</button>
        </form>
      )}
    </Frame>
  );
}

export function ResetPasswordForm({ locale, token }: { locale: Locale; token: string | null }) {
  const router = useRouter();
  const d = t(locale);
  const r = d.reset;
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dead, setDead] = useState(!token);
  const [busy, setBusy] = useState(false);

  if (dead)
    return (
      <Frame locale={locale} title={r.invalidTitle} lead={r.invalidBody}>
        <Link className={`btn btn-primary ${s.submit}`} href="/aizmirsu-paroli">{r.requestNew}</Link>
      </Frame>
    );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    const msg = !password ? d.api.passwordRequired : !validPassword(password) ? d.api.passwordShort : null;
    if (msg) {
      setFieldError(msg);
      document.getElementById("password")?.focus();
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      if (body.code === "invalid_token") return setDead(true);
      return setError(body.error ?? d.auth.genericError);
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Frame locale={locale} title={r.newTitle} lead={r.newLead}>
      <form className={s.form} onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="password">{r.newPassword}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            onChange={() => fieldError && setFieldError(null)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={[fieldError ? "password-error" : null, "password-hint"].filter(Boolean).join(" ")}
          />
          {fieldError && <span id="password-error" className={s.error}>{fieldError}</span>}
          <span id="password-hint" className={s.hint}>{d.auth.passwordHint}</span>
        </div>
        {error && <div className="alert alert-bad" role="alert">{error}</div>}
        <button className={`btn btn-primary ${s.submit}`} disabled={busy}>{busy ? d.auth.wait : r.save}</button>
      </form>
    </Frame>
  );
}
