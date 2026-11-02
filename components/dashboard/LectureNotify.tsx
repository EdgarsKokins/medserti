"use client";

import { useState } from "react";
import { useDict } from "@/components/i18n/DictProvider";

/** "Notify me when the lectures start": saved once per account (/api/lectures); the demo account only shows the thanks */
export default function LectureNotify({ asked, readOnly = false }: { asked: boolean; readOnly?: boolean }) {
  const d = useDict().dashboard;
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">(asked ? "done" : "idle");
  if (state === "done") return <span className="btn" aria-live="polite">{d.lecturesNotified}</span>;

  async function ask() {
    if (readOnly) return setState("done");
    setState("busy");
    const res = await fetch("/api/lectures", { method: "POST" }).catch(() => null);
    setState(res?.ok ? "done" : "failed");
  }

  return (
    <>
      <button type="button" className="btn" onClick={ask} disabled={state === "busy"}>{d.lecturesNotify}</button>
      {state === "failed" && <span className="small" role="alert">{d.lecturesFailed}</span>}
    </>
  );
}
