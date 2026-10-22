import type { Locale } from "@/lib/locale";
import styles from "./overview.module.css";

export const MONTHS_SHORT: Record<Locale, string[]> = {
  lv: ["JAN", "FEB", "MAR", "APR", "MAI", "JŪN", "JŪL", "AUG", "SEP", "OKT", "NOV", "DEC"],
  en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
  ru: ["ЯНВ", "ФЕВ", "МАР", "АПР", "МАЙ", "ИЮН", "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК"],
};

/** Calendar-style date block used by course rows */
export function DateBlock({ iso, locale, fallback }: { iso: string | null; locale: Locale; fallback: string }) {
  if (!iso) {
    return (
      <span className={styles.dateBlock}>
        <span className={styles.dateDay}>∞</span>
        <span className={styles.dateMon}>{fallback}</span>
      </span>
    );
  }
  return (
    <span className={styles.dateBlock}>
      <span className={styles.dateDay}>{iso.slice(8, 10)}</span>
      <span className={styles.dateMon}>{MONTHS_SHORT[locale][Number(iso.slice(5, 7)) - 1]}</span>
    </span>
  );
}
