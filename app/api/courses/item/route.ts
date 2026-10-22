import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { readCourseIndex } from "@/lib/courses/store";
import { courseExtra } from "@/lib/courses/types";

/** GET /api/courses/item?id=lab_tip:TIP2026/9498 - fields an opened course needs (link, venue, approval, contact); the list rows leave them out */
export async function GET(req: Request) {
  if (!(await currentUserId())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id || id.length > 300) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  // the in-memory copy of the index (1 hour), so opening a course costs no store read on a warm instance
  const course = (await readCourseIndex())?.courses.find((c) => c.id === id);
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(courseExtra(course), { headers: { "Cache-Control": "private, max-age=300" } });
}
