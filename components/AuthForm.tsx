"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";

export default function AuthForm({ mode, locale }: { mode: "login" | "register"; locale: Locale }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = t(locale);
  const a = d.auth;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
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
    <div className="auth-wrap">
      <div className="auth-brand">
        <strong>{d.brand.name}</strong>
        <span className="small muted">{d.brand.tagline}</span>
      </div>
      <div className="card stack">
        <div>
          <h1>{mode === "login" ? a.loginTitle : a.registerTitle}</h1>
          <p className="muted">{mode === "login" ? a.loginLead : a.registerLead}</p>
        </div>
        <form className="stack" onSubmit={onSubmit}>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="fullName">{a.fullName}</label>
              <input id="fullName" name="fullName" required autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">{a.email}</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">{a.password}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {error && <div className="alert alert-bad">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? a.wait : mode === "login" ? a.loginTitle : a.registerTitle}
          </button>
        </form>
        <p className="small muted">
          {mode === "login" ? (
            <>{a.noAccount} <Link href="/register">{a.signup}</Link></>
          ) : (
            <>{a.already} <Link href="/login">{a.login}</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
