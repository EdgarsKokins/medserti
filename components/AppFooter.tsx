"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeSwitch from "@/components/ThemeSwitch";
import LangSwitch from "@/components/LangSwitch";
import type { Locale } from "@/lib/i18n";
import { CONTACT_EMAIL } from "@/lib/site";
import type { Theme } from "@/lib/theme";

/** Small footer on every page except the landing page, which has its own. The language and theme switches live here, out of the way. */
export default function AppFooter({
  theme,
  locale,
  labels,
}: {
  theme: Theme;
  locale: Locale;
  labels: { nav: string; about: string; rules: string; rulesUrl: string; theme: Record<Theme | "label", string>; lang: string };
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
        <div className="app-footer-tools">
          <LangSwitch locale={locale} label={labels.lang} />
          <ThemeSwitch initial={theme} labels={labels.theme} />
        </div>
      </div>
    </footer>
  );
}
