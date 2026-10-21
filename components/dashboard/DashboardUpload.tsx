"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ACCEPT, startUpload } from "@/components/certificates/uploadStore";
import { t, type Locale } from "@/lib/i18n";
import styles from "./overview.module.css";

/**
 * The main action on the dashboard: pick files here, then upload and review them on /certificates.
 * The upload queue outlives the page, so the certificates page shows each one as it is stored.
 */
export default function DashboardUpload({ locale, readOnly = false }: { locale: Locale; readOnly?: boolean }) {
  const dict = t(locale);
  const d = dict.dashboard;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  return (
    <section className={styles.upload} aria-label={d.uploadCta}>
      <div className={styles.uploadRow}>
        <button type="button" className={`btn btn-primary ${styles.uploadBtn}`} onClick={() => input.current?.click()} disabled={readOnly}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
          </svg>
          {d.uploadCta}
        </button>
        <span className="small muted">{readOnly ? dict.demo.uploadOff : d.uploadHint}</span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            startUpload(files, dict.upload);
            router.push("/certificates");
          }}
        />
      </div>
    </section>
  );
}
