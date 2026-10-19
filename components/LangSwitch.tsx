"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n";

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
        <button key={l} type="button" aria-pressed={l === locale} onClick={() => pick(l)} lang={l}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
