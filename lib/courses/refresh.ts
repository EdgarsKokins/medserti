import type { Course, CourseIndex, CourseSource, SourceStatus } from "./types";
import { samePrefix, titleKey } from "./util";
import { fetchLabTip } from "./sources/labTip";
import { fetchLabCourses } from "./sources/labCourses";
import { fetchRss } from "./sources/rss";
import { fetchLumpii } from "./sources/lumpii";
import { fetchLma } from "./sources/lma";
import { fetchEvisit } from "./sources/evisit";

const FETCHERS: Record<CourseSource, () => Promise<Course[]>> = {
  lab_tip: fetchLabTip,
  lab_courses: fetchLabCourses,
  kursiarstiem: () => fetchRss("kursiarstiem"),
  medicinaskursi: () => fetchRss("medicinaskursi"),
  lumpii: fetchLumpii,
  lma: fetchLma,
  evisit: fetchEvisit,
};

/**
 * LĀB's approved TIP list is the backbone (it has TIP, dates, place, audience). LĀB's own course list adds
 * price and a registration link for the same events, so those are merged in by title (+ date) instead of
 * listed twice; LUMPII's dated sessions are folded in the same way. A failing source never blocks the others.
 */
export function mergeCourses(bySource: Partial<Record<CourseSource, Course[]>>): Course[] {
  let tip = bySource.lab_tip ?? [];
  const index = new Map<string, Course>();
  for (const c of tip) if (titleKey(c.title)) index.set(titleKey(c.title), c);
  // exact title, else a shared prefix on the same date; a short or empty key never matches by prefix
  const tipMatch = (c: Course) => {
    const key = titleKey(c.title);
    if (!key) return undefined;
    return index.get(key) ?? tip.find((t) => t.startDate === c.startDate && samePrefix(titleKey(t.title), key));
  };

  const extra: Course[] = [];
  for (const c of bySource.lab_courses ?? []) {
    const match = tipMatch(c);
    if (match) {
      match.price = c.price;
      match.url = c.url;
      match.free = c.free;
    } else extra.push(c);
  }

  // LUMPII lists dated sessions of courses that LĀB often approves as one long-running ("ongoing") row.
  // Same date: enrich the TIP row. Ongoing approval: the dated sessions replace it and inherit its TIP data.
  const replaced = new Set<Course>();
  for (const c of bySource.lumpii ?? []) {
    const match = tipMatch(c);
    if (match && match.kind === "event") {
      if (match.startDate !== c.startDate) {
        extra.push(c);
        continue;
      }
      match.price = c.price;
      match.url = c.url;
      match.free = c.free;
      continue;
    }
    if (match) {
      replaced.add(match);
      c.title = match.title;
      c.tip ??= match.tip;
      c.minutes ??= match.minutes;
      c.approvalId = match.approvalId;
      c.annexItem = match.annexItem;
      c.detailRef = match.detailRef;
      if (!c.audience) {
        c.audience = match.audience;
        c.allSpecialties = match.allSpecialties;
      }
    }
    extra.push(c);
  }
  tip = tip.filter((c) => !replaced.has(c));

  const seen = new Set([...tip, ...replaced].map((c) => titleKey(c.title)));
  for (const c of [...(bySource.kursiarstiem ?? []), ...(bySource.medicinaskursi ?? []), ...(bySource.lma ?? []), ...(bySource.evisit ?? [])]) {
    const key = titleKey(c.title);
    if (key && seen.has(key)) {
      // the same course on LĀB's TIP list: keep that row, but take the price the shop publishes
      const row = index.get(key);
      if (row && !row.price && c.price) {
        row.price = c.price;
        row.free = c.free;
      }
      continue;
    }
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
