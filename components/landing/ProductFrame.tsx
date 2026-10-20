import s from "./landing-visuals.module.css";

interface Props {
  label: string;
  badge: string;
  name: string;
  role: string;
  collected: string;
  of: string;
  total: number;
  rulesTitle: string;
  rules: { label: string; done: boolean }[];
  deadline: string;
  deadlineValue: string;
  recentTitle: string;
  recent: { date: string; title: string; tip: number }[];
}

/**
 * Hero visual: the dashboard of the same sample doctor the "how it works" steps follow, drawn in HTML
 * (no screenshot to go stale). It is marked as a sample both visibly and for screen readers.
 */
export default function ProductFrame(p: Props) {
  const pct = Math.round((p.total / 250) * 100);
  return (
    <figure className={s.frame} aria-label={p.label}>
      <div className={s.frameBar} aria-hidden>
        <span className={s.frameDots}><i /><i /><i /></span>
        <span className={s.frameUrl}>medserti.lv/dashboard</span>
      </div>
      <div className={s.frameBody}>
        <div className={s.frameHead}>
          <div>
            <div className={s.frameName}>{p.name}</div>
            <div className={s.frameRole}>{p.role}</div>
          </div>
          <span className={s.frameBadge}>{p.badge}</span>
        </div>

        <div className={s.frameTotal}>
          <div className={s.frameNum}>
            <span className={s.frameBig}>{p.total}</span>
            <span className={s.frameOf}>{p.of}</span>
          </div>
          <div className={s.frameLabel}>{p.collected}</div>
          <div className={s.frameMeter} role="presentation">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className={s.frameCols}>
          <div>
            <div className={s.frameH}>{p.rulesTitle}</div>
            <ul className={s.frameRules}>
              {p.rules.map((r) => (
                <li key={r.label} className={r.done ? s.ruleDone : s.ruleOpen}>
                  <span className={s.ruleMark} aria-hidden>{r.done ? "✓" : ""}</span>
                  {r.label}
                </li>
              ))}
            </ul>
            <div className={s.frameDeadline}>
              <span>{p.deadline}</span>
              <span>{p.deadlineValue}</span>
            </div>
          </div>
          <div>
            <div className={s.frameH}>{p.recentTitle}</div>
            <ul className={s.frameRecent}>
              {p.recent.map((r) => (
                <li key={r.date + r.title}>
                  <span className={s.recentTitle}>{r.title}</span>
                  <span className={s.recentDate}>{r.date}</span>
                  <span className={s.recentTip}>+{r.tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </figure>
  );
}
