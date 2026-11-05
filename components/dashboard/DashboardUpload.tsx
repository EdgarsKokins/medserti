"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACCEPT, startUpload } from "@/components/certificates/uploadStore";
import { useDict } from "@/components/i18n/DictProvider";

/**
 * The certificates tile's action: pick files here, then upload and review them on /certificates.
 * The upload queue outlives the page, so the certificates page shows each one as it is stored.
 * The read-only demo account goes to the certificates page instead.
 */
export default function DashboardUpload({ className, readOnly = false }: { className?: string; readOnly?: boolean }) {
  const d = useDict().dashboard;
  const upload = useDict().upload;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  if (readOnly) return <Link href="/certificates" data-tour="upload" className={className}>{d.uploadCta} →</Link>;

  return (
    <>
      <button type="button" data-tour="upload" className={className} onClick={() => input.current?.click()}>
        {d.uploadCta} →
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (!files.length) return;
          startUpload(files, upload);
          router.push("/certificates");
        }}
      />
    </>
  );
}
