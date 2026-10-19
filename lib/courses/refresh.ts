import type { Course, CourseIndex, CourseSource, SourceStatus } from "./types";
import { titleKey } from "./util";
import { fetchLabTip } from "./sources/labTip";
import { fetchLabCourses } from "./sources/labCourses";
import { fetchRss } from "./sources/rss";

const FETCHERS: Record<CourseSource, () => Promise<Course[]>> = {
  lab_tip: fetchLabTip,
  lab_courses: fetchLabCourses,
  kursiarstiem: () => fetchRss("kursiarstiem"),
  medicinaskursi: () => fetchRss("medicinaskursi"),
};

/**
 * LĀB's approved TIP list is the backbone (it has TIP, dates, place, audience). LĀB's own course list adds
 * price and a registration link for the same events, so those are merged in by title (+ date) instead of
 * listed twice. A failing source never blocks the others.
 */
export function mergeCourses(bySource: Partial<Record<CourseSource, Course[]>>): Course[] {
  const tip = bySource.lab_tip ?? [];
  const index = new Map<string, Course>();
  for (const c of tip) index.set(titleKey(c.title), c);

  const extra: Course[] = [];
  for (const c of bySource.lab_courses ?? []) {
    const key = titleKey(c.title);
    const match =
      index.get(key) ??
      tip.find((t) => t.startDate === c.startDate && (titleKey(t.title).startsWith(key.slice(0, 30)) || key.startsWith(titleKey(t.title).slice(0, 30))));
    if (match) {
      match.price = c.price;
      match.url = c.url;
      match.free = c.free;
    } else extra.push(c);
  }

  const seen = new Set(tip.map((c) => titleKey(c.title)));
  for (const c of [...(bySource.kursiarstiem ?? []), ...(bySource.medicinaskursi ?? [])]) {
    const key = titleKey(c.title);
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(c);
  }

  const all = [...tip, ...extra];
  const ids = new Set<string>();
  return all
    .filter((c) => (ids.has(c.id) ? false : (ids.add(c.id), true)))
    .sort(
      (a, b) =>
        (a.startDate ?? a.availableUntil ?? "9999").localeCompare(b.startDate ?? b.availableUntil ?? "9999") ||
        (b.tip ?? 0) - (a.tip ?? 0),
    );
}

export async function buildCourseIndex(): Promise<CourseIndex> {
  const bySource: Partial<Record<CourseSource, Course[]>> = {};
  const sources: SourceStatus[] = [];
  // sequential on purpose: at most one request at a time to each site
  for (const source of Object.keys(FETCHERS) as CourseSource[]) {
    try {
      const list = await FETCHERS[source]();
      bySource[source] = list;
      sources.push({ source, ok: true, count: list.length, error: null });
    } catch (e) {
      sources.push({ source, ok: false, count: 0, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    }
  }
  return { fetchedAt: new Date().toISOString(), courses: mergeCourses(bySource), sources };
}
