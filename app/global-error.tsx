"use client";

import { useEffect } from "react";
import { reportBoundary } from "@/components/monitoring/report";

/*
 * Last-resort screen when the root layout itself fails. It replaces the whole page, so it has no dictionary, fonts or
 * global styles: a short message in all three languages, plain inline styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("root layout failed", error);
    reportBoundary(error);
  }, [error]);
  return (
    <html lang="lv">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f8fa", color: "#0b1b2b" }}>
        <main style={{ maxWidth: 560, margin: "15vh auto", padding: "0 16px", lineHeight: 1.5 }}>
          <h1 style={{ fontSize: "1.5rem" }}>Radās kļūda</h1>
          <p>Lapu neizdevās ielādēt. Mēģiniet vēlreiz pēc brīža.</p>
          <p lang="en">Something went wrong. Please try again in a moment.</p>
          <p lang="ru">Что-то пошло не так. Пожалуйста, попробуйте ещё раз через минуту.</p>
          {error.digest && <p style={{ fontSize: "0.85rem", color: "#4f5d6e" }}>({error.digest})</p>}
          <button
            type="button"
            onClick={reset}
            style={{ font: "inherit", padding: "10px 18px", borderRadius: 8, border: 0, background: "#1e48c9", color: "#fff", cursor: "pointer" }}
          >
            Mēģināt vēlreiz · Try again · Повторить
          </button>
        </main>
      </body>
    </html>
  );
}
