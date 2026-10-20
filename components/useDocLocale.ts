"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";

const noop = () => () => {};

/**
 * Locale for client-only screens that get no props (error boundaries): read from <html lang>, which the root layout sets.
 * The server snapshot is the default, so hydration never mismatches.
 */
export function useDocLocale(): Locale {
  return useSyncExternalStore(
    noop,
    () => {
      const l = document.documentElement.lang;
      return isLocale(l) ? l : DEFAULT_LOCALE;
    },
    () => DEFAULT_LOCALE,
  );
}
