import { NextResponse } from "next/server";
import { refreshCourseIndex } from "@/lib/courses/store";

// ~20 polite sequential requests to the source sites, plus one per kursiarstiem.lv course for its price (~30)
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Called daily by Vercel Cron (vercel.json), which sends "Authorization: Bearer $CRON_SECRET" */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const idx = await refreshCourseIndex();
  return NextResponse.json({ fetchedAt: idx.fetchedAt, courses: idx.courses.length, sources: idx.sources });
}
