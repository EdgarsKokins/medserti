import { NextResponse } from "next/server";
import { refreshCourseIndex } from "@/lib/courses/store";
import { pruneMonitoring } from "@/lib/monitoring/day";
import { reportServerError } from "@/lib/monitoring/errors";

// ~20 polite sequential requests to the source sites, plus one per kursiarstiem.lv course for its price (~30)
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Called daily by Vercel Cron (vercel.json), which sends "Authorization: Bearer $CRON_SECRET".
 * Also deletes error and feedback files older than 30 days (deletes cost no Blob operation).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await pruneMonitoring().catch((err) => reportServerError(err, "/api/cron/refresh-courses (prune)"));
  const idx = await refreshCourseIndex();
  return NextResponse.json({ fetchedAt: idx.fetchedAt, courses: idx.courses.length, sources: idx.sources });
}
