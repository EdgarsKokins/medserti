"use client";
import { useState } from "react";

/** Prototype only: shows the thank-you state, stores nothing */
export default function NotifyButton() {
  const [on, setOn] = useState(false);
  return on ? (
    <span className="btn" aria-live="polite">✓ Paziņosim e-pastā</span>
  ) : (
    <button type="button" className="btn" onClick={() => setOn(true)}>Paziņot, kad sāksies</button>
  );
}
