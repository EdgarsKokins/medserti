import { NextResponse } from "next/server";
import { migrateBlobRecords } from "@/lib/migrate-records";
import { recordsBackend } from "@/lib/records";
import { reportServerError } from "@/lib/monitoring/errors";

// about 150 records take seconds; the deadline below leaves room to save the state before the limit
export const maxDuration = 300;
export const dynamic = "force-dynamic";
const BUDGET_MS = 240_000;

/**
 * One-off: copy the JSON records from Blob into Redis (lib/migrate-records.ts). Called by hand, not by Vercel Cron:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://medserti.lv/api/cron/migrate-records?dryRun=1"
 * ?dryRun=1 lists once and counts (one advanced Blob operation, no reads). Without it: copies, verifies, and returns
 * counts; `complete: false` means the time budget ran out, call again. Repeating it is safe. Never deletes from Blob.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // a preview (no Redis on purpose) would copy live Blob data into a throwaway file
  if (process.env.VERCEL && recordsBackend() !== "redis")
    return NextResponse.json({ error: "No Redis on this deployment" }, { status: 409 });
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    return NextResponse.json(await migrateBlobRecords({ dryRun, deadline: Date.now() + BUDGET_MS }));
  } catch (err) {
    console.error("migrate-records", err);
    await reportServerError(err, "/api/cron/migrate-records");
    return NextResponse.json({ error: err instanceof Error ? err.message : "Migration failed" }, { status: 500 });
  }
}
