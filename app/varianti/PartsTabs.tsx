"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import v from "./variants.module.css";

export interface PartTab {
  /** "dala-1": also the address the hero's steps link to (#dala-1) */
  id: string;
  label: string;
  title: string;
  lines: string[];
  tone: "tone1" | "tone2" | "tone3";
}

/**
 * The three parts as tabs: the coloured cards pick which part's explanation shows below, so the page explains all
 * three without three long sections. A #dala-N address (the hero's steps) opens that tab and scrolls to it.
 */
export default function PartsTabs({ tabs, panels }: { tabs: PartTab[]; panels: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const fromHash = useCallback(() => {
    const i = tabs.findIndex((t) => `#${t.id}` === window.location.hash);
    if (i < 0) return;
    setActive(i);
    root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tabs]);
  useEffect(() => {
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [fromHash]);

  const pick = (i: number, focus = false) => {
    setActive(i);
    history.replaceState(null, "", `#${tabs[i].id}`);
    if (focus) buttons.current[i]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    pick((active + step + tabs.length) % tabs.length, true);
  };

  return (
    <div ref={root} className={v.tabsRoot}>
      <div role="tablist" aria-label="Trīs daļas" className={v.columns} onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={t.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-controls={`${t.id}-panel`}
            tabIndex={i === active ? 0 : -1}
            className={`${v.tabCard} ${v[t.tone]} ${i === active ? v.tabActive : ""}`}
            onClick={() => pick(i)}
          >
            <span className={v.colNo}>{t.label}</span>
            <span className={v.partTitle}>{t.title}</span>
            <ul className={v.covers}>
              {t.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <span className={v.tabMore}>{i === active ? "Skatīt zemāk ↓" : "Uzzināt vairāk →"}</span>
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div
          key={tabs[i].id}
          id={`${tabs[i].id}-panel`}
          role="tabpanel"
          aria-labelledby={tabs[i].id}
          hidden={i !== active}
          className={`${v.tabPanel} ${v[tabs[i].tone]}`}
        >
          {p}
        </div>
      ))}
    </div>
  );
}
