import { DEFAULT_LOCALE, isLocale, type Locale } from "./locale";
import { overlay } from "./i18n/overrides";
import { en, type Dict } from "./i18n/en";
import { lv } from "./i18n/lv";
import { ru } from "./i18n/ru";

/*
 * All three UI dictionaries, for server components, API routes and /admin.
 * Client components must not import values from here: that ships every language to the browser.
 * They use useDict() (components/i18n/DictProvider.tsx) and lib/locale.ts; tests/client-imports.test.ts checks this.
 */

export * from "./locale";
export type { Dict };

const DICTS: Record<Locale, Dict> = { lv, en, ru };

/** Dictionary accessor: t(locale).nav.dashboard. Admin text overrides (lib/i18n/overrides.ts) are applied on top. */
export const t = (locale: Locale): Dict => {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return overlay("", l, DICTS[l]);
};

/** The dictionary as written in code, without overrides (for /admin) */
export const baseDict = (locale: Locale): Dict => DICTS[locale];
