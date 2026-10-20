"use client";

import { useEffect, useRef, useState } from "react";
import s from "./landing-visuals.module.css";

export interface HowLabels {
  steps: { title: string; body: string }[];
  sampleBadge: string;
  sampleTitle: string;
  sampleName: string;
  sampleCourse: string;
  sampleOrg: string;
  sampleDates: string;
  sampleCredits: string;
  readDate: string;
  readPoints: string;
  readPlace: string;
  readPlaceValue: string;
  ledgerTitle: string;
  ledgerTotal: string;
  checks: string[];
  readDateValue: string;
  ledgerRows: { date: string; title: string; tip: number }[];
}

/** Becomes true once the element has been on screen (or right away when motion is reduced) */
function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/** Three visual steps: a sample certificate is read, points land in the report, requirements tick off */
export default function HowItWorks({ l }: { l: HowLabels }) {
  const [ref, seen] = useSeen<HTMLOListElement>();
  const total = l.ledgerRows.reduce((a, r) => a + r.tip, 0);

  return (
    <ol ref={ref} className={`${s.how} ${seen ? s.seen : ""}`}>
      <li>
        <div className={s.stage}>
          <div className={s.cert} aria-hidden>
            <span className={s.watermark}>{l.sampleBadge}</span>
            <div className={s.certOrg}>{l.sampleOrg}</div>
            <div className={s.certTitle}>{l.sampleTitle}</div>
            <div className={s.certName}>{l.sampleName}</div>
            <div className={s.certCourse}>{l.sampleCourse}</div>
            <div className={s.certRow}>
              <span className={`${s.hl} ${s.hl1}`}>{l.sampleDates}</span>
              <span className={`${s.hl} ${s.hl2}`}>{l.sampleCredits}</span>
            </div>
          </div>
          <dl className={s.read}>
            <div className={s.chip1}><dt>{l.readDate}</dt><dd>{l.readDateValue}</dd></div>
            <div className={s.chip2}><dt>{l.readPoints}</dt><dd>+16 TIP</dd></div>
            <div className={s.chip3}><dt>{l.readPlace}</dt><dd>{l.readPlaceValue}</dd></div>
          </dl>
        </div>
        <h3 className={s.stepTitle}><span className={s.stepNo}>1</span>{l.steps[0].title}</h3>
        <p className={s.stepBody}>{l.steps[0].body}</p>
      </li>

      <li>
        <div className={s.stage}>
          <div className={s.ledger} aria-hidden>
            <div className={s.ledgerHead}>{l.ledgerTitle}</div>
            {l.ledgerRows.map((r, i) => (
              <div key={i} className={s.ledgerRow} style={{ transitionDelay: `${0.25 + i * 0.18}s` }}>
                <span className={s.ledgerDate}>{r.date}</span>
                <span className={s.ledgerTitleCell}>{r.title}</span>
                <span className={s.ledgerTip}>+{r.tip}</span>
              </div>
            ))}
            <div className={s.ledgerTotal}>
              <span>{l.ledgerTotal}</span>
              <span>{total} TIP</span>
            </div>
          </div>
        </div>
        <h3 className={s.stepTitle}><span className={s.stepNo}>2</span>{l.steps[1].title}</h3>
        <p className={s.stepBody}>{l.steps[1].body}</p>
      </li>

      <li>
        <div className={s.stage}>
          <ul className={s.checks} aria-hidden>
            {l.checks.map((c, i) => (
              <li key={c} style={{ transitionDelay: `${0.3 + i * 0.35}s` }} className={i === 2 ? s.checkOpen : ""}>
                <span className={s.tick} style={{ transitionDelay: `${0.3 + i * 0.35}s` }}>{i === 2 ? "" : "✓"}</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
        <h3 className={s.stepTitle}><span className={s.stepNo}>3</span>{l.steps[2].title}</h3>
        <p className={s.stepBody}>{l.steps[2].body}</p>
      </li>
    </ol>
  );
}
