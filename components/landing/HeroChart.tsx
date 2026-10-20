"use client";

import { useEffect, useRef, useState } from "react";
import s from "./landing-visuals.module.css";

/** Example journey over a 5-year certificate: [share of the period, TIP gained]. Sums to 250. */
const STEPS: [number, number][] = [
  [0.04, 8], [0.11, 12], [0.19, 6], [0.27, 16], [0.34, 8], [0.42, 24], [0.5, 12],
  [0.57, 40], [0.65, 16], [0.72, 32], [0.8, 24], [0.87, 20], [0.94, 32],
];
const TOTAL = 250;
const W = 600, H = 190, X0 = 24, X1 = 576, Y0 = 160, Y1 = 22;
const x = (f: number) => X0 + f * (X1 - X0);
const y = (v: number) => Y0 - (v / TOTAL) * (Y0 - Y1);

/** Animated hero visual: certificates land on a timeline and the counter climbs to 250 TIP */
export default function HeroChart({ ofLabel, chartLabel, startYear }: { ofLabel: string; chartLabel: string; startYear: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // server render shows the finished journey, so slow devices never see an empty chart; it replays on screen
  const [shown, setShown] = useState(STEPS.length);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(STEPS.length);
      return;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || timer) return;
        let i = 0;
        setShown(0);
        timer = setInterval(() => {
          i += 1;
          setShown(i);
          if (i >= STEPS.length && timer) clearInterval(timer);
        }, 230);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, []);

  let cum = 0;
  let d = `M${X0} ${Y0}`;
  const dots: { cx: number; cy: number; r: number }[] = [];
  STEPS.slice(0, shown).forEach(([f, v]) => {
    const prev = y(cum);
    cum += v;
    d += ` L${x(f)} ${prev} L${x(f)} ${y(cum)}`;
    dots.push({ cx: x(f), cy: y(cum), r: 3 + v / 9 });
  });
  if (shown >= STEPS.length) d += ` L${X1} ${y(cum)}`;
  const lastX = shown >= STEPS.length ? X1 : shown ? x(STEPS[shown - 1][0]) : X0;
  const area = `${d} L${lastX} ${Y0} L${X0} ${Y0} Z`;

  return (
    <div ref={ref} className={s.heroChart}>
      <div className={s.counter} aria-live="off">
        <span className={s.counterNum}>{cum}</span>
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
        <path d={area} className={s.area} />
        <path d={d} className={s.line} />
        {dots.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={p.r} className={s.dot} />
        ))}
      </svg>
    </div>
  );
}
