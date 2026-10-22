"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ChartPoint } from "./model";
import styles from "./ProgressChart.module.css";

/* Cumulative TIP over the certificate window: step area, goal line, on-track pace,
   today marker, forecast at the average pace so far, and an HTML tooltip per date.
   Renders at the measured container width so text stays at its real pixel size. */

type ChartLocale = "lv" | "en" | "ru";

/** Every visible string. {placeholders} are filled in by the chart. */
export interface ProgressChartLabels {
  unit: string;
  today: string;
  yourPoints: string;
  target: string;
  pace: string;
  forecast: string;
  /** {value} {unit} {date} {gap} {target} */
  forecastBelow: string;
  /** {target} {unit} {date} */
  forecastAbove: string;
  /** {target} {unit} */
  targetReached: string;
  /** {date} */
  windowEnded: string;
  noWindow: string;
  empty: string;
  tooltipTotal: string;
  /** {n} */
  tooltipMore: string;
  /** {value} {target} {unit} */
  chartLabel: string;
}

const DEFAULT_LABELS: ProgressChartLabels = {
  unit: "TIP",
  today: "Today",
  yourPoints: "Your points",
  target: "Target",
  pace: "On-track pace",
  forecast: "Forecast at your pace",
  forecastBelow: "At your current pace: ≈ {value} {unit} by {date}, {gap} {unit} short of the target.",
  forecastAbove: "At your current pace you reach {target} {unit} around {date}.",
  targetReached: "Target of {target} {unit} reached.",
  windowEnded: "Your certificate period ended on {date}.",
  noWindow: "Add your certificate dates in the profile to see the on-track pace and forecast.",
  empty: "No certificates in this period yet. Upload one to see your progress here.",
  tooltipTotal: "Total",
  tooltipMore: "+{n} more",
  chartLabel: "Cumulative points over time: {value} of {target} {unit}",
};

interface Props {
  series: ChartPoint[];
  required: number;
  windowStart: string | null;
  windowEnd: string | null;
  today: string;
  labels?: Partial<ProgressChartLabels>;
  locale?: ChartLocale;
}

const DAY = 86_400_000;
/** Below this much history the average pace is too noisy to project */
const MIN_FORECAST_DAYS = 90;

const MONTHS: Record<ChartLocale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  lv: ["janv.", "febr.", "marts", "apr.", "maijs", "jūn.", "jūl.", "aug.", "sept.", "okt.", "nov.", "dec."],
  ru: ["янв.", "февр.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."],
};

/** Latvian month names after "līdz" (dative) and "ap" (accusative): "līdz 2028. gada martam", "ap 2028. gada martu" */
const LV_DATIVE = ["janvārim", "februārim", "martam", "aprīlim", "maijam", "jūnijam", "jūlijam", "augustam", "septembrim", "oktobrim", "novembrim", "decembrim"];
const LV_ACCUSATIVE = ["janvāri", "februāri", "martu", "aprīli", "maiju", "jūniju", "jūliju", "augustu", "septembri", "oktobri", "novembri", "decembri"];
/** Russian month names after "к" (dative): "к марту 2028" */
const RU_DATIVE = ["январю", "февралю", "марту", "апрелю", "маю", "июню", "июлю", "августу", "сентябрю", "октябрю", "ноябрю", "декабрю"];

const dayMs = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

