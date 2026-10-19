import "server-only";
import { getJson, putJson } from "../storage";
import { buildCourseIndex } from "./refresh";
import type { CourseIndex } from "./types";

const PATH = "courses/index.json";

export async function refreshCourseIndex(): Promise<CourseIndex> {
  const idx = await buildCourseIndex();
  // keep the last good list if every source failed this time
  if (!idx.courses.length) {
    const prev = await getJson<CourseIndex>(PATH);
    if (prev?.courses.length) return { ...prev, sources: idx.sources };
  }
  await putJson(PATH, idx);
  return idx;
}

/** Stored index; built on first use (the daily cron keeps it fresh after that) */
export async function getCourseIndex(): Promise<CourseIndex> {
  return (await getJson<CourseIndex>(PATH)) ?? refreshCourseIndex();
}

/** Stored index without triggering a build (for pages where a missing list is fine) */
export async function readCourseIndex(): Promise<CourseIndex | null> {
  return getJson<CourseIndex>(PATH);
}
