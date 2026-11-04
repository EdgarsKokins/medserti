"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { IconCal, IconDoc, IconPlay } from "@/components/PartIcons";
import s from "./proto.module.css";

export type Variant = "A" | "B" | "C";

const PARTS = [
  { title: "Sertifikāti", tone: s.blue, Icon: IconDoc, soon: false, things: ["Augšupielādēt PDF vai foto", "Nofotografēt ar telefonu", "Redzēt, kas vēl trūkst", "Sagatavot dokumentus LĀB"] },
  { title: "Kursi", tone: s.green, Icon: IconCal, soon: false, things: ["Atrast savai specialitātei", "Filtrēt pēc pilsētas", "Salīdzināt TIP un cenu", "Saņemt e-pastu par jauniem"] },
  { title: "Lekcijas", tone: s.gray, Icon: IconPlay, soon: true, things: ["Skatīties tepat", "Kad Jums ir laiks", "Sertifikāts pievienosies pats", "Paziņosim, kad sāksies"] },
];
const STEP_MS = 4600;

/** A chip: the outer span flies in, the inner one keeps floating, so the two movements do not fight */
function Chip({ text, i }: { text: string; i: number }) {
  return (
    <span className={s.chip} style={{ "--i": i } as CSSProperties}>
      <span className={s.chipIn}>{text}</span>
    </span>
  );
}

export default function Panel({ variant }: { variant: Variant }) {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);

  // moves on by itself until the pointer is on it; stays put for people who turned animations off
  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % PARTS.length), STEP_MS);
    return () => clearInterval(t);
  }, [held]);

  const hold = { onMouseEnter: () => setHeld(true), onMouseLeave: () => setHeld(false), onFocus: () => setHeld(true), onBlur: () => setHeld(false) };
  const soonTag = <span className={s.soon}>Drīzumā</span>;

  if (variant === "C") {
    const p = PARTS[active];
    return (
      <section className={`${s.stage} ${p.tone}`} aria-label="Kā darbojas Medserti" {...hold}>
        <div className={s.tabs}>
          {PARTS.map((x, i) => (
            <button key={x.title} type="button" className={`${s.tab} ${i === active ? s.tabOn : ""} ${x.tone}`} onClick={() => setActive(i)} aria-pressed={i === active}>
              <x.Icon />
              <span>{x.title}</span>
              {i === active && !held && <span className={s.tabBar} style={{ animationDuration: `${STEP_MS}ms` }} aria-hidden />}
            </button>
          ))}
        </div>
        {/* re-created on every change, so the chips fly out again */}
        <div key={active} className={s.scene}>
          <div className={s.sceneMid}>
            <span className={s.bigIcon}><p.Icon /></span>
            <b className={s.sceneTitle}>{p.title}</b>
            {p.soon && soonTag}
          </div>
          {p.things.map((t, i) => <Chip key={t} text={t} i={i} />)}
        </div>
      </section>
    );
  }

  return (
    <ul className={variant === "A" ? s.listA : s.listB} aria-label="Kā darbojas Medserti" {...hold}>
      {PARTS.map((p, i) => (
        <li key={p.title} className={`${s.item} ${p.tone} ${i === active ? s.open : ""}`}>
          <button type="button" className={s.head} onClick={() => setActive(i)} onMouseEnter={() => setActive(i)} aria-expanded={i === active}>
            <span className={s.icon}><p.Icon /></span>
            <b className={s.name}>{p.title}</b>
            {p.soon && soonTag}
          </button>
          <div className={s.body}>
            <div className={s.bodyIn}>
              {p.things.map((t, n) => <Chip key={t} text={t} i={n} />)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
