import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "../i18n";
import { loadRuntimeOverrides } from "./overrides-server";

/**
 * Accept-Language -> "ru" only when the browser ranks Russian above Latvian and English.
 * Everyone else gets the default (Latvian); an explicit choice is kept in the cookie.
 */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? 1);
      return { lang: tag.split("-")[0], q: Number.isFinite(q) ? q : 0, i };
    })
    .filter((x) => x.q > 0 && isLocale(x.lang))
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return ranked[0]?.lang === "ru" ? "ru" : null;
}

/**
 * Locale from the "lang" cookie; without one, Russian for browsers that prefer it, else Latvian.
 * Every server render and API route calls this before t(), so it also makes sure the /admin text overrides are applied.
 */
export async function getLocale(): Promise<Locale> {
  const [jar, h] = await Promise.all([cookies(), headers(), loadRuntimeOverrides()]);
  const v = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(v)) return v;
  return localeFromAcceptLanguage(h.get("accept-language")) ?? DEFAULT_LOCALE;
}
