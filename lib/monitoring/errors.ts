import "server-only";
import { sendEmail } from "../email";
import { CONTACT_EMAIL } from "../site";
import { getJsonTagged, getJson, putJsonIfMatch } from "../storage";
import { dayLv, lastDays, pseudonym } from "./day";
import { deviceLabel, fingerprint, scrubMessage, scrubRoute, topFrame } from "./scrub";

/*
 * Error log: errors/YYYY-MM-DD.json, one file a day, one entry per fingerprint (message + route + top frame) with a count.
 *
 * Quota: a fingerprint this server instance has not written yet costs one read and one write. Repeats of a known
 * fingerprint are counted in memory and written with the next new one, or once 10 minutes have passed; counts still in
 * memory when the instance stops are lost (an undercount, never a missed error). Each instance writes at most
 * WRITES_PER_HOUR times an hour and WRITES_PER_DAY a day, and once the day file holds MAX_ITEMS fingerprints new ones are
 * only counted (as dropped, written with the next repeat), so an error storm cannot use up the Blob quota. The first time a fingerprint appears each day, info@ gets one email, at most MAX_EMAILS a day.
 */

export type ErrorSource = "server" | "client" | "ui";

export type ErrorInput = {
  source: ErrorSource;
  message: unknown;
  /** path or route pattern; scrubbed here */
  route: unknown;
  stack?: unknown;
  /** what failed in the UI ("certDelete"), for source "ui" */
  kind?: string;
  /** HTTP status of the failed request, 0 for no answer */
  status?: number;
  /** Next.js error digest, links a server error to the error page the user saw */
  digest?: string;
  userId?: string | null;
  userAgent?: string | null;
};

export type ErrorItem = {
  fp: string;
  source: ErrorSource;
  message: string;
  route: string;
  frame: string;
  kind?: string;
  status?: number;
  digest?: string;
  device?: string;
  first: string;
  last: string;
  count: number;
  /** pseudonymous user tags (pseudonym()), at most MAX_USERS: how many people it hits */
  users: string[];
};

export type ErrorDay = { day: string; emails: number; dropped: number; items: Record<string, ErrorItem> };

export const MAX_ITEMS = 200;
export const MAX_EMAILS = 10;
const MAX_USERS = 20;
const FLUSH_EVERY_MS = 10 * 60 * 1000;
const WRITES_PER_HOUR = 30;
const WRITES_PER_DAY = 100;

const pathOf = (day: string) => `errors/${day}.json`;
const emptyDay = (day: string): ErrorDay => ({ day, emails: 0, dropped: 0, items: {} });

/** Scrubbed, fingerprinted entry; no personal data leaves this function */
export function toItem(input: ErrorInput, now = new Date()): ErrorItem {
  const message = scrubMessage(input.message) || "(no message)";
  const route = scrubRoute(input.route);
  const frame = topFrame(input.stack);
  const kind = typeof input.kind === "string" ? input.kind.replace(/[^\w.-]/g, "").slice(0, 40) || undefined : undefined;
  const at = now.toISOString();
  return {
    fp: fingerprint(`${input.source}:${kind ?? ""}:${input.status ?? ""}:${message}`, route, frame),
    source: input.source,
    message,
    route,
    frame,
    ...(kind ? { kind } : {}),
    ...(typeof input.status === "number" ? { status: input.status } : {}),
    ...(input.digest ? { digest: String(input.digest).replace(/[^\w-]/g, "").slice(0, 40) } : {}),
    ...(input.userAgent ? { device: deviceLabel(input.userAgent) } : {}),
    first: at,
    last: at,
    count: 1,
    users: input.userId ? [pseudonym("user", input.userId)] : [],
  };
}

/** Adds pending entries to a day file. Returns the new file and the fingerprints that are new today and get an email. */
export function mergeDay(file: ErrorDay, pending: ErrorItem[]): { file: ErrorDay; alert: ErrorItem[] } {
  const out: ErrorDay = { ...file, items: { ...file.items } };
  const alert: ErrorItem[] = [];
  for (const p of pending) {
    const cur = out.items[p.fp];
    if (cur) {
      out.items[p.fp] = {
        ...cur,
        count: cur.count + p.count,
        last: p.last > cur.last ? p.last : cur.last,
        users: [...new Set([...cur.users, ...p.users])].slice(0, MAX_USERS),
        ...(p.digest ? { digest: p.digest } : {}),
      };
      continue;
    }
    if (Object.keys(out.items).length >= MAX_ITEMS) {
      out.dropped += p.count;
      continue;
    }
    out.items[p.fp] = p;
    if (out.emails < MAX_EMAILS) {
      out.emails++;
      alert.push(p);
    }
  }
  return { file: out, alert };
}

