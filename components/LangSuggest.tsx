"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, localePath, type Locale } from "@/lib/locale";

/**
 * A Latvian public page opened in a browser that prefers Russian: offer the Russian version, never switch on our own
 * (many Latvian doctors run Russian-language browsers). Either answer is remembered, so the offer shows once.
 */
export default function LangSuggest({ path, text, yes, no }: { path: string; text: string; yes: string; no: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const choose = (l: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    if (l === "lv") return setOpen(false);
    router.push(localePath(path, l));
  };
  return (
    <div className="lang-suggest" role="note" lang="ru">
      <div className="lang-suggest-inner">
        <span>{text}</span>
        <span className="lang-suggest-actions">
          <button type="button" className="btn btn-primary" onClick={() => choose("ru")}>{yes}</button>
          <button type="button" className="btn" onClick={() => choose("lv")}>{no}</button>
        </span>
      </div>
    </div>
  );
}
