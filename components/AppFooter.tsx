"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import LangSwitch from "@/components/LangSwitch";
import type { Locale } from "@/lib/i18n";
import { CONTACT_EMAIL } from "@/lib/site";

/** Small footer on every page except the landing page, which has its own. The language switch lives here, out of the way. */
export default function AppFooter({
  locale,
  labels,
}: {
  locale: Locale;
  labels: { nav: string; about: string; rules: string; privacy: string; terms: string; rulesUrl: string; lang: string };
}) {
  if (usePathname() === "/") return null;
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <nav className="app-footer-links" aria-label={labels.nav}>
          <Link href="/par-mums">{labels.about}</Link>
          <a href={labels.rulesUrl} target="_blank" rel="noreferrer">{labels.rules}</a>
          <Link href="/privatums">{labels.privacy}</Link>
          <Link href="/noteikumi">{labels.terms}</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </nav>
        <div className="app-footer-tools">
          <LangSwitch locale={locale} label={labels.lang} />
        </div>
      </div>
    </footer>
  );
}
