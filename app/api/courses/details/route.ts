import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getJson, putJson } from "@/lib/storage";
import { DETAIL_REF, fetchCourseDetails } from "@/lib/courses/details";
import type { CourseDetails } from "@/lib/courses/types";

const MAX_AGE_MS = 7 * 86_400_000; // programmes rarely change after approval

/** GET /api/courses/details?ref=application:9696 - lecture programme, fetched from LĀB on first open and cached */
export async function GET(req: Request) {
  if (!(await currentUserId())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  if (!DETAIL_REF.test(ref)) return NextResponse.json({ error: "Invalid reference" }, { status: 400 });

  const path = `courses/details/${ref.replace(":", "-")}.json`;
  const cached = await getJson<CourseDetails>(path);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < MAX_AGE_MS) return NextResponse.json(cached);
  try {
    const fresh = await fetchCourseDetails(ref);
    await putJson(path, fresh);
    return NextResponse.json(fresh);
  } catch {
    if (cached) return NextResponse.json(cached);
    return NextResponse.json({ error: "Source unavailable" }, { status: 502 });
  }
}
