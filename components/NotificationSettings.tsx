"use client";

import { useState } from "react";
import { useDict } from "@/components/i18n/DictProvider";
import { inHours } from "@/lib/locale";
import type { NotificationPrefs } from "@/lib/types";
import s from "@/components/profile.module.css";

/** Profile, "E-pasta paziņojumi": which emails the account gets (lib/notifications.ts sends them) */
export default function NotificationSettings({ initial, email, nurse }: { initial: NotificationPrefs; email: string; nurse: boolean }) {
  const base = useDict();
  const m = (nurse ? inHours(base) : base).notify;
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = prefs.reminders !== saved.reminders || prefs.courseAlerts !== saved.courseAlerts;

  const toggle = (k: keyof NotificationPrefs) => {
    setMsg(null);
    setPrefs((p) => ({ ...p, [k]: !p[k] }));
  };

  async function save() {
    setBusy(true);
    const res = await fetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setSaved(prefs);
      setMsg({ ok: true, text: m.saved });
    } else setMsg({ ok: false, text: m.failed });
  }

  return (
    <section className={s.section} aria-labelledby="sec-notify">
      <div className={s.aside}>
        <h2 id="sec-notify">{m.title}</h2>
        <p className="small muted">{m.sentTo(email)}</p>
      </div>
      <div className={s.fields}>
        <label className={s.toggle}>
          <input type="checkbox" checked={prefs.reminders} onChange={() => toggle("reminders")} />
          <span>
            <strong>{m.reminders}</strong>
            <br />
            <span className="small muted">{nurse ? m.remindersHintNurse : m.remindersHint}</span>
          </span>
        </label>
        <label className={s.toggle}>
          <input type="checkbox" checked={prefs.courseAlerts} onChange={() => toggle("courseAlerts")} />
          <span>
            <strong>{m.courseAlerts}</strong>
            <br />
            <span className="small muted">{nurse ? m.courseAlertsHintNurse : m.courseAlertsHint}</span>
          </span>
        </label>
        <div className={s.fullRow}>
          <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>
            {m.save}
          </button>
        </div>
        {msg && (
          <p className={`alert ${msg.ok ? "alert-ok" : ""} ${s.fullRow}`} role="status">
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}
