"use client";

import { usePathname, useRouter } from "next/navigation";
import { isPublicPath, LOCALE_COOKIE, LOCALES, localePath, splitLocalePath, type Locale } from "@/lib/locale";

/** Each language named in itself, for screen readers and the tooltip */
const NATIVE: Record<Locale, string> = { lv: "Latviešu", en: "English", ru: "Русский" };

/**
 * LV / EN / RU picker in the footers. The choice is a cookie, so the server renders the right language.
 * A public page has its own address per language (/ru/par-mums), so there the picker loads that address.
 */
export default function LangSwitch({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  function pick(l: Locale) {
    if (l === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    const { path } = splitLocalePath(pathname);
    // a full load, not router.push: a client-side move to /ru swaps only the page, so the root layout (header buttons,
    // <html lang>, the texts client components read) stayed in the old language (02 Nov 2026).
    // router.refresh re-renders the layout too, so pages without a language address keep it.
    if (isPublicPath(path)) window.location.assign(localePath(path, l) + window.location.search);
    else router.refresh();
  }
  return (
    <div className="lang-switch" role="group" aria-label={label}>
      {LOCALES.map((l) => (
        <button key={l} type="button" aria-pressed={l === locale} onClick={() => pick(l)} lang={l} aria-label={NATIVE[l]} title={NATIVE[l]}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
