"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import s from "@/app/landing.module.css";

export interface PartTab {
  /** "dala-1": also the address the hero's steps and the pain points link to (#dala-1) */
  id: string;
  label: string;
  title: string;
  lines: string[];
  tone: "tone1" | "tone2" | "tone3";
}

/**
 * The three parts as tabs: the coloured cards pick which part's explanation shows below, so the page explains all
 * three without three long sections. A #dala-N address opens that tab and scrolls to it.
 */
export default function PartsTabs({ tabs, panels, label, more, showing }: { tabs: PartTab[]; panels: ReactNode[]; label: string; more: string; showing: string }) {
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
    <div ref={root} className={s.tabsRoot}>
      <div role="tablist" aria-label={label} className={s.columns} onKeyDown={onKey}>
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
            className={`${s.tabCard} ${s[t.tone]} ${i === active ? s.tabActive : ""}`}
            onClick={() => pick(i)}
          >
            <span className={s.colNo}>{t.label}</span>
            <span className={s.partTitle}>{t.title}</span>
            <ul className={s.covers}>
              {t.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <span className={s.tabMore}>{i === active ? showing : more}</span>
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
          className={`${s.tabPanel} ${s[tabs[i].tone]}`}
        >
          {p}
        </div>
      ))}
    </div>
  );
}
