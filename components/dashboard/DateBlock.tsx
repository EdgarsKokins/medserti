import { MONTHS_SHORT } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import styles from "./overview.module.css";

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
