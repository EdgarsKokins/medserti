"use client";

import s from "./landing-visuals.module.css";
import { useWaitUntilSeen } from "./useWaitUntilSeen";

/** Example journey over a 5-year certificate: [share of the period, TIP gained]. Sums to 250. */
const STEPS: [number, number][] = [
  [0.04, 8], [0.11, 12], [0.19, 6], [0.27, 16], [0.34, 8], [0.42, 24], [0.5, 12],
  [0.57, 40], [0.65, 16], [0.72, 32], [0.8, 24], [0.87, 20], [0.94, 32],
];
const TOTAL = 250;
/** Seconds for the timeline to sweep the five years; dots land as the sweep reaches them */
const SWEEP = 2.6;
const W = 600, H = 190, X0 = 24, X1 = 576, Y0 = 160, Y1 = 22;
const x = (f: number) => X0 + f * (X1 - X0);
const y = (v: number) => Y0 - (v / TOTAL) * (Y0 - Y1);

/**
 * The counter steps in lockstep with the dots: it holds, then ticks up as each certificate lands.
 * Built from STEPS so the two can never drift apart.
 */
const COUNT_KEYFRAMES = (() => {
  const xf = (f: number) => (x(f) - X0) / (X1 - X0);
  let cum = 0;
  const frames = ["0% { --tip: 0; }"];
  for (const [f, v] of STEPS) {
    const at = xf(f) * 100;
    frames.push(`${at.toFixed(2)}% { --tip: ${cum}; }`);
    cum += v;
    frames.push(`${Math.min(at + 2, 100).toFixed(2)}% { --tip: ${cum}; }`);
  }
  frames.push(`100% { --tip: ${TOTAL}; }`);
  return `@keyframes medserti-tip-count { ${frames.join(" ")} }`;
})();

/**
 * Hero visual: certificates land on a five-year timeline and the counter climbs to 250 TIP.
 * The finished chart is in the markup; the sweep is CSS that starts at first paint, so it never
 * flashes back to zero after the page's script loads, and reduced motion simply shows the result.
 */
export default function HeroChart({ exampleLabel, ofLabel, chartLabel, startYear }: { exampleLabel: string; ofLabel: string; chartLabel: string; startYear: number }) {
  const [ref, waiting] = useWaitUntilSeen<HTMLDivElement>(0);

  let cum = 0;
  let d = `M${X0} ${Y0}`;
  const dots = STEPS.map(([f, v]) => {
    const prev = y(cum);
    cum += v;
    d += ` L${x(f)} ${prev} L${x(f)} ${y(cum)}`;
    return { cx: x(f), cy: y(cum), r: 3 + v / 9, delay: f * SWEEP };
  });
  d += ` L${X1} ${y(cum)}`;
  const area = `${d} L${X1} ${Y0} L${X0} ${Y0} Z`;

  return (
    <div ref={ref} className={`${s.heroChart} ${waiting ? s.wait : ""}`} style={{ "--sweep": `${SWEEP}s`, "--count-anim": "medserti-tip-count" } as React.CSSProperties}>
      <style>{COUNT_KEYFRAMES}</style>
      <div className={s.counter}>
        <span className={s.counterNote}>{exampleLabel}</span>
        <span className={s.counterNum}>
          <span className={s.counterAnim} aria-hidden />
          <span className="sr-only">{TOTAL}</span>
        </span>
        <span className={s.counterOf}>{ofLabel}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.chartSvg} role="img" aria-label={chartLabel}>
        <line x1={X0} y1={Y1} x2={X1} y2={Y1} className={s.goal} />
        <text x={X1} y={Y1 - 8} textAnchor="end" className={s.goalLabel}>250 TIP</text>
        <line x1={X0} y1={Y0} x2={X1} y2={Y0} className={s.base} />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <text key={k} x={X0 + (k / 5) * (X1 - X0)} y={Y0 + 20} textAnchor={k === 0 ? "start" : k === 5 ? "end" : "middle"} className={s.year}>
            {startYear + k}
          </text>
        ))}
        <g className={s.sweep}>
          <path d={area} className={s.area} />
          <path d={d} className={s.line} />
        </g>
        {dots.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={p.r} className={s.dot} style={{ animationDelay: `${p.delay}s` }} />
        ))}
      </svg>
    </div>
  );
}
