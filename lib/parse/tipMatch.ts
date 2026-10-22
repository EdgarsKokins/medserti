import type { ParseNote, RegistryEvent, TipLookup } from "../types";
import { foldKey } from "../text";
import { LOW_CONFIDENCE } from "./confidence";
import type { ParseResult } from "./index";

/*
 * Points for a certificate that prints none ("Par dalību seminārā tiek piešķirti TIP punkti"), from the LĀB register of
 * approved events. Pure: the register rows come in from lib/tipRegistry.ts, so this runs in tests without the network.
 *
 * A match needs the title to agree and, when the certificate has a date, the date too: the same seminar title is often
 * approved again for each run (Orto Partneri ran "Aktualitātes un jaunākie risinājumi ..." in April and October 2025).
 * Without a date, a title alone is a match only when the register has exactly one such event and the organizer agrees.
 * Points found here are never confirmed for the user (fieldConfidence below LOW_CONFIDENCE).
 */

/** words that say nothing about which event it was */
const STOP = new Set(
  "un ar par uz no kas ka lai vai ir the and of for in on at to with from a an konference konferences seminars seminara seminaru kurss kursa kursi lekcija lekcijas sede sedes apmaciba macibu course conference seminar meeting workshop aktualitates aktualais aktualie jaunakie jaunakais 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15".split(" "),
);

/** Folded words, cut to 7 letters so Latvian endings and dropped diacritics ("traumatologija" / "traumatoloģijā") agree */
export function titleWords(title: string): string[] {
  return [...new Set(foldKey(title).split(" ").filter((w) => w.length >= 3 && !STOP.has(w)).map((w) => w.slice(0, 7)))];
}

/** Every word of `a` found in `b`, allowing one OCR slip in words of 6+ letters */
function overlap(a: string[], b: string[]): number {
  const near = (x: string, y: string) => {
    if (x === y) return true;
    if (Math.min(x.length, y.length) < 6 || Math.abs(x.length - y.length) > 1) return false;
    let diff = 0;
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i] && ++diff > 1) return false;
    return true;
  };
  return a.filter((w) => b.some((v) => near(w, v))).length;
}

/** Dice similarity of two titles' words, 0-1 */
export function titleSimilarity(a: string, b: string): number {
  const x = titleWords(a);
  const y = titleWords(b);
  if (!x.length || !y.length) return 0;
  return (2 * Math.min(overlap(x, y), overlap(y, x))) / (x.length + y.length);
}

const ORG_STOP = new Set(["sia", "as", "vsia", "biedriba", "ltd", "the", "un", "and", "of"]);
const orgWords = (s: string) => foldKey(s).split(" ").filter((w) => w.length >= 4 && !ORG_STOP.has(w)).map((w) => w.slice(0, 7));

/** The certificate's organizer (or, when the parser found none, any of its text) names the registered organizer */
export function organizerAgrees(registered: string, certOrganizer: string, certText = ""): boolean {
  const reg = orgWords(registered).slice(0, 3);
  if (!reg.length) return false;
  const mine = orgWords(`${certOrganizer} ${certText}`);
  return overlap(reg, mine) >= Math.min(2, reg.length);
}

const spanDays = (e: RegistryEvent) => (e.start && e.end ? (Date.parse(e.end) - Date.parse(e.start)) / 86_400_000 : 0);

const onDay = (e: RegistryEvent, date: string, endDate: string | null) => {
  if (e.days.includes(date)) return true;
  // a range on either side: overlap of [date, endDate] with [start, end] (short events only; long ones are e-learning periods)
  if (!e.start) return false;
  return spanDays(e) <= 31 && date <= (e.end ?? e.start) && (endDate ?? date) >= e.start;
};

/** Search words for the register's title filter: the rarest-looking (longest) words of the title, full form, folded */
export function searchTerms(title: string, max = 3): string[] {
  const words = [...new Set(foldKey(title).split(" ").filter((w) => w.length >= 6 && !STOP.has(w)))];
  return words.sort((a, b) => b.length - a.length).slice(0, max).map((w) => w.slice(0, 8));
}

const MATCH_TITLE = 0.6;
const CANDIDATE_TITLE = 0.45;
const SURE_TITLE_NO_DATE = 0.85;
const CLOSE_TITLE = 0.2;

export interface CertKeys {
  title: string;
  organizer: string;
  date: string | null;
  endDate: string | null;
  /** the parser's confidence in the date; a doubtful date does not rule events out */
  dateConfidence: number;
  /** the certificate text, for an organizer the parser did not pick out */
  text?: string;
}

