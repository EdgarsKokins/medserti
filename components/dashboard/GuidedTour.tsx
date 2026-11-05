"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

/** The tour itself is its own chunk: someone who never runs it never downloads it */
const TourOverlay = dynamic(() => import("./TourOverlay"), { ssr: false });

// kept outside the component: a page that comes back from the browser's history still says autoStart
let remembered = false;
// set when the date step leads to the profile: back on the dashboard, the tour finishes with the upload
let resumeUpload = false;

/**
 * Starts the guided tour on the dashboard: by itself once (lib/tour.ts shouldAutoStart), or from the footer link
 * (?tour=1), which leaves the address at once so a reload does not run it again.
 */
export default function GuidedTour({ autoStart, nurse }: { autoStart: boolean; nurse: boolean }) {
  const params = useSearchParams();
  const reopen = params.get("tour") === "1";
  const [run, setRun] = useState<{ onlyUpload: boolean } | null>(null);

  useEffect(() => {
    if (reopen) {
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      window.history.replaceState(null, "", url.pathname + url.search);
      resumeUpload = false;
      setRun({ onlyUpload: false });
    } else if (resumeUpload) {
      resumeUpload = false;
      setRun({ onlyUpload: true });
    } else if (autoStart && !remembered) {
      setRun({ onlyUpload: false });
    }
  }, [reopen, autoStart]);

  // saved when it first appears, not when it ends: a reload or a closed tab halfway does not start it over
  const onShown = useCallback(() => {
    if (!autoStart || remembered) return;
    remembered = true;
    void fetch("/api/tour", { method: "POST" }).catch(() => {});
  }, [autoStart]);

  const onClose = useCallback(() => setRun(null), []);
  const onLeaveForDate = useCallback(() => {
    resumeUpload = true;
    setRun(null);
  }, []);

  if (!run) return null;
  return (
    <TourOverlay
      nurse={nurse}
      onlyUpload={run.onlyUpload}
      onShown={onShown}
      onClose={onClose}
      onLeaveForDate={onLeaveForDate}
    />
  );
}
