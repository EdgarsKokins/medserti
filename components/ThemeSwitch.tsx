"use client";

import { useState } from "react";

import { THEME_COOKIE, type Theme } from "@/lib/theme";

const ICONS: Record<Theme, React.ReactNode> = {
  system: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5v11A5.5 5.5 0 0 0 8 2.5Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
      <path d="M13.2 10.2A5.6 5.6 0 0 1 5.8 2.8a5.6 5.6 0 1 0 7.4 7.4Z" />
    </svg>
  ),
};

/** System / light / dark. Applies instantly via data-theme on <html>; the cookie lets the server render it on the next visit. */
export default function ThemeSwitch({ initial, labels }: { initial: Theme; labels: Record<Theme | "label", string> }) {
  const [theme, setTheme] = useState<Theme>(initial);

  function pick(t: Theme) {
    setTheme(t);
    const root = document.documentElement;
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="lang-switch theme-switch" role="group" aria-label={labels.label}>
      {(["system", "light", "dark"] as Theme[]).map((t) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => pick(t)} title={labels[t]} aria-label={labels[t]}>
          {ICONS[t]}
        </button>
      ))}
    </div>
  );
}