function makeFmt(locale: ChartLocale) {
  const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, useGrouping: false });
  const mon = MONTHS[locale];
  return {
    num: (n: number) => nf.format(Math.round(n * 10) / 10),
    /** en "14 Mar 2028", lv "14.03.2028.", ru "14.03.2028" */
    date: (ms: number) => {
      const d = new Date(ms);
      const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
      const dm = `${String(day).padStart(2, "0")}.${String(m + 1).padStart(2, "0")}`;
      if (locale === "lv") return `${dm}.${y}.`;
      if (locale === "ru") return `${dm}.${y}`;
      return `${String(day).padStart(2, "0")} ${mon[m]} ${y}`;
    },
    /** en "Mar 2028", lv "2028. g. marts", ru "март 2028" */
    month: (ms: number) => {
      const d = new Date(ms);
      return locale === "lv"
        ? `${d.getUTCFullYear()}. g. ${mon[d.getUTCMonth()]}`
        : `${mon[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    },
    monthShort: (ms: number) => mon[new Date(ms).getUTCMonth()],
    /** month-year inside a sentence; Latvian needs the case the preposition governs */
    monthIn: (ms: number, kase: "dative" | "accusative") => {
      const d = new Date(ms);
      if (locale === "ru") return `${RU_DATIVE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      if (locale !== "lv") return `${mon[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      return `${d.getUTCFullYear()}. gada ${(kase === "dative" ? LV_DATIVE : LV_ACCUSATIVE)[d.getUTCMonth()]}`;
    },
  };
}

/** 1, 2, 2.5, 5 x 10^n step giving 3-5 gridlines with the least headroom above max */
function niceScale(max: number): { step: number; top: number } {
  let best = { step: max, top: Infinity };
  for (let e = Math.floor(Math.log10(max)) - 2; e <= Math.floor(Math.log10(max)) + 1; e++) {
    for (const n of [1, 2, 2.5, 5]) {
      const step = n * 10 ** e;
      const top = Math.ceil(max / step - 1e-9) * step;
      const lines = top / step;
      if (lines >= 3 && lines <= 5 && top < best.top) best = { step, top };
    }
  }
  return best;
}

/** Polyline with rounded corners (radius r, shortened on tight segments) */
function roundedPath(pts: [number, number][], r: number): string {
  const p = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  if (!p.length) return "";
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [a, c, b] = [p[i - 1], p[i], p[i + 1]];
    const la = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const lb = Math.hypot(b[0] - c[0], b[1] - c[1]);
    const rr = Math.min(r, la / 2, lb / 2);
    const s = [c[0] - ((c[0] - a[0]) / la) * rr, c[1] - ((c[1] - a[1]) / la) * rr];
    const e = [c[0] + ((b[0] - c[0]) / lb) * rr, c[1] + ((b[1] - c[1]) / lb) * rr];
    d += ` L${f(s[0])},${f(s[1])} Q${f(c[0])},${f(c[1])} ${f(e[0])},${f(e[1])}`;
  }
  const last = p[p.length - 1];
  return d + ` L${f(last[0])},${f(last[1])}`;
}

/** Month-aligned ticks; the step grows until labels have room */
function xTicks(x0: number, x1: number, plotW: number, minStep: number) {
  const minGap = 50;
  const steps = [1, 3, 6, 12, 24].filter((s) => s >= minStep);
  const step = steps.find((s) => ((s * 30.44 * DAY) / (x1 - x0)) * plotW >= minGap) ?? 24;
  const d = new Date(x0);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1;
  const out: number[] = [];
  for (let i = 0; i < 400; i++) {
    if (m > 11) {
      y += Math.floor(m / 12);
      m %= 12;
    }
    const ms = Date.UTC(y, m, 1);
    if (ms > x1) break;
    // Align to the step: quarters on Jan/Apr/Jul/Oct, years on Jan, 2-year on even years
    const aligned = step >= 12 ? m === 0 && (step === 12 || y % 2 === 0) : m % step === 0;
    if (aligned && ms > x0) out.push(ms);
    m++;
  }
  return { ticks: out, step };
}

interface Active {
  idx: number;
  by: "pointer" | "focus";
}

export default function ProgressChart({
  series,
  required,
  windowStart,
  windowEnd,
  today,
  labels: labelsIn,
  locale = "en",
}: Props) {
  const L = { ...DEFAULT_LABELS, ...labelsIn };
  const fmt = useMemo(() => makeFmt(locale), [locale]);
  const gradId = `pc-grad-${useId().replace(/:/g, "")}`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const [W, setW] = useState(680);
  const [active, setActive] = useState<Active | null>(null);
  const [focusIdx, setFocusIdx] = useState(series.length - 1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = W < 480;
  const H = narrow ? 210 : 250;
  const M = { l: 34, r: 12, t: 22, b: 26 };
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;

  /* ---- data ---- */
  const hasWindow = !!(windowStart && windowEnd && dayMs(windowEnd) > dayMs(windowStart));
  const todayMs = dayMs(today);
  const total = series.length ? series[series.length - 1].cumulative : 0;
  const firstMs = series.length ? dayMs(series[0].date) : todayMs - 365 * DAY;
  const lastMs = series.length ? dayMs(series[series.length - 1].date) : todayMs;

  const x0 = hasWindow ? dayMs(windowStart!) : Math.min(firstMs, todayMs) - 30 * DAY;
  const x1 = hasWindow ? dayMs(windowEnd!) : Math.max(lastMs, todayMs) + 30 * DAY;
  const expired = hasWindow && todayMs > x1;
  const todayIn = todayMs >= x0 && todayMs <= x1;
  const lineEndMs = expired ? x1 : clamp(Math.max(todayMs, lastMs), x0, x1);
  const met = required > 0 && total >= required;

  // Forecast: average pace since window start, projected to window end
  let forecast: { value: number; reachMs: number | null } | null = null;
  const elapsedDays = (todayMs - x0) / DAY;
  if (hasWindow && todayIn && !met && elapsedDays >= MIN_FORECAST_DAYS && series.length) {
    const perDay = total / elapsedDays;
    const value = total + perDay * ((x1 - todayMs) / DAY);
    const reachMs = perDay > 0 && value >= required ? todayMs + ((required - total) / perDay) * DAY : null;
    forecast = { value, reachMs };
  }
  const forecastBelow = !!forecast && forecast.value < required;

  /* ---- scales ---- */
  const needed = Math.max(required, total * 1.05, forecast ? Math.min(forecast.value, required * 1.35) : 0, 10);
  const { step: yStep, top: yMax } = niceScale(needed);
  const sx = (ms: number) => M.l + ((clamp(ms, x0, x1) - x0) / (x1 - x0)) * iw;
  const sy = (v: number) => M.t + ih - (clamp(v, 0, yMax) / yMax) * ih;
  const yTicks: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += yStep) yTicks.push(Math.round(v * 10) / 10);

  const spanYears = (x1 - x0) / (365.25 * DAY);
  const { ticks, step: tickStep } = xTicks(x0, x1, iw, spanYears > 2.5 ? 12 : spanYears > 1 ? 3 : 1);
  const tickLabel = (ms: number, i: number) => {
    const d = new Date(ms);
    if (tickStep >= 12 || d.getUTCMonth() === 0) return String(d.getUTCFullYear());
    if (i !== 0) return fmt.monthShort(ms);
    return locale === "lv" ? `${d.getUTCFullYear()}. g. ${fmt.monthShort(ms)}` : `${fmt.monthShort(ms)} ${d.getUTCFullYear()}`;
  };

  /* ---- geometry ---- */
  const pts: [number, number][] = [[sx(x0), sy(0)]];
  let prev = 0;
  for (const p of series) {
    const x = sx(dayMs(p.date));
    pts.push([x, sy(prev)], [x, sy(p.cumulative)]);
    prev = p.cumulative;
  }
  pts.push([sx(lineEndMs), sy(total)]);
  const linePath = roundedPath(pts, 5);
  const areaPath = `${linePath} L${sx(lineEndMs).toFixed(1)},${sy(0).toFixed(1)} L${sx(x0).toFixed(1)},${sy(0).toFixed(1)} Z`;

  const maxPts = Math.max(1, ...series.map((p) => p.items.reduce((s, i) => s + i.points, 0)));
  // Shrink dots when dates are dense so they don't merge into a bead chain
  const rScale = clamp(iw / Math.max(1, series.length) / 22, 0.6, 1);
  const dots = series.map((p) => {
    const added = p.items.reduce((s, i) => s + i.points, 0);
    return {
      p,
      added,
      x: sx(dayMs(p.date)),
      y: sy(p.cumulative),
      r: (4 + 3.5 * Math.sqrt(Math.max(0, added) / maxPts)) * rScale,
    };
  });

  // Forecast line, clipped where it leaves the plot at the top
  let fc: { x2: number; y2: number; clipped: boolean } | null = null;
  if (forecast) {
    const slope = (forecast.value - total) / (x1 - todayMs);
    let endMs = x1;
    let endV = forecast.value;
    if (forecast.value > yMax && slope > 0) {
      endMs = todayMs + (yMax - total) / slope;
      endV = yMax;
    }
    fc = { x2: sx(endMs), y2: sy(endV), clipped: endMs < x1 };
  }

  const tx = sx(todayMs);
  // Rough text widths (11.5px / 13px bold) for collision checks
  const valueW = (fmt.num(total).length + L.unit.length + 1) * 7.6;
  const valueAnchorEnd = sx(lineEndMs) > W - M.r - 60;
  // Keep the today/value stack clear of the target label near the top
  const valueBelow = sy(total) - 36 < M.t + 4 || (sy(required) > sy(total) - 38 && sy(required) < sy(total) + 2);
  // Move the target label to the left when the today/value stack sits near it on the right
  const stackRight = valueAnchorEnd ? sx(lineEndMs) : sx(lineEndMs) + 8 + valueW;
  const goalLeft = series.length > 0 && stackRight > W - M.r - 70 && Math.abs(sy(total) - sy(required)) < 50;
  const fcText = forecast ? `≈ ${fmt.num(Math.round(forecast.value))}` : "";
  const fcLabelLeft = fc ? fc.x2 - 6 - fcText.length * 6.6 : 0;
  const showFcEndLabel =
    !!fc &&
    !fc.clipped &&
    !valueAnchorEnd &&
    fcLabelLeft > tx + 8 + valueW + 6 &&
    Math.abs(fc.y2 - 8 - (sy(required) - 6)) > 14;

  /* ---- caption ---- */
  const unit = L.unit;
  let caption: string | null = null;
  if (!hasWindow) caption = L.noWindow;
  else if (met) caption = fill(L.targetReached, { target: fmt.num(required), unit });
  else if (expired) caption = fill(L.windowEnded, { date: fmt.date(x1) });
  else if (forecast && forecastBelow)
    caption = fill(L.forecastBelow, {
      value: fmt.num(Math.round(forecast.value)),
      unit,
      date: fmt.monthIn(x1, "dative"),
      gap: fmt.num(Math.round(required - forecast.value)),
      target: fmt.num(required),
    });
  else if (forecast?.reachMs)
    caption = fill(L.forecastAbove, { target: fmt.num(required), unit, date: fmt.monthIn(forecast.reachMs, "accusative") });

  /* ---- interaction ---- */
  const toSvgX = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    return ((e.clientX - box.left) / box.width) * W;
  };
  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    if (!dots.length) return;
    const x = toSvgX(e);
    let best = -1;
    let bestD = Infinity;
    // Last dot wins ties so the newest certificate on a crowded date shows
    dots.forEach((d, i) => {
      const dist = Math.abs(d.x - x);
      if (dist <= bestD) {
        best = i;
        bestD = dist;
      }
    });
    setActive(bestD <= 28 ? { idx: best, by: "pointer" } : null);
  };
  const onKey = (e: KeyboardEvent<SVGCircleElement>, i: number) => {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? dots.length - 1
              : e.key === "Escape"
                ? -2
                : null;
    if (next === null) return;
    e.preventDefault();
    if (next === -2) {
      setActive(null);
      return;
    }
    const n = clamp(next, 0, dots.length - 1);
    setFocusIdx(n);
    dotRefs.current[n]?.focus();
  };

  const rovingIdx = clamp(focusIdx, 0, Math.max(0, dots.length - 1));
  const act = active && dots[active.idx] ? dots[active.idx] : null;

  const tipItems = act ? act.p.items.slice(0, 4) : [];
  const tipMore = act ? act.p.items.length - tipItems.length : 0;
  const tipLeft = act ? (act.x / W) * 100 : 0;
  const tipBelow = act ? act.y < 90 : false;
  const tipAlign = act ? (act.x < 110 ? "start" : act.x > W - 110 ? "end" : "mid") : "mid";

  return (
    <figure className={styles.fig}>
      <div ref={wrapRef} className={styles.wrap}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={styles.svg}
          role="group"
          aria-label={fill(L.chartLabel, { value: fmt.num(total), target: fmt.num(required), unit })}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className={styles.gradTop} />
              <stop offset="100%" className={styles.gradBottom} />
            </linearGradient>
          </defs>

          {/* grid + y labels */}
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} className={v === 0 ? styles.baseline : styles.grid} />
              <text x={M.l - 8} y={sy(v)} className={styles.yLabel}>
                {fmt.num(v)}
              </text>
            </g>
          ))}

          {/* x labels */}
          {ticks.map((ms, i) => {
            // Centred under the tick, nudged in only as far as needed to stay inside the svg
            const half = tickLabel(ms, i).length * 3.3;
            const x = clamp(sx(ms), half + 2, W - half - 2);
            return (
              <text key={ms} x={x} y={H - 7} textAnchor="middle" className={styles.xLabel}>
                {tickLabel(ms, i)}
              </text>
            );
          })}

          {/* on-track pace */}
          {hasWindow && <line x1={sx(x0)} y1={sy(0)} x2={sx(x1)} y2={sy(required)} className={styles.pace} />}

          {/* target */}
          <line x1={M.l} x2={W - M.r} y1={sy(required)} y2={sy(required)} className={styles.goal} />
          <text
            x={goalLeft ? M.l + 4 : W - M.r}
            y={sy(required) - 6}
            textAnchor={goalLeft ? "start" : "end"}
            className={styles.goalLabel}
          >
            {`${fmt.num(required)} ${unit}`}
          </text>

          {/* today */}
          {todayIn && (
            <g>
              <line x1={tx} x2={tx} y1={M.t} y2={sy(0)} className={styles.today} />
              {series.length === 0 && (
                <text x={tx} y={M.t - 6} textAnchor={tx > W - M.r - 24 ? "end" : tx < M.l + 24 ? "start" : "middle"} className={styles.todayLabel}>
                  {L.today}
                </text>
              )}
            </g>
          )}

          {series.length > 0 && (
            <>
              <path d={areaPath} fill={`url(#${gradId})`} />
              <path d={linePath} className={styles.line} />
            </>
          )}

          {/* forecast */}
          {fc && (
            <>
              <line
                x1={tx}
                y1={sy(total)}
                x2={fc.x2}
                y2={fc.y2}
                className={`${styles.forecast} ${forecastBelow ? styles.warn : styles.ok}`}
              />
              <circle cx={fc.x2} cy={fc.y2} r={3} className={`${styles.forecastEnd} ${forecastBelow ? styles.warn : styles.ok}`} />
              {showFcEndLabel && (
                <text x={fc.x2 - 6} y={fc.y2 - 8} textAnchor="end" className={styles.fcLabel}>
                  {fcText}
                </text>
              )}
            </>
          )}

          {/* crosshair */}
          {act && <line x1={act.x} x2={act.x} y1={M.t} y2={sy(0)} className={styles.crosshair} />}

          {/* dots: one tab stop, arrow keys move between them */}
          {dots.map((d, i) => (
            <circle
              key={d.p.date}
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              cx={d.x}
              cy={d.y}
              r={d.r}
              tabIndex={i === rovingIdx ? 0 : -1}
              aria-label={`${fmt.date(dayMs(d.p.date))}: +${fmt.num(d.added)} ${unit}, ${L.tooltipTotal.toLowerCase()} ${fmt.num(d.p.cumulative)} ${unit}. ${d.p.items.map((it) => it.title).join("; ")}`}
              className={`${styles.dot} ${act === d ? styles.dotActive : ""}`}
              onFocus={() => {
                setFocusIdx(i);
                setActive({ idx: i, by: "focus" });
              }}
              onBlur={() => setActive((a) => (a?.by === "focus" ? null : a))}
              onKeyDown={(e) => onKey(e, i)}
            />
          ))}

          {/* current value next to the end of the line */}
          {series.length > 0 && (todayIn || expired) && (
            <text
              x={sx(lineEndMs) + (valueAnchorEnd ? -8 : 8)}
              y={valueBelow ? sy(total) + 18 : sy(total) - 24}
              textAnchor={valueAnchorEnd ? "end" : "start"}
            >
              {todayIn && (
                <tspan x={sx(lineEndMs) + (valueAnchorEnd ? -8 : 8)} className={styles.todayLabel}>
                  {L.today}
                </tspan>
              )}
              <tspan x={sx(lineEndMs) + (valueAnchorEnd ? -8 : 8)} dy={15} className={styles.valueLabel}>
                {`${fmt.num(total)} ${unit}`}
              </tspan>
            </text>
          )}

          {/* pointer layer: nearest date within 28px */}
          <rect
            x={M.l}
            y={M.t}
            width={iw}
            height={ih}
            className={styles.hit}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setActive((a) => (a?.by === "pointer" ? null : a))}
          />
        </svg>

        {series.length === 0 && (
          <p className={styles.empty} style={{ left: M.l, right: M.r, top: M.t, height: ih }}>
            <span>{L.empty}</span>
          </p>
        )}

        {act && (
          <div
            className={`${styles.tip} ${styles[`tip_${tipAlign}`]} ${tipBelow ? styles.tipBelow : ""}`}
            style={{ left: `${tipLeft}%`, top: `${(act.y / H) * 100}%` }}
            role="status"
          >
            <div className={styles.tipHead}>
              <strong>{`+${fmt.num(act.added)} ${unit}`}</strong>
              <span>{fmt.date(dayMs(act.p.date))}</span>
            </div>
            {tipItems.map((it, i) => (
              <div key={i} className={styles.tipItem}>
                <span className={styles.tipTitle}>{it.title}</span>
                <span className={styles.tipPts}>{`+${fmt.num(it.points)}`}</span>
              </div>
            ))}
            {tipMore > 0 && <div className={styles.tipMuted}>{fill(L.tooltipMore, { n: String(tipMore) })}</div>}
            <div className={styles.tipTotal}>
              <span>{L.tooltipTotal}</span>
              <span>{`${fmt.num(act.p.cumulative)} ${unit}`}</span>
            </div>
          </div>
        )}
      </div>

      <figcaption className={styles.legend}>
        {series.length > 0 && (
          <span>
            <i className={styles.keyLine} /> {L.yourPoints}
          </span>
        )}
        <span>
          <i className={styles.keyGoal} /> {L.target}
        </span>
        {hasWindow && (
          <span>
            <i className={styles.keyPace} /> {L.pace}
          </span>
        )}
        {fc && (
          <span>
            <i className={`${styles.keyForecast} ${forecastBelow ? styles.warn : styles.ok}`} /> {L.forecast}
          </span>
        )}
      </figcaption>
      {caption && (
        <p className={`${styles.caption} ${forecastBelow && !expired ? styles.captionWarn : ""}`}>{caption}</p>
      )}
    </figure>
  );
}
