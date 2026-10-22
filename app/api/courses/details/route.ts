import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getRecord, setRecord } from "@/lib/records";
import { DETAIL_REF, fetchCourseDetails } from "@/lib/courses/details";
import type { CourseDetails } from "@/lib/courses/types";
import { reportServerError } from "@/lib/monitoring/errors";

const MAX_AGE_MS = 7 * 86_400_000; // programmes rarely change after approval
/** the record outlives MAX_AGE_MS by a week, so a stale copy is still there to show when LĀB is down */
const KEEP_SEC = (2 * MAX_AGE_MS) / 1000;
/** Like the course index (lib/courses/store.ts), each server instance keeps what it read for a few minutes */
const MEM_TTL_MS = 5 * 60_000;
type Mem = Map<string, { at: number; details: CourseDetails }>;
const mem: Mem = ((globalThis as { __medsertiCourseDetails?: Mem }).__medsertiCourseDetails ??= new Map());

function remember(path: string, details: CourseDetails) {
  if (mem.size > 2_000) mem.clear();
  mem.set(path, { at: Date.now(), details });
}

/** GET /api/courses/details?ref=application:9696 - lecture programme, fetched from LĀB on first open and cached */
export async function GET(req: Request) {
  if (!(await currentUserId())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  if (!DETAIL_REF.test(ref)) return NextResponse.json({ error: "Invalid reference" }, { status: 400 });

  const path = `courses/details/${ref.replace(":", "-")}.json`;
  const hit = mem.get(path);
  if (hit && Date.now() - hit.at < MEM_TTL_MS && Date.now() - Date.parse(hit.details.fetchedAt) < MAX_AGE_MS)
    return NextResponse.json(hit.details);
  const cached = await getRecord<CourseDetails>(path);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < MAX_AGE_MS) {
    remember(path, cached);
    return NextResponse.json(cached);
  }
  try {
    const fresh = await fetchCourseDetails(ref);
    await setRecord(path, fresh, { ttlSec: KEEP_SEC });
    remember(path, fresh);
    return NextResponse.json(fresh);
  } catch (err) {
    await reportServerError(err, "/api/courses/details");
    if (cached) return NextResponse.json(cached);
    return NextResponse.json({ error: "Source unavailable" }, { status: 502 });
  }
}