/* ---------- per-instance buffer ---------- */

type State = {
  day: string;
  /** fingerprints already in today's file */
  known: Set<string>;
  pending: Map<string, ErrorItem>;
  /** new fingerprints seen after the day file filled up, added to its dropped count on the next write */
  dropped: number;
  /** today's file holds MAX_ITEMS fingerprints */
  full: boolean;
  lastFlush: number;
  writes: number[];
  writesToday: number;
  chain: Promise<void>;
};
const g = globalThis as { __medsertiErrors?: State };
const state = (day: string): State => {
  if (!g.__medsertiErrors || g.__medsertiErrors.day !== day)
    g.__medsertiErrors = { day, known: new Set(), pending: new Map(), dropped: 0, full: false, lastFlush: Date.now(), writes: [], writesToday: 0, chain: Promise.resolve() };
  return g.__medsertiErrors;
};

/** Record an error. Never throws: monitoring must not break the request it watches. */
export async function recordError(input: ErrorInput): Promise<void> {
  try {
    const now = new Date();
    const item = toItem(input, now);
    const s = state(dayLv(now));
    if (s.full && !s.known.has(item.fp)) {
      s.dropped++;
      return;
    }
    const cur = s.pending.get(item.fp);
    s.pending.set(
      item.fp,
      cur ? { ...cur, count: cur.count + 1, last: item.last, users: [...new Set([...cur.users, ...item.users])].slice(0, MAX_USERS) } : item,
    );
    const due = !s.known.has(item.fp) || Date.now() - s.lastFlush > FLUSH_EVERY_MS;
    if (!due) return;
    s.chain = s.chain.then(() => flush(s)).catch((e) => console.error("[monitoring] flush failed", e));
    await s.chain;
  } catch (e) {
    console.error("[monitoring] record failed", e);
  }
}

async function flush(s: State): Promise<void> {
  if (!s.pending.size || s.writesToday >= WRITES_PER_DAY) return;
  const hourAgo = Date.now() - 3_600_000;
  s.writes = s.writes.filter((t) => t > hourAgo);
  if (s.writes.length >= WRITES_PER_HOUR) return; // keep counting in memory; written once the hour frees up
  const pending = [...s.pending.values()];
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await getJsonTagged<ErrorDay>(pathOf(s.day));
    const merged = mergeDay(cur?.value ?? emptyDay(s.day), pending);
    const { alert } = merged;
    const file = { ...merged.file, dropped: merged.file.dropped + s.dropped };
    s.writes.push(Date.now());
    s.writesToday++;
    if (!(await putJsonIfMatch(pathOf(s.day), file, cur?.etag ?? null))) continue;
    for (const p of pending) s.pending.delete(p.fp);
    s.dropped = 0;
    s.known = new Set(Object.keys(file.items));
    s.full = s.known.size >= MAX_ITEMS;
    s.lastFlush = Date.now();
    for (const a of alert) await sendAlert(a).catch((e) => console.error("[monitoring] alert email failed", e));
    return;
  }
}

function sendAlert(e: ErrorItem) {
  const where = e.source === "server" ? "serveris" : e.source === "client" ? "pārlūks" : "pārlūks, pieprasījums neizdevās";
  return sendEmail({
    to: CONTACT_EMAIL,
    subject: `Medserti kļūda: ${e.message.slice(0, 80)}`,
    text: [
      `Jauna kļūda šodien (${where}).`,
      "",
      `Ziņa: ${e.message}`,
      `Lapa: ${e.route}`,
      e.frame ? `Vieta kodā: ${e.frame}` : null,
      e.kind ? `Darbība: ${e.kind}` : null,
      e.status != null ? `HTTP statuss: ${e.status || "nav atbildes"}` : null,
      e.digest ? `Digest: ${e.digest}` : null,
      e.device ? `Ierīce: ${e.device}` : null,
      "",
      "Atkārtojumi netiek sūtīti; skaits un saraksts: https://medserti.lv/admin/kludas",
    ]
      .filter((l) => l !== null)
      .join("\n"),
  });
}

/** Day files for the admin page, newest first; days without errors are left out */
export async function readErrorDays(n = 7): Promise<ErrorDay[]> {
  const days = await Promise.all(lastDays(n).map((d) => getJson<ErrorDay>(pathOf(d))));
  return days.filter((d): d is ErrorDay => !!d);
}

/** For the explicit catches in API routes: records the error with the route it happened on */
export const reportServerError = (err: unknown, route: string, userId?: string | null) =>
  recordError({
    source: "server",
    message: err instanceof Error ? `${err.name}: ${err.message}` : err,
    stack: err instanceof Error ? err.stack : undefined,
    route,
    userId,
  });
