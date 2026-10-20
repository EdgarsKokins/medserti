"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import s from "./deleteAccount.module.css";

/** "Delete account" on /profile: opens a password check, then deletes everything and goes to the landing page */
export default function DeleteAccount({ locale }: { locale: Locale }) {
  const d = t(locale).legal.deleteAccount;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError(t(locale).api.passwordRequired);
      document.getElementById("delete-password")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}));
      setError(body?.error ?? d.failed);
      setBusy(false);
      return;
    }
    // full navigation: the session cookie is gone, so no cached signed-in page may show
    window.location.assign("/?deleted=1");
  }

  return (
    <section className={s.box} aria-labelledby="delete-account-title">
      <div>
        <h2 id="delete-account-title" className={s.title}>{d.title}</h2>
        <p className={s.note}>{d.note}</p>
      </div>
      <div>
        <p className={s.body}>{d.body}</p>
        {!open ? (
          <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>{d.open}</button>
        ) : (
          <form className={s.form} onSubmit={onSubmit} noValidate>
            <div className="field">
              <label htmlFor="delete-password">{d.confirmLabel}</label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "delete-error" : undefined}
              />
            </div>
            {error && <div id="delete-error" className="alert alert-bad" role="alert">{error}</div>}
            <div className={s.actions}>
              <button className={`btn ${s.danger}`} disabled={busy}>{busy ? d.deleting : d.confirm}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => { setOpen(false); setPassword(""); setError(null); }}>
                {d.cancel}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
