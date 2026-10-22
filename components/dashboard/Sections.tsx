import Link from "next/link";
import { RULES, type Progress } from "@/lib/rules";
import { t, type Locale } from "@/lib/i18n";
import styles from "./dashboard.module.css";
import { certTitle, dictFor, exclusions, fmtDate, fmtNum, needsReviewCount, recent, type CategoryRow } from "./model";

/** hours: nurses, who count academic hours and have no 16% cap on practical training (Reg. 630 Annex 6) */
export function CategoryBars({ p, rows, locale, hours = false }: { p: Progress; rows: CategoryRow[]; locale: Locale; hours?: boolean }) {
  const d = dictFor(locale, hours).dashboard;
  const n = (v: number) => fmtNum(v, locale);
  const max = Math.max(...rows.map((r) => r.points), 1);
  const cap = p.required * RULES.practicalCapShare;
  const capped = p.practicalRaw > p.practicalCounted;
  return (
    <section>
      <h2>{d.byCategory}</h2>
      {rows.length === 0 ? (
        <p className="muted">{d.noCountedPoints}</p>
      ) : (
        <div className={styles.cats}>
          {rows.map((r) => {
            const isPractical = r.category === "practical_training";
            return (
              <div key={r.category} className={styles.catRow}>
                <span>{r.label}</span>
                <span className={styles.catPts}>
                  {isPractical && capped ? d.cappedOf(n(p.practicalCounted), n(r.points)) : n(r.points)}
                </span>
                <div className={`bar ${isPractical ? styles.barCapped : ""} ${isPractical && capped ? styles.barWarn : ""}`}>
                  <span style={{ width: `${(r.points / max) * 100}%` }} />
                  {isPractical && !hours && (
                    <i
                      className={styles.capMark}
                      style={{ left: `${Math.min(100, (cap / max) * 100)}%` }}
                      title={d.capTitle(n(cap))}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {capped && (
        <div className="alert" style={{ marginTop: 12 }}>
          {d.capAlert(n(cap), n(p.practicalRaw), n(p.practicalRaw - p.practicalCounted))}
        </div>
      )}
    </section>
  );
}

export function RecentActivity({ p, locale }: { p: Progress; locale: Locale }) {
  const d = t(locale).dashboard;
  const rows = recent(p, 8);
  const ex = exclusions(p);
  const review = needsReviewCount(p);
  const reasons = [
    ex.outsideWindow && d.outsideWindow(ex.outsideWindow),
    ex.missingData && d.missingData(ex.missingData),
    ex.duplicates && d.duplicates(ex.duplicates),
    ex.failed && d.failed(ex.failed),
    ex.processing && d.processing(ex.processing),
  ].filter(Boolean);
  return (
    <section>
      <div className="page-head" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{d.recent}</h2>
        <Link href="/certificates" className={`small ${styles.headLink}`}>
          {d.allCerts}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{d.noCountedCerts}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{d.colDate}</th>
                <th>{d.colTitle}</th>
                <th className="num">TIP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={styles.dateCell}>{fmtDate(c.date, locale)}</td>
                  <td className={styles.titleCell} title={certTitle(c)}>
                    {certTitle(c)}
                    {c.status === "needs_review" && (
                      <>
                        {" "}
                        <span className="badge badge-warn">{d.toConfirm}</span>
                      </>
                    )}
                  </td>
                  <td className="num">{fmtNum(c.points ?? 0, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(review > 0 || ex.total > 0) && (
        <div className="small muted" style={{ marginTop: 10 }}>
          {review > 0 && (
            <p>
              {d.includesUnconfirmed(review)} <Link href="/certificates">{d.reviewThem}</Link>.
            </p>
          )}
          {ex.total > 0 && (
            <p>
              {d.notCounted(ex.total, reasons.join(", "))}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
