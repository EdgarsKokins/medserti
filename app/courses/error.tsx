"use client";

import { useEffect } from "react";
import { courseStrings } from "@/components/courses/strings";
import { useDict, useLocale } from "@/components/i18n/DictProvider";

export default function CoursesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error("courses page failed", error), [error]);
  const locale = useLocale();
  const d = useDict();
  const s = courseStrings(locale);
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
