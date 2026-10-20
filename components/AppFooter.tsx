"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeSwitch from "@/components/ThemeSwitch";
import { CONTACT_EMAIL } from "@/lib/site";
import type { Theme } from "@/lib/theme";

/** Small footer on every page except the landing page, which has its own. Holds the theme switch on phones. */
export default function AppFooter({
  theme,
  labels,
}: {
  theme: Theme;
  labels: { nav: string; about: string; rules: string; rulesUrl: string; theme: Record<Theme | "label", string> };
}) {
  if (usePathname() === "/") return null;
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <nav className="app-footer-links" aria-label={labels.nav}>
          <Link href="/par-mums">{labels.about}</Link>
          <a href={labels.rulesUrl} target="_blank" rel="noreferrer">{labels.rules}</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </nav>
        <ThemeSwitch initial={theme} labels={labels.theme} />
      </div>
    </footer>
  );
}
