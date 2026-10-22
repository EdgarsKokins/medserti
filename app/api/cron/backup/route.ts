import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup";
import { reportServerError } from "@/lib/monitoring/errors";

// reads only new or changed files from Blob, copies the rest inside R2, then reads every copy back
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Called weekly by Vercel Cron (vercel.json), which sends "Authorization: Bearer $CRON_SECRET" */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runBackup());
  } catch (err) {
    console.error("backup", err);
    await reportServerError(err, "/api/cron/backup");
    return NextResponse.json({ error: err instanceof Error ? err.message : "Backup failed" }, { status: 500 });
  }
}