export function matchTip(cert: CertKeys, events: RegistryEvent[], now = new Date().toISOString()): TipLookup {
  // the same event can come back from several search words
  const unique = [...new Map(events.map((e) => [e.approvalId, e])).values()].filter((e) => e.tip != null);
  const scored = unique
    .map((event) => {
      const title = titleSimilarity(cert.title, event.title);
      const org = organizerAgrees(event.organizer, cert.organizer, cert.text);
      const sameDay = cert.date ? onDay(event, cert.date, cert.endDate) : null;
      const score = Math.round((title * 0.6 + (sameDay == null ? 0.15 : sameDay ? 0.3 : 0) + (org ? 0.1 : 0)) * 100) / 100;
      return { event, title, org, sameDay, score };
    })
    .filter((c) => c.title >= CANDIDATE_TITLE)
    .sort((a, b) => b.score - a.score);
  // offered events are the close ones: a title much weaker than the best is another event that shares a word or two
  const result = (status: TipLookup["status"], list: typeof scored, keepAll = false): TipLookup => {
    const top = Math.max(0, ...list.map((c) => c.title));
    const close = keepAll ? list : list.filter((c) => c.title >= top - CLOSE_TITLE);
    return { status: close.length ? status : "none", candidates: close.slice(0, 3).map((c) => ({ ...c.event, score: c.score })), checkedAt: now };
  };

  const strong = scored.filter((c) => c.title >= MATCH_TITLE);
  if (cert.date && cert.dateConfidence >= LOW_CONFIDENCE) {
    const sameDay = scored.filter((c) => c.sameDay);
    const sure = sameDay.filter((c) => c.title >= MATCH_TITLE);
    if (sure.length === 1) {
      // One certificate often covers several lectures of one session, each approved under its own number
      // (two 1.3 TIP lectures on a 2.6 TIP certificate), and lecture cycles are approved for two years at a time.
      // Then the event is right but its points may not be: offer it with its same-day siblings, never fill it in.
      const siblings = sameDay.filter((c) => c !== sure[0] && foldKey(c.event.organizer) === foldKey(sure[0].event.organizer));
      if (!siblings.length && spanDays(sure[0].event) <= 31) return result("match", sure);
      return result("ambiguous", [sure[0], ...siblings], true);
    }
    if (sameDay.length) return result("ambiguous", sameDay);
    // the title is in the register, but not on this date: another run of the same event. Show it, never fill it in.
    return result("ambiguous", strong);
  }
  if (strong.length === 1 && strong[0].title >= SURE_TITLE_NO_DATE && strong[0].org && spanDays(strong[0].event) <= 31) return result("match", strong);
  return result("ambiguous", strong);
}

/** Link to the event's lecture list in the LĀB register, or the register itself */
export const registryUrl = (c: Pick<RegistryEvent, "detailRef">) => {
  const m = /^(application|publication):(\d+)$/.exec(c.detailRef ?? "");
  return m ? `https://is.arstubiedriba.lv/tip_list_approved/lessons?type=${m[1]}&id=${m[2]}` : "https://is.arstubiedriba.lv/tip_list_approved";
};

/** Points from the register are something to check, not a read value: kept below LOW_CONFIDENCE */
export const REGISTRY_CONFIDENCE = 0.6;

/** Put a lookup's result into a parse result: fill points (and a missing date) on a match, swap the "no points" note */
export function applyTipLookup(r: ParseResult, lookup: TipLookup | null): ParseResult & { tipLookup: TipLookup | null } {
  if (!lookup) return { ...r, tipLookup: null };
  const filledDate = lookup.status === "match" && !r.fields.date && !!lookup.candidates[0].start;
  const notes: ParseNote[] = (r.notes ? (JSON.parse(r.notes) as ParseNote[]) : []).filter(
    (n) => n.code !== "noPoints" && !(filledDate && n.code === "noDate"),
  );
  const f = { ...r.fields, fieldConfidence: { ...r.fields.fieldConfidence } };
  let pointsKind = r.pointsKind;
  if (lookup.status === "match") {
    const e = lookup.candidates[0];
    f.points = e.tip;
    f.approvalId = f.approvalId ?? e.approvalId;
    f.fieldConfidence.points = REGISTRY_CONFIDENCE;
    if (!f.date && e.start) {
      f.date = e.start;
      f.endDate = e.end && e.end !== e.start ? e.end : null;
      f.fieldConfidence.date = REGISTRY_CONFIDENCE;
    }
    pointsKind = "registry";
    notes.unshift({ code: "tipRegistry", p: { id: e.approvalId, points: e.tip ?? 0 } });
  } else if (lookup.status === "ambiguous") {
    notes.unshift({ code: "tipCandidates", p: { n: lookup.candidates.length } });
  } else {
    notes.unshift({ code: lookup.status === "error" ? "noPoints" : "tipNoMatch" });
  }
  return { ...r, fields: f, pointsKind, notes: notes.length ? JSON.stringify(notes) : null, tipLookup: lookup };
}
