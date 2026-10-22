"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDict } from "@/components/i18n/DictProvider";
import { EMAIL_MAX, FEEDBACK_MAX, validEmail } from "@/lib/validation";
import { trackEvent } from "./track";
import s from "./reportProblem.module.css";

/**
 * "Ziņot par problēmu": a small text button that opens a short form, sent to /api/feedback (stored, emailed to info@).
 * The dialog is rendered into <body>, so it can sit inside another form or dialog (the review panel) without nesting.
 */
export default function ReportProblem({ certId, demo = false, className }: { certId?: string; demo?: boolean; className?: string }) {
  const d = useDict();
  const f = d.feedback;
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [includePage, setIncludePage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "message" | "email" | null; text: string } | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => setMounted(true), []);

  function open() {
    setSent(false);
    setError(null);
    dialog.current?.showModal();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = message.trim();
    if (!text || [...text].length > FEEDBACK_MAX) return setError({ field: "message", text: f.invalid });
    if (demo && email.trim() && !validEmail(email)) return setError({ field: "email", text: d.api.badEmail });
    setBusy(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        route: includePage ? window.location.pathname : null,
        certId: includePage ? (certId ?? null) : null,
        ...(demo ? { email: email.trim() } : {}),
      }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    if (!res) return setError({ field: null, text: d.common.networkError });
    if (!res.ok) return setError({ field: body.field === "email" ? "email" : null, text: body.error ?? f.failed });
    trackEvent("Problem reported");
    setMessage("");
    setSent(true);
  }

  const invalid = (field: "message" | "email") =>
    error?.field === field ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};

  return (
    <>
      <button type="button" className={`${s.trigger} ${className ?? ""}`} onClick={open}>
        {f.button}
      </button>
      {mounted &&
        createPortal(
          <dialog ref={dialog} className={s.dialog} aria-labelledby={`${id}-title`} onClose={() => setSent(false)}>
            <h2 id={`${id}-title`}>{f.title}</h2>
            {sent ? (
              <>
                <div className="alert alert-ok" role="status">{f.thanks}</div>
                <div className={s.actions}>
                  <button type="button" className="btn btn-primary" autoFocus onClick={() => dialog.current?.close()}>{f.close}</button>
                </div>
              </>
            ) : (
              <form onSubmit={submit} noValidate>
                <p className="muted">{f.lead}</p>
                <div className="field">
                  <label htmlFor={`${id}-message`}>{f.messageLabel}</label>
                  <textarea
                    id={`${id}-message`}
                    rows={5}
                    maxLength={FEEDBACK_MAX}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    autoFocus
                    {...invalid("message")}
                  />
                  <span className={`small muted ${s.count}`} aria-hidden>{[...message].length}/{FEEDBACK_MAX}</span>
                </div>
                {demo && (
                  <div className="field">
                    <label htmlFor={`${id}-email`}>{f.emailLabel}</label>
                    <input id={`${id}-email`} type="email" autoComplete="email" maxLength={EMAIL_MAX} value={email} onChange={(e) => setEmail(e.target.value)} {...invalid("email")} />
                  </div>
                )}
                <label className={s.check}>
                  <input type="checkbox" checked={includePage} onChange={(e) => setIncludePage(e.target.checked)} />
                  <span>{certId ? f.includeCert : f.includePage}</span>
                </label>
                <p className={`small muted ${s.note}`}>{demo ? f.noteDemo : f.note}</p>
                {error && <div id={`${id}-error`} className="alert alert-bad" role="alert">{error.text}</div>}
                <div className={s.actions}>
                  <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? f.sending : f.send}</button>
                  <button type="button" className="btn" onClick={() => dialog.current?.close()}>{f.cancel}</button>
                </div>
              </form>
            )}
          </dialog>,
          document.body,
        )}
    </>
  );
}
