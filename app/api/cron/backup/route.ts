import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup";

// copies and then reads back every file; ~12 MB today
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
    return NextResponse.json({ error: err instanceof Error ? err.message : "Backup failed" }, { status: 500 });
  }
}
