import "server-only";
import { getJson, putJson } from "../storage";
import { buildCourseIndex } from "./refresh";
import type { CourseIndex } from "./types";

const PATH = "courses/index.json";
/** The list changes once a day (cron), so each server instance keeps it for a few minutes instead of reading it per page */
const TTL_MS = 5 * 60_000;
type Cache = { at: number; idx: CourseIndex | null } | null;
const mem = globalThis as { __medsertiCourses?: Cache };

async function readCached(): Promise<CourseIndex | null> {
  const c = mem.__medsertiCourses;
  if (c && Date.now() - c.at < TTL_MS) return c.idx;
  const idx = await getJson<CourseIndex>(PATH);
  mem.__medsertiCourses = { at: Date.now(), idx };
  return idx;
}

export async function refreshCourseIndex(): Promise<CourseIndex> {
  const idx = await buildCourseIndex();
  // keep the last good list if every source failed this time
  if (!idx.courses.length) {
    const prev = await getJson<CourseIndex>(PATH);
    if (prev?.courses.length) return { ...prev, sources: idx.sources };
  }
  await putJson(PATH, idx);
  mem.__medsertiCourses = { at: Date.now(), idx };
  return idx;
}

/** Stored index; built on first use (the daily cron keeps it fresh after that) */
export async function getCourseIndex(): Promise<CourseIndex> {
  return (await readCached()) ?? refreshCourseIndex();
}

/** Stored index without triggering a build (for pages where a missing list is fine) */
export async function readCourseIndex(): Promise<CourseIndex | null> {
  return readCached();
}
