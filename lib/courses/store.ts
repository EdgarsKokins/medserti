import "server-only";
import { getJson, putJson } from "../storage";
import { buildCourseIndex } from "./refresh";
import type { CourseIndex } from "./types";

const PATH = "courses/index.json";
/** The list changes once a day (cron), so each server instance keeps it for a few minutes instead of reading it per page */
const TTL_MS = 5 * 60_000;
/* one cache per server process (route bundles can hold separate copies of this module), plus the read or build in flight */
type Cache = {
  mem: { at: number; idx: CourseIndex | null } | null;
  reading: Promise<CourseIndex | null> | null;
  building: Promise<CourseIndex> | null;
};
const cache: Cache = ((globalThis as { __medsertiCourses?: Cache }).__medsertiCourses ??= { mem: null, reading: null, building: null });

async function readCached(): Promise<CourseIndex | null> {
  const { mem } = cache;
  if (mem && Date.now() - mem.at < TTL_MS) return mem.idx;
  const started = Date.now();
  cache.reading ??= getJson<CourseIndex>(PATH)
    .then((idx) => {
      // a build that finished meanwhile wrote a newer list; keep that one
      if (!cache.mem || cache.mem.at < started) cache.mem = { at: Date.now(), idx };
      return cache.mem.idx;
    })
    .finally(() => {
      cache.reading = null;
    });
  return cache.reading;
}

async function build(): Promise<CourseIndex> {
  const idx = await buildCourseIndex();
  console.log(`[courses] index built: ${idx.courses.length} courses, ${idx.sources.filter((x) => !x.ok).length} sources failed`);
  // keep the last good list if every source failed this time
  if (!idx.courses.length) {
    const prev = await getJson<CourseIndex>(PATH);
    if (prev?.courses.length) return { ...prev, sources: idx.sources };
  }
  await putJson(PATH, idx);
  cache.mem = { at: Date.now(), idx };
  return idx;
}

/**
 * Scrape all sources and store the result. Callers that arrive while a build runs share it, so parallel first visits
 * on a fresh deploy (or a visit during the cron) cost one scrape, not one each.
 */
export function refreshCourseIndex(): Promise<CourseIndex> {
  cache.building ??= build().finally(() => {
    cache.building = null;
  });
  return cache.building;
}

/** Stored index; built on first use (the daily cron keeps it fresh after that) */
export async function getCourseIndex(): Promise<CourseIndex> {
  return (await readCached()) ?? refreshCourseIndex();
}

/** Stored index without triggering a build (for pages where a missing list is fine) */
export async function readCourseIndex(): Promise<CourseIndex | null> {
  return readCached();
}
