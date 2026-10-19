import type { CourseDetails, Lecture } from "./types";
import { fetchText, textOf } from "./util";

/** LĀB lecture programme for one approved event: lecturer, lecture title, minutes */
const LESSONS = "https://is.arstubiedriba.lv/tip_list_approved/lessons";
export const DETAIL_REF = /^(application|publication):(\d{1,7})$/;

/** Heading of a lecture description: first line, cut at the first sentence end, max ~150 chars */
export function shortTitle(raw: string): string {
  const first = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  let s = first.replace(/\s+/g, " ");
  // "Praktiskā sesija: X: details..." -> keep up to the second colon
  const colons = [...s.matchAll(/:\s/g)].map((m) => m.index!);
  if (colons.length >= 2 && colons[1] > 20) s = s.slice(0, colons[1]);
  const dot = s.search(/[.!?](\s|$)/);
  if (dot > 30) s = s.slice(0, dot);
  if (s.length > 150) s = s.slice(0, 147).replace(/\s+\S*$/, "") + "…";
  return s.replace(/[:;,\s]+$/, "");
}

export function parseLessons(html: string): Lecture[] {
  const body = html.slice(html.indexOf("<tbody"), html.lastIndexOf("</tbody>"));
  const out: Lecture[] = [];
  for (const tr of body.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 3) continue;
    const minutes = cells[3] ? Number(textOf(cells[3])) || null : null;
    out.push({ lecturer: textOf(cells[1]).replace(/\s+,/g, ","), title: shortTitle(textOf(cells[2], true)), minutes });
  }
  return out;
}

export async function fetchCourseDetails(ref: string): Promise<CourseDetails> {
  const m = DETAIL_REF.exec(ref);
  if (!m) throw new Error("Invalid reference");
  const html = await fetchText(`${LESSONS}?type=${m[1]}&id=${m[2]}`);
  return { ref, fetchedAt: new Date().toISOString(), lectures: parseLessons(html) };
}
