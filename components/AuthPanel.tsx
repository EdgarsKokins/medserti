"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useDict } from "@/components/i18n/DictProvider";
import { IconCal, IconDoc, IconPlay } from "./PartIcons";
import s from "./auth.module.css";

const ICONS = [IconDoc, IconCal, IconPlay];
const TONES = [s.blue, s.green, s.gray];
const LECTURES = 2;
const STEP_MS = 4600;

/**
 * Sign-in and sign-up: Medserti's three parts, as on the dashboard. One opens at a time and floats what can be done
 * in it; it moves on by itself until the pointer or keyboard is on it, and stays put for people who turned animations off.
 */
export default function AuthPanel() {
  const d = useDict();
  const parts = d.auth.valueParts;
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % parts.length), STEP_MS);
    return () => clearInterval(t);
  }, [held, parts.length]);

  return (
    <section
      className={s.value}
      aria-label={d.auth.valueTitle}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <ul className={s.parts}>
        {parts.map((part, i) => {
          const Icon = ICONS[i] ?? IconDoc;
          const open = i === active;
          return (
            <li key={part.title} className={`${s.part} ${TONES[i] ?? ""} ${open ? s.partOpen : ""}`}>
              <button type="button" className={s.partHead} onClick={() => setActive(i)} onMouseEnter={() => setActive(i)} aria-expanded={open}>
                <span className={s.partIcon}><Icon /></span>
                <b className={s.partName}>{part.title}</b>
                {i === LECTURES && <span className={s.soon}>{d.dashboard.lecturesSoon}</span>}
              </button>
              <div className={s.partBody} aria-hidden={!open}>
                <div className={s.partChips}>
                  {part.things.map((thing, n) => (
                    // the outer span rises into place, the inner one keeps floating, so the two movements do not fight
                    <span key={thing} className={s.chip} style={{ "--i": n } as CSSProperties}>
                      <span className={s.chipIn}>{thing}</span>
                    </span>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
