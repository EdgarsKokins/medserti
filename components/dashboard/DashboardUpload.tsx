"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UploadZone from "@/components/certificates/UploadZone";
import { t, type Locale } from "@/lib/i18n";
import styles from "./overview.module.css";

/** The main action on the dashboard: add certificates without leaving the page */
export default function DashboardUpload({ locale }: { locale: Locale }) {
  const d = t(locale).dashboard;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(0);

  return (
    <section className={styles.upload} aria-label={d.uploadCta}>
      {!open ? (
        <div className={styles.uploadRow}>
          <button type="button" className={`btn btn-primary ${styles.uploadBtn}`} onClick={() => setOpen(true)}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
            </svg>
            {d.uploadCta}
          </button>
          <span className="small muted">{d.uploadHint}</span>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <UploadZone
            locale={locale}
            onUploaded={(certs) => {
              setAdded((n) => n + certs.length);
              router.refresh();
            }}
          />
          <div className="row">
            {added > 0 && (
              <>
                <span className="small">{d.uploadedCount(added)}</span>
                <Link href="/certificates" className="btn btn-primary">{d.reviewNow} →</Link>
              </>
            )}
            <button type="button" className="btn" onClick={() => setOpen(false)}>{d.uploadClose}</button>
          </div>
        </div>
      )}
    </section>
  );
}
