"use client";

import { useState } from "react";

/** The one button on /pazinojumi: turns one kind of email off for the account the signed link names */
export default function UnsubscribeButton(p: { u: string; k: string; t: string; question: string; button: string; done: string; failed: string }) {
  const [state, setState] = useState<"ask" | "busy" | "done" | "failed">("ask");
  async function off() {
    setState("busy");
    const res = await fetch("/api/notifications/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ u: p.u, k: p.k, t: p.t }),
    }).catch(() => null);
    setState(res?.ok ? "done" : "failed");
  }
  if (state === "done") return <p className="alert alert-ok" role="status">{p.done}</p>;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p>{p.question}</p>
      <div>
        <button type="button" className="btn btn-primary" disabled={state === "busy"} onClick={off}>
          {p.button}
        </button>
      </div>
      {state === "failed" && <p className="alert" role="alert">{p.failed}</p>}
    </div>
  );
}
