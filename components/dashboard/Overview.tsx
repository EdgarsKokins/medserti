import type { Progress } from "@/lib/rules";
import type { Locale } from "@/lib/i18n";
import { dictFor, fmtNum } from "./model";
import styles from "./overview.module.css";

/** Requirement checks as a ruled checklist */
export function Requirements({ p, locale, hours = false }: { p: Progress; locale: Locale; hours?: boolean }) {
  const dict = dictFor(locale, hours);
  return (
    <section aria-labelledby="req-title">
      <h2 id="req-title">{hours ? dict.dashboard.requirementsNurse : dict.dashboard.requirements}</h2>
      <ul className={styles.checklist}>
        {p.checks.map((c, i) => {
          // the minimums sit inside the total, not on top of it: a sub-list under "Kopā"
          const hint = hours ? undefined : dict.checkHints[c.id];
          return (
            <li key={c.id} className={`${c.met ? styles.met : ""} ${c.id === "total" ? "" : styles.sub}`}>
              {i === 1 && <span className={styles.within}>{dict.dashboard.requirementsWithin}</span>}
              <span className={styles.mark} aria-hidden>{c.met ? "✓" : ""}</span>
              <span className={styles.checkLabel}>
                {dict.checks[c.id]}
                <span className="sr-only">: {c.met ? dict.dashboard.met : dict.dashboard.notMet}</span>
                {hint && <span className={styles.checkHint}>{hint}</span>}
              </span>
              <span className={styles.checkVal}>
                {fmtNum(c.have)}
                <span className="muted"> / {fmtNum(c.need)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {p.checks.length > 1 && <p className="small muted">{dict.dashboard.requirementsNote}</p>}
      {/* Reg. 630 point 26.3 topics, from 01 Jan 2027: they count by the topic set on each certificate */}
      {hours && p.checks.some((c) => c.id === "nursing") && <p className="small muted">{dict.dashboard.nurseTopics}</p>}
    </section>
  );
}
