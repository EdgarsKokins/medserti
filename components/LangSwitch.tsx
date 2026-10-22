"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/locale";

/** Each language named in itself, for screen readers and the tooltip */
const NATIVE: Record<Locale, string> = { lv: "Latviešu", en: "English", ru: "Русский" };

/** LV / EN / RU picker in the footers. The choice is a cookie, so the server renders the right language. */
export default function LangSwitch({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  function pick(l: Locale) {
    if (l === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
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
