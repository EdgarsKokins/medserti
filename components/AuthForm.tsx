"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import s from "./auth.module.css";

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
        <form className={s.form} onSubmit={onSubmit}>
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
      </div>
    </main>
  );
}
