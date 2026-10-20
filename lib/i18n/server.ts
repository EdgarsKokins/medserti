import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "../i18n";
import { loadRuntimeOverrides } from "./overrides-server";

/**
 * Locale from the "lang" cookie; Latvian by default.
 * Every server render and API route calls this before t(), so it also makes sure the /admin text overrides are applied.
 */
export async function getLocale(): Promise<Locale> {
  const [jar] = await Promise.all([cookies(), loadRuntimeOverrides()]);
  const v = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}
