import type { CertStatus, CmeCertificate } from "@/lib/types";
import { formatDate as fmtDate, formatNumber as fmtNum, type Locale } from "@/lib/i18n";

/** YYYY-MM-DD -> LV "27.11.2026.", EN "27 Nov 2026"; "" for no date */
export const formatDate = (iso: string | null, locale: Locale): string => (iso ? fmtDate(iso, locale) : "");

export function formatRange(c: Pick<CmeCertificate, "date" | "endDate">, locale: Locale): string {
  if (!c.date) return "";
  return c.endDate && c.endDate !== c.date
    ? `${formatDate(c.date, locale)} - ${formatDate(c.endDate, locale)}`
    : formatDate(c.date, locale);
}

export const STATUS_CLASS: Record<CertStatus, string> = {
  parsing: "badge",
  needs_review: "badge badge-warn",
  confirmed: "badge badge-ok",
  failed: "badge badge-bad",
};

export const formatNumber = (n: number | null, locale: Locale) => (n == null ? "" : fmtNum(n, locale));
