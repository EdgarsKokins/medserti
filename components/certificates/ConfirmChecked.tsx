"use client";

import { useState } from "react";
import type { CmeCertificate } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";
import { formatDate, formatNumber } from "./format";
import styles from "./certificates.module.css";

/**
 * "Confirm all checked (N)": one click confirms every certificate the parser read with all key fields sure
 * (lib/parse/confidence.ts confirmCheckedEligible). Shows the list first so it is a conscious glance, not a blind click.
 * The server checks eligibility again and only confirms what it agrees with.
 */
export default function ConfirmChecked({
  items,
  locale,
  onConfirmed,
}: {
  items: CmeCertificate[];
  locale: Locale;
  onConfirmed: (certs: CmeCertificate[]) => void;
}) {
  const d = t(locale).certs;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  if (!items.length && done == null) return null;
  if (!items.length) return <p className={`small ${styles.confirmDone}`} role="status">{d.confirmCheckedDone(done!)}</p>;

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/certificates/confirm-checked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: items.map((c) => c.id) }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(body.error ?? d.confirmCheckedError);
    const confirmed: CmeCertificate[] = body.certificates ?? [];
    setOpen(false);
    setDone(confirmed.length);
    onConfirmed(confirmed);
  }

  return (
    <div className={styles.confirmChecked}>
      {!open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          {d.confirmChecked(items.length)}
        </button>
      ) : (
        <div className={styles.confirmBox} role="group" aria-labelledby="confirm-checked-intro">
          <p id="confirm-checked-intro" className="small">{d.confirmCheckedIntro}</p>
          <ul className={styles.confirmList}>
            {items.map((c) => (
              <li key={c.id}>
                <span className={styles.confirmTitle}>{c.title}</span>
                <span className="small muted">{formatDate(c.date, locale)}</span>
                <span className="small">{formatNumber(c.points, locale)} TIP</span>
              </li>
            ))}
          </ul>
          {error && <p className="alert alert-bad small" role="alert">{error}</p>}
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>
              {d.confirmCheckedGo(items.length)}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>
              {d.confirmCheckedCancel}
            </button>
          </div>
        </div>
      )}
      {done != null && !open && <p className={`small ${styles.confirmDone}`} role="status">{d.confirmCheckedDone(done)}</p>}
    </div>
  );
}
