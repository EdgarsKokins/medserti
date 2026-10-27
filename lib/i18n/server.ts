import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "../i18n";
import { LOCALE_HEADER, localeFromAcceptLanguage } from "../locale";
import { loadRuntimeOverrides } from "./overrides-server";

/**
 * On a public page, the language its address asks for (proxy.ts). Elsewhere the "lang" cookie; without one,
 * Russian for browsers that prefer it, else Latvian.
 * Every server render and API route calls this before t(), so it also makes sure the /admin text overrides are applied.
 */
export async function getLocale(): Promise<Locale> {
  const [jar, h] = await Promise.all([cookies(), headers(), loadRuntimeOverrides()]);
  const fromUrl = h.get(LOCALE_HEADER);
  if (isLocale(fromUrl)) return fromUrl;
  const v = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(v)) return v;
  return localeFromAcceptLanguage(h.get("accept-language")) ?? DEFAULT_LOCALE;
}
