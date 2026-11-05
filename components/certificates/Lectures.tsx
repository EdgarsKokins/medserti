"use client";

import type { CmeCertificate, Lecture } from "@/lib/types";
import { useDict } from "@/components/i18n/DictProvider";
import { formatNumber } from "@/lib/format";
import { foldKey } from "@/lib/text";
import styles from "./certificates.module.css";

/** In a list row: this many lectures, then how many more */
const IN_ROW = 3;

/** One lecture that is the title says nothing new */
export function shownLectures(lectures: Lecture[] | null | undefined, title: string): Lecture[] {
  const list = lectures ?? [];
  return list.length === 1 && foldKey(list[0].name) === foldKey(title) ? [] : list;
}

/** The lectures of a course, under its title: names, with their TIP and number when the certificate gives each its own */
export default function Lectures({ cert, title, compact = false }: { cert: Pick<CmeCertificate, "lectures">; title: string; compact?: boolean }) {
  const d = useDict().review;
  const list = shownLectures(cert.lectures, title);
  if (!list.length) return null;
  const shown = compact ? list.slice(0, IN_ROW) : list;
  const note = (l: Lecture) => [l.tip != null ? `${formatNumber(l.tip)} TIP` : null, compact ? null : l.approvalId].filter(Boolean).join(" · ");
  if (compact)
    return (
      <span className={styles.lectures}>
        {shown.map((l, i) => (
          <span key={i}>
            {l.name}
            {note(l) && <span className={styles.lectureNote}> · {note(l)}</span>}
          </span>
        ))}
        {list.length > shown.length && <span className={styles.lecturesLabel}>{d.lecturesMore(list.length - shown.length)}</span>}
      </span>
    );
  return (
    <div className={styles.lectures} style={{ marginTop: 6 }}>
      <span className={styles.lecturesLabel}>{d.lectures}</span>
      <ul className={styles.lectureList}>
        {shown.map((l, i) => (
          <li key={i}>
            {l.name}
            {note(l) && <span className={styles.lectureNote}> · {note(l)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
