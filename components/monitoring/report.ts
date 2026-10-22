import { fingerprint, scrubMessage, scrubRoute, topFrame } from "@/lib/monitoring/scrub";

/*
 * Browser side of error monitoring: sends one report per distinct error per page load, at most MAX_PER_PAGE,
 * to /api/errors. Messages and the path are scrubbed here already (lib/monitoring/scrub.ts) and again on the server.
 */
const MAX_PER_PAGE = 10;
const sent = new Set<string>();

type Report = { source: "client" | "ui"; message: unknown; stack?: string; kind?: string; status?: number; digest?: string };

export function reportError(r: Report): void {
  if (typeof window === "undefined") return;
  try {
    const route = scrubRoute(window.location.pathname);
    const message = scrubMessage(r.message);
    const fp = fingerprint(`${r.source}:${r.kind ?? ""}:${r.status ?? ""}:${message}`, route, topFrame(r.stack));
    if (sent.has(fp) || sent.size >= MAX_PER_PAGE) return;
    sent.add(fp);
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive: the report still goes out when the error makes the user leave the page
      keepalive: true,
      body: JSON.stringify({ ...r, message, route, stack: typeof r.stack === "string" ? r.stack.slice(0, 4000) : undefined }),
    }).catch(() => {});
  } catch {
    // monitoring never breaks the page
  }
}

/** Statuses that mean the user's input was refused (validation, not signed in, demo, limits), not that something broke */
const EXPECTED = new Set([400, 401, 403, 404, 413, 422, 429]);

/**
 * A request whose failure the UI shows as a message ("Neizdevās izdzēst"). `kind` names the action: "certDelete".
 * res null: no answer (offline, or the request threw).
 */
export function reportFailure(kind: string, res: Response | null): void {
  if (res && EXPECTED.has(res.status)) return;
  reportError({ source: "ui", kind, status: res?.status ?? 0, message: res ? `${kind} failed: HTTP ${res.status}` : `${kind} failed: no response` });
}

/**
 * For error.tsx boundaries. An error with a digest came from the server, where onRequestError (instrumentation.ts)
 * already recorded it with its stack; the browser only has a generic message for it, so it is not sent twice.
 */
export function reportBoundary(error: Error & { digest?: string }): void {
  if (error.digest) return;
  reportError({ source: "client", kind: "errorBoundary", message: `${error.name}: ${error.message}`, stack: error.stack });
}
