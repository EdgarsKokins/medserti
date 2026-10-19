"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profession, Profile } from "@/lib/types";
import { addYears, requiredPoints, RULES } from "@/lib/rules";
import { formatDate, t, type Locale } from "@/lib/i18n";

export default function ProfileForm({ initial, locale }: { initial: Profile; locale: Locale }) {
  const d = t(locale).profile;
  const professions = t(locale).professions;
  const router = useRouter();
  const [p, setP] = useState<Profile>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((prev) => ({ ...prev, [k]: v }));

  const defaultExpiry = p.certificateIssued ? addYears(p.certificateIssued, RULES.validityYears) : null;
  const ruleTarget = useMemo(() => requiredPoints({ ...p, requiredPointsOverride: null }), [p]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? d.saveError });
    setP(body.profile);
    setMsg({ ok: true, text: d.saved });
    router.refresh();
  }

  return (
    <form className="card stack" onSubmit={save}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="fullName">{d.fullName}</label>
          <input id="fullName" value={p.fullName} onChange={(e) => set("fullName", e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="profession">{d.profession}</label>
          <select id="profession" value={p.profession} onChange={(e) => set("profession", e.target.value as Profession)}>
            {Object.entries(professions).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="specialty">{d.specialty}</label>
          <input id="specialty" value={p.specialty} placeholder={d.specialtyPlaceholder} onChange={(e) => set("specialty", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="kind">{d.kind}</label>
          <select id="kind" value={p.certificationKind} onChange={(e) => set("certificationKind", e.target.value as Profile["certificationKind"])}>
            <option value="specialty">{d.kindSpecialty}</option>
            <option value="method">{d.kindMethod}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="certNo">{d.certNo}</label>
          <input id="certNo" value={p.certificateNumber} onChange={(e) => set("certificateNumber", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="issued">{d.issued}</label>
          <input
            id="issued"
            type="date"
            value={p.certificateIssued ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              setP((prev) => ({
                ...prev,
                certificateIssued: v,
                certificateExpires: v ? addYears(v, RULES.validityYears) : prev.certificateExpires,
              }));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="expires">{d.expires}</label>
          <input id="expires" type="date" value={p.certificateExpires ?? ""} onChange={(e) => set("certificateExpires", e.target.value || null)} />
          {defaultExpiry && p.certificateExpires !== defaultExpiry && (
            <span className="small muted">{d.ruleDefault(formatDate(defaultExpiry, locale), RULES.validityYears)}</span>
          )}
        </div>
        <div className="field">
          <label htmlFor="override">{d.required}</label>
          <input
            id="override"
            type="number"
            min={1}
            placeholder={d.requiredPlaceholder(ruleTarget)}
            value={p.requiredPointsOverride ?? ""}
            onChange={(e) => set("requiredPointsOverride", e.target.value ? Number(e.target.value) : null)}
          />
          <span className="small muted">{d.requiredHint(ruleTarget)}</span>
        </div>
      </div>
      {msg && <div className={`alert ${msg.ok ? "alert-ok" : "alert-bad"}`}>{msg.text}</div>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{busy ? d.saving : d.save}</button>
      </div>
    </form>
  );
}
