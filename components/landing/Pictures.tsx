import type { ReactNode } from "react";
import type { Dict, Locale } from "@/lib/i18n";
import { formatDate, MONTHS_SHORT } from "@/lib/format";
import { IconFile, IconFolder, IconMail } from "./icons";
import s from "./landing.module.css";

/**
 * Product pictures on the landing page: the app's own look with a made-up sample doctor (landingB.pic), always marked
 * "Piemērs". Decorative: the sections' headings and lines carry the meaning, so screen readers skip these.
 */

/** The sample doctor, part way through the period (not real data) */
const TIP = 174;
const NEED = 250;
const END = "2029-01-15";
/** reminder e-mails go 12, 6 and 4 months before the period ends (lib/notifications.ts REMINDERS) */
const REMINDERS = [
  { months: 12, date: "2028-01-15" },
  { months: 6, date: "2028-07-15" },
  { months: 4, date: "2028-09-15" },
];

function Ring({ size, d }: { size: "big" | "small"; d: Dict }) {
  return (
    <span className={`${s.ring} ${size === "big" ? s.ringBig : s.ringSmall}`} style={{ ["--pct" as string]: `${(TIP / NEED) * 100}%` }}>
      <span className={s.ringInner}>
        <b>{TIP}</b>
        <span>{d.landingA.frameOf} TIP</span>
      </span>
    </span>
  );
}

function Head({ title, d, big = false }: { title: string; d: Dict; big?: boolean }) {
  return (
    <div className={s.sheetHead}>
      <span className={big ? s.hello : s.sheetTitle}>{title}</span>
      <span className={s.sample}>{d.landingA.frameLabel}</span>
    </div>
  );
}

/** The white sheet of the app on a big soft circle */
export function Stage({ children }: { children: ReactNode }) {
  return (
    <div className={s.stage} aria-hidden>
      <div className={s.sheet}>{children}</div>
    </div>
  );
}

/** First screen: one look at all four parts */
export function HeroPicture({ d, locale }: { d: Dict; locale: Locale }) {
  const p = d.landingB.pic;
  return (
    <Stage>
      <Head title={d.dashboard.hello(p.hello)} d={d} big />
      <div className={s.ringRow}>
        <Ring size="small" d={d} />
        <span className={s.ringNote}>
          <b>{p.left(NEED - TIP)}</b>
          <span>{d.dashboard.pillUntil(formatDate(END, locale))}</span>
        </span>
      </div>
      <ul className={s.rows}>
        <li className={`${s.row} ${s.toneBlue}`}>
          <span className={s.dotOk} />
          <span className={s.rowText}><span className={s.rowTitle}>{p.congress}</span><span className={s.rowSub}>{d.dashboard.certConfirmed}</span></span>
          <span className={s.rowTip}>16 TIP</span>
        </li>
        <li className={`${s.row} ${s.toneOk}`}>
          <span className={s.date}><b>12</b><span>{MONTHS_SHORT[locale][1]}</span></span>
          <span className={s.rowText}><span className={s.rowTitle}>{p.course}</span><span className={s.rowSub}>{p.city} · 120 EUR</span></span>
          <span className={s.rowTip}>+8 TIP</span>
        </li>
        <li className={`${s.row} ${s.toneBlue}`}>
          <span className={s.fileIcon}><IconFolder /></span>
          <span className={s.rowText}><span className={s.rowTitle}>{p.docs}</span></span>
          <span className={s.check} />
        </li>
      </ul>
    </Stage>
  );
}

export function CertificatesPicture({ d, locale }: { d: Dict; locale: Locale }) {
  const p = d.landingB.pic;
  const rows = [
    { title: p.congress, sub: formatDate("2025-09-25", locale), tip: 16, ok: true },
    { title: p.training, sub: formatDate("2025-02-14", locale), tip: 8, ok: true },
    { title: p.lecture, sub: d.dashboard.certWaiting, tip: 2, ok: false },
  ];
  return (
    <Stage>
      <Head title={d.landingA.frameRecent} d={d} />
      <ul className={s.rows}>
        {rows.map((r) => (
          <li key={r.title} className={s.row}>
            <span className={r.ok ? s.dotOk : s.dotWarn} />
            <span className={s.rowText}><span className={s.rowTitle}>{r.title}</span><span className={s.rowSub}>{r.sub}</span></span>
            <span className={s.rowTip}>{r.tip} TIP</span>
          </li>
        ))}
      </ul>
      <div className={s.total}><span>{d.landingA.ledgerTotal}</span><b>{TIP} TIP</b></div>
    </Stage>
  );
}

export function DeadlinePicture({ d, locale }: { d: Dict; locale: Locale }) {
  return (
    <Stage>
      <Head title={d.landingA.frameName} d={d} />
      <div className={s.ringCentre}>
        <Ring size="big" d={d} />
        <p className={s.ringCaption}>
          <b>{d.landingA.remaining(NEED - TIP)}</b>
          <span>{d.dashboard.pillUntil(formatDate(END, locale))}</span>
        </p>
      </div>
      <ul className={s.reminders}>
        {REMINDERS.map((r) => (
          <li key={r.months}>
            <span className={s.mailIcon}><IconMail /></span>
            <b>{d.landingB.pic.months(r.months)}</b>
            <span>{formatDate(r.date, locale)}</span>
          </li>
        ))}
      </ul>
    </Stage>
  );
}

export function DocumentsPicture({ d }: { d: Dict }) {
  const files = [...d.landingA.docsFiles, d.landingA.docsCopies(12)];
  return (
    <Stage>
      <Head title={d.landingB.pic.docs} d={d} />
      <ul className={s.rows}>
        {files.map((f) => (
          <li key={f} className={s.row}>
            <span className={s.fileIcon}><IconFile /></span>
            <span className={s.rowText}><span className={s.rowTitle}>{f}</span></span>
            <span className={s.check} />
          </li>
        ))}
      </ul>
      <span className={s.fakeButton}>{d.landingB.pic.download}</span>
    </Stage>
  );
}
