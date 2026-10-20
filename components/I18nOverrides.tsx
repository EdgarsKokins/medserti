"use client";

import { setI18nOverrides, type RuntimeOverrides } from "@/lib/i18n/overrides";

/**
 * Applies the /admin text overrides in the browser (and in the SSR pass of client components) before any child renders,
 * so client components that call t() show the same text as the server HTML: no flash, no extra request.
 */
export default function I18nOverrides({ data, children }: { data: RuntimeOverrides; children: React.ReactNode }) {
  setI18nOverrides(data);
  return children;
}
