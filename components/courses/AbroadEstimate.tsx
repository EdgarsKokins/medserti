"use client";

import { useId, useMemo, useState } from "react";
import { ABROAD_KINDS, daysBetween, estimateAbroad, type AbroadEstimate, type AbroadKind } from "@/lib/abroad";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { useDict } from "@/components/i18n/DictProvider";
import { COUNTRY_CODES, countryName } from "@/components/certificates/format";
import styles from "./courses.module.css";

/**
 * "Course abroad: how many TIP?" Both the /courses estimator and the review panel of a foreign certificate show the
 * same result block, so the doctor sees one rule before the trip and after it (lib/abroad.ts).
 */
export function AbroadResult({ estimate, kind }: { estimate: AbroadEstimate; kind?: AbroadKind }) {
  const a = useDict().courses.abroad;
  const n = (v: number) => formatNumber(v, 1);
  return (
    <div className={styles.abroadResult} aria-live="polite">
      <strong>{a.estimate}: </strong>
      {estimate.basis === "credits" ? a.fromCredits(n(estimate.tip!)) : estimate.basis === "hours" ? a.fromHours(n(estimate.tip!)) : a.none}
      {estimate.capped && <> {a.capped}</>}
      {estimate.recalculatedMax != null && <p className={styles.abroadLine}>{a.recalc(n(estimate.recalculatedMax))}</p>}
      <p className={styles.abroadLine}>{a.bring}</p>
      <ul className={styles.abroadProof}>
        <li>{a.proofCertificate}</li>
        <li>{a.proofProgramme}</li>
        {(kind === "live_surgery" || kind === "workshop") && <li>{a.proofHandsOn}</li>}
      </ul>
      <p className={`small muted ${styles.abroadLine}`}>{a.note}</p>
    </div>
  );
}

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")) || null);

/** The /courses estimator: a doctor checks a course abroad before going */
export default function AbroadEstimator({ locale }: { locale: Locale }) {
  const a = useDict().courses.abroad;
  const id = useId();
  const [country, setCountry] = useState("");
  const [kind, setKind] = useState<AbroadKind>("conference");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hours, setHours] = useState("");
  const [credits, setCredits] = useState("");
  const countries = useMemo(
    () => [...COUNTRY_CODES].sort((x, y) => countryName(x, locale).localeCompare(countryName(y, locale), locale)),
    [locale],
  );
  const days = daysBetween(from || null, to || null);
  const estimate = estimateAbroad({ credits: num(credits), hours: num(hours), days });
  const asked = !!(from || hours || credits);

  return (
    <details className={`card ${styles.abroad}`}>
      <summary className={styles.abroadTitle}>{a.title}</summary>
      <p className="small muted">{a.lead}</p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-country`}>{a.country}</label>
          <select id={`${id}-country`} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">-</option>
            {countries.map((c) => (
              <option key={c} value={c}>{countryName(c, locale)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-kind`}>{a.kind}</label>
          <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as AbroadKind)}>
            {ABROAD_KINDS.map((k) => (
              <option key={k} value={k}>{a.kinds[k]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-from`}>{a.from}</label>
          <input id={`${id}-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-to`}>{a.to}</label>
          <input id={`${id}-to`} type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-hours`}>{a.hours}</label>
          <input id={`${id}-hours`} type="number" min={0} max={200} step="0.5" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} aria-describedby={`${id}-hours-hint`} />
          <span id={`${id}-hours-hint`} className="small muted">{a.hoursHint}</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-credits`}>{a.credits}</label>
          <input id={`${id}-credits`} type="number" min={0} max={200} step="0.5" inputMode="decimal" value={credits} onChange={(e) => setCredits(e.target.value)} aria-describedby={`${id}-credits-hint`} />
          <span id={`${id}-credits-hint`} className="small muted">{a.creditsHint}</span>
        </div>
      </div>
      {country === "LV" ? (
        <p className={styles.abroadResult}>{a.latvia}</p>
      ) : (
        asked && <AbroadResult estimate={estimate} kind={kind} />
      )}
    </details>
  );
}
