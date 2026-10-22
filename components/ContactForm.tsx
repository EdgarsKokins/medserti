"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { EMAIL_MAX, MESSAGE_MAX, validEmail, validMessage } from "@/lib/validation";
import s from "./contact.module.css";

type Field = "email" | "message";

export default function ContactForm({ locale }: { locale: Locale }) {
  const d = t(locale);
  const c = d.contact;
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const clear = (k: Field) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined }));
  const fieldProps = (k: Field) =>
    errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-error` } : {};
  const errorText = (k: Field) => (errors[k] ? <span id={`${k}-error`} className={s.error}>{errors[k]}</span> : null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const email = String(form.get("email") ?? "");
    const message = String(form.get("message") ?? "");
    const errs: Partial<Record<Field, string>> = {};
    if (!validEmail(email)) errs.email = d.api.badEmail;
    if (!validMessage(message)) errs.message = c.messageInvalid;
    setErrors(errs);
    const firstBad = (["email", "message"] as Field[]).find((k) => errs[k]);
    if (firstBad) return document.getElementById(firstBad)?.focus();
    setBusy(true);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, message, website: String(form.get("website") ?? "") }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setStatus({ ok: false, text: body?.error ?? c.failed });
    formEl.reset();
    setStatus({ ok: true, text: c.sent });
  }

  return (
    <form className={s.form} onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="email">{c.email}</label>
        <input id="email" name="email" type="email" autoComplete="email" maxLength={EMAIL_MAX} onChange={() => clear("email")} {...fieldProps("email")} />
        {errorText("email")}
      </div>
      <div className="field">
        <label htmlFor="message">{c.message}</label>
        <textarea id="message" name="message" rows={7} maxLength={MESSAGE_MAX} onChange={() => clear("message")} {...fieldProps("message")} />
        {errorText("message")}
      </div>
      {/* honeypot: off-screen and skipped by keyboard and screen readers; a bot that fills it is ignored */}
      <div className={s.trap} aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {status && (
        <div className={`alert ${status.ok ? "alert-ok" : "alert-bad"}`} role={status.ok ? "status" : "alert"}>{status.text}</div>
      )}
      <div>
        <button className="btn btn-primary" disabled={busy}>{busy ? c.sending : c.send}</button>
      </div>
    </form>
  );
}
