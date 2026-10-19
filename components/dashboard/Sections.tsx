import Link from "next/link";
import { RULES, type Progress } from "@/lib/rules";
import { t, type Locale } from "@/lib/i18n";
import styles from "./dashboard.module.css";
import {
  certTitle,
  exclusions,
  fmtDate,
  fmtNum,
  needsReviewCount,
  recent,
  type CategoryRow,
  type Headline,
} from "./model";

const toneCard = { ok: styles.okCard, warn: styles.warnCard, bad: styles.badCard, neutral: "" };
const toneBar = { ok: styles.barOk, warn: styles.barWarn, bad: styles.barBad, neutral: "" };
const toneAlert = { ok: "alert alert-ok", warn: "alert", bad: "alert alert-bad", neutral: "" };

export function HeadlineCard({
  p,
  h,
  onTrack,
  locale,
}: {
  p: Progress;
  h: Headline;
  onTrack: number | null;
  locale: Locale;
}) {
  const d = t(locale).dashboard;
  const n = (v: number) => fmtNum(v, locale);
  const daysLeft = p.daysLeft;
  return (
    <section className={`card ${toneCard[h.tone]}`} aria-labelledby="dash-headline">
      <h2 id="dash-headline" className="muted small" style={{ fontWeight: 400 }}>
        {d.headlineTitle}
      </h2>
      <div className={styles.hero}>
        <span className={styles.big}>{n(p.total)}</span>
        <span className={styles.of}>{d.ofRequired(p.required)}</span>
      </div>
      <div
        className={`bar ${styles.barLg} ${toneBar[h.tone]}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={p.required}
        aria-valuenow={p.total}
      >
        <span style={{ width: `${h.pct}%` }} />
      </div>
      <div className={styles.facts}>
        <div>
          <strong>{h.pct}%</strong> {d.done}, <strong>{p.remaining > 0 ? d.toGo(n(p.remaining)) : d.nothingToGo}</strong>
        </div>
        {p.windowEnd && daysLeft != null && (
          <div>
            {daysLeft >= 0 ? (
              <>
                {d.validUntil} <strong>{fmtDate(p.windowEnd, locale)}</strong> {d.daysLeft(daysLeft)}
              </>
            ) : (
              <>
                {d.expiredOn} <strong>{fmtDate(p.windowEnd, locale)}</strong>
              </>
            )}
          </div>
        )}
        {p.perMonthNeeded != null && daysLeft != null && daysLeft >= 0 && (
          <div>
            {d.perMonthPre} <strong>{d.perMonth(n(p.perMonthNeeded))}</strong> {d.perMonthPost}
          </div>
        )}
        {onTrack != null && p.remaining > 0 && daysLeft != null && daysLeft >= 0 && (
          <div className="muted">
            {d.onTrack(n(onTrack))}
            {p.total >= onTrack ? d.ahead : d.behind(n(onTrack - p.total))}
          </div>
        )}
      </div>
      {h.message && (
        <div className={toneAlert[h.tone]} style={{ marginTop: 12 }}>
          {h.message}
        </div>
      )}
    </section>
  );
}

export function ChecksGrid({ p, locale }: { p: Progress; locale: Locale }) {
  const dict = t(locale);
  const d = dict.dashboard;
  return (
    <section aria-label={d.checksAria} className="grid">
      {p.checks.map((c) => {
        const pct = c.need > 0 ? Math.min(100, (c.have / c.need) * 100) : 100;
        return (
          <div key={c.id} className={`card ${styles.tile}`}>
            <div className={styles.tileHead}>
              <span className="small muted">{dict.checks[c.id]}</span>
              <span className={`badge ${c.met ? "badge-ok" : "badge-bad"}`}>{c.met ? d.met : d.notMet}</span>
            </div>
            <div className={styles.tileValue}>
              {fmtNum(c.have, locale)} <small>{d.of(fmtNum(c.need, locale))}</small>
            </div>
            <div className={`bar ${styles.barSm} ${c.met ? styles.barOk : ""}`}>
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function CategoryBars({ p, rows, locale }: { p: Progress; rows: CategoryRow[]; locale: Locale }) {
  const d = t(locale).dashboard;
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
                  {isPractical && (
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
    ex.failed && d.failed(ex.failed),
    ex.processing && d.processing(ex.processing),
  ].filter(Boolean);
  return (
    <section>
      <div className="page-head" style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>{d.recent}</h2>
        <Link href="/certificates" className="small">
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
