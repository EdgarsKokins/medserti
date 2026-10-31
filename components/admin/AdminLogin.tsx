"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import s from "./admin.module.css";

/** Password-only sign-in for the /admin text editor */
export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? "Pārāk daudz mēģinājumu. Mēģiniet vēlreiz pēc 15 minūtēm." : "Nepareiza parole.");
        setPassword("");
        return;
      }
      router.refresh();
    } catch {
      setError("Nav savienojuma. Mēģiniet vēlreiz.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={s.login} onSubmit={submit}>
      <h1>Administrēšana</h1>
      <p className="muted">Ievadiet paroli, lai labotu lapas tekstus.</p>
      <div className="field">
        <label htmlFor="admin-password">Parole</label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "admin-password-err" : undefined}
        />
      </div>
      {error && (
        <p id="admin-password-err" className={s.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy || !password}>
        {busy ? "Pārbauda..." : "Ieiet"}
      </button>
    </form>
  );
}
