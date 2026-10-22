import type { Instrumentation } from "next";

export function register() {}

/**
 * Every error Next.js catches in a route handler, server component, server action or proxy ends up here
 * (https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror-optional).
 * Recorded in errors/ (lib/monitoring/errors.ts) with the route pattern ("/api/certificates/[id]"), never the URL.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // the store and email code need Node (crypto, Blob SDK); nothing in this app runs on the edge runtime
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("./lib/monitoring/errors");
  const { sessionUserId } = await import("./lib/monitoring/session");
  const e = err as Error & { digest?: string };
  const cookie = request.headers.cookie;
  await recordError({
    source: "server",
    message: e instanceof Error ? `${e.name}: ${e.message}` : e,
    stack: e?.stack,
    route: context.routePath || request.path,
    kind: `${context.routeType}${context.renderSource ? `.${context.renderSource}` : ""}`,
    digest: e?.digest,
    userId: await sessionUserId(Array.isArray(cookie) ? cookie.join("; ") : cookie),
    userAgent: [request.headers["user-agent"]].flat()[0] ?? null,
  });
};
