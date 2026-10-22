import { z } from "zod";
import { recordError } from "@/lib/monitoring/errors";
import { allowHit } from "@/lib/monitoring/limit";
import { sessionUserId } from "@/lib/monitoring/session";
import { clientIp } from "@/lib/password-reset";

const MAX_BODY = 8 * 1024;
const TEN_MIN = 10 * 60 * 1000;

const Body = z.object({
  source: z.enum(["client", "ui"]),
  message: z.string().max(2000),
  route: z.string().max(500),
  stack: z.string().max(4000).optional(),
  kind: z.string().max(40).regex(/^[\w.-]*$/).optional(),
  status: z.number().int().min(0).max(999).optional(),
  digest: z.string().max(60).optional(),
});

const empty = (status: number) => new Response(null, { status });

/**
 * Error reports from the browser (components/monitoring/report.ts). Answers 204 whatever happens to the report:
 * the page has nothing to show for it. Scrubbing and fingerprinting happen in lib/monitoring before anything is stored.
 */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return empty(413);
  // 20 reports per IP per 10 minutes per server instance; the browser already sends each error once per page load
  if (!allowHit(`errors:${clientIp(req)}`, 20, TEN_MIN)) return empty(429);
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY) return empty(413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return empty(400);
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return empty(400);
  await recordError({
    ...parsed.data,
    userId: await sessionUserId(req.headers.get("cookie")),
    userAgent: req.headers.get("user-agent"),
  });
  return empty(204);
}
