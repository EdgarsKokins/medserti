"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useDict } from "@/components/i18n/DictProvider";

/** App-wide error screen; /courses has its own with a course-specific message */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error("page failed", error), [error]);
  const d = useDict();
  return (
    <main className="container status-page">
      <h1>{d.error.title}</h1>
      <div className="alert alert-bad">
        {d.error.body}
        {error.digest && <span className="small"> ({error.digest})</span>}
      </div>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={reset}>{d.common.retry}</button>
        <Link href="/" className="btn">{d.common.home}</Link>
      </div>
    </main>
  );
}
