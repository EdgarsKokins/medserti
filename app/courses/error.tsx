"use client";

import { useEffect } from "react";

export default function CoursesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error("courses page failed", error), [error]);
  const lv = typeof document === "undefined" || document.documentElement.lang !== "en";
  return (
    <main className="container stack">
      <h1>{lv ? "Kursi un pasākumi" : "Courses and events"}</h1>
      <div className="alert alert-bad">
        {lv
          ? "Kursu sarakstu neizdevās ielādēt. Mēģiniet vēlreiz pēc brīža."
          : "The course list could not be loaded. Please try again in a moment."}
        {error.digest && <span className="small"> ({error.digest})</span>}
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={reset}>{lv ? "Mēģināt vēlreiz" : "Try again"}</button>
      </div>
    </main>
  );
}
