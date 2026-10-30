import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runNotifications } from "@/lib/notify-run";
import { siteUrl } from "@/lib/site";
import { reportServerError } from "@/lib/monitoring/errors";

// one email takes ~0.6 s with the send gap; plenty at pilot size
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Called daily by Vercel Cron (vercel.json), after the course refresh: reminders, and course emails on Mondays */
export async function GET(req: Request) {
  if (!cronAuthorized(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runNotifications(siteUrl(req)));
  } catch (err) {
    console.error("notifications", err);
    await reportServerError(err, "/api/cron/notifications");
    return NextResponse.json({ error: err instanceof Error ? err.message : "Notifications failed" }, { status: 500 });
  }
}
