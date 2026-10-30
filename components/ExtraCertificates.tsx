"use client";

import type { ExtraCertificate } from "@/lib/types";
import type { Locale } from "@/lib/locale";
import type { Dict } from "@/lib/i18n";
import { addYears, RULES } from "@/lib/rules";
import { OTHER_SPECIALTY, specialtyByCode, type Specialty } from "@/lib/specialties";
import { MAX_EXTRA_CERTS } from "@/lib/profileCerts";
import { CERT_NO_MAX, SPECIALTY_MAX } from "@/lib/validation";
import { formatDate } from "@/lib/format";
import SpecialtyPicker from "./SpecialtyPicker";
import s from "./profile.module.css";

/**
 * Profile, "Citi sertifikāti": certificates in other specialties, each with its own period (Profile.extraCertificates).
 * Saved with the rest of the profile; the server checks them again.
 */
export default function ExtraCertificates({
  value,
  onChange,
  list,
  locale,
  d,
  errors,
}: {
  value: ExtraCertificate[];
  onChange: (next: ExtraCertificate[]) => void;
  /** the specialties of the user's profession; empty: free text */
  list: readonly Specialty[];
  locale: Locale;
  d: Dict["profile"];
  /** row index -> message, for rows without a date */
  errors: Record<number, string>;
}) {
  const update = (i: number, patch: Partial<ExtraCertificate>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const add = () =>
    onChange([...value, { id: crypto.randomUUID(), specialty: "", specialtyCode: null, certificateNumber: "", certificateIssued: null, certificateExpires: null }]);

  return (
    <section className={s.section} aria-labelledby="sec-extra">
      <div className={s.aside}>
        <h2 id="sec-extra">{d.extraTitle}</h2>
        <p className="small muted">{d.extraNote}</p>
        {value.length > 0 && <p className="small muted">{d.extraCounting}</p>}
      </div>
      <div className={s.fields}>
        {value.map((c, i) => {
          const until = c.certificateExpires ?? (c.certificateIssued ? addYears(c.certificateIssued, RULES.validityYears) : null);
          return (
            <fieldset key={c.id} className={`${s.extraCert} ${s.fullRow}`}>
              <legend>{d.extraLabel(i + 1)}</legend>
              <div className={`field ${s.wide}`}>
                <label htmlFor={`extra-spec-${i}`}>{d.specialty}</label>
                {list.length ? (
                  <SpecialtyPicker
                    id={`extra-spec-${i}`}
                    code={c.specialtyCode}
                    list={list}
                    locale={locale}
                    labels={{ other: d.specialtyOther, placeholder: d.specialtyPlaceholder, noMatch: d.specialtyNoMatch }}
                    onChange={(code) => update(i, { specialtyCode: code, specialty: code === OTHER_SPECIALTY ? "" : specialtyByCode(code)?.lv ?? "" })}
                  />
                ) : null}
                {(!list.length || c.specialtyCode === OTHER_SPECIALTY) && (
                  <input
                    id={list.length ? `extra-spec-text-${i}` : `extra-spec-${i}`}
                    aria-label={d.specialtyOtherLabel}
                    value={c.specialty}
                    maxLength={SPECIALTY_MAX}
                    onChange={(e) => update(i, { specialty: e.target.value, specialtyCode: OTHER_SPECIALTY })}
                  />
                )}
              </div>
              <div className="field">
                <label htmlFor={`extra-no-${i}`}>{d.certNo}</label>
                <input id={`extra-no-${i}`} value={c.certificateNumber} maxLength={CERT_NO_MAX} onChange={(e) => update(i, { certificateNumber: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor={`extra-issued-${i}`}>{d.issued}</label>
                <input
                  id={`extra-issued-${i}`}
                  type="date"
                  value={c.certificateIssued ?? ""}
                  aria-invalid={errors[i] ? true : undefined}
                  aria-describedby={errors[i] ? `extra-issued-${i}-error` : undefined}
                  onChange={(e) => update(i, { certificateIssued: e.target.value || null, certificateExpires: null })}
                />
                {errors[i] ? (
                  <span id={`extra-issued-${i}-error`} className={s.error}>{errors[i]}</span>
                ) : (
                  until && <span className={s.hint}>{d.extraValidUntil(formatDate(until, locale))}</span>
                )}
              </div>
              <div className={s.fullRow}>
                <button type="button" className={s.inlineBtn} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  {d.extraRemove}
                </button>
              </div>
            </fieldset>
          );
        })}
        {value.length < MAX_EXTRA_CERTS && (
          <div className={s.fullRow}>
            <button type="button" className="btn" onClick={add}>
              {d.extraAdd}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
