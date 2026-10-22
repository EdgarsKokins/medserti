"use client";

import { useEffect } from "react";
import { reportError } from "./report";

/** Errors that are not ours: browser extensions, cross-origin scripts without details, a harmless layout warning */
const ignore = (message: string, stack?: string) =>
  /^Script error\.?$/.test(message) ||
  /ResizeObserver loop/.test(message) ||
  /extension:\/\/|moz-extension|safari-web-extension/.test(stack ?? "");

/** Reports uncaught errors and rejected promises from the browser. Rendered once, in the root layout. */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const message = e.error instanceof Error ? `${e.error.name}: ${e.error.message}` : e.message;
      const stack = e.error instanceof Error ? e.error.stack : e.filename ? `at ${e.filename}:${e.lineno}:${e.colno}` : undefined;
      if (!ignore(message, stack)) reportError({ source: "client", message, stack });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const message = r instanceof Error ? `Unhandled rejection: ${r.name}: ${r.message}` : `Unhandled rejection: ${String(r)}`;
      const stack = r instanceof Error ? r.stack : undefined;
      if (!ignore(message, stack)) reportError({ source: "client", message, stack });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
