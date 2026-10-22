"use client";

import { useEffect } from "react";
import { useDict } from "@/components/i18n/DictProvider";
import { reportBoundary } from "@/components/monitoring/report";

export default function CoursesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("courses page failed", error);
    reportBoundary(error);
  }, [error]);
  const d = useDict();
  const s = d.courses;
  return (
    <main className="container stack">
      <h1>{s.title}</h1>
      <div className="alert alert-bad">
        {s.loadError}
        {error.digest && <span className="small"> ({error.digest})</span>}
      </div>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={reset}>{d.common.retry}</button>
      </div>
    </main>
  );
}
