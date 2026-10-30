import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { secret } from "./secret";
import type { Progress } from "./rules";
import { formatDate } from "./format";
import { inHours, t, type Locale } from "./i18n";
import { fmtNum, missingPhrases } from "@/components/dashboard/model";
import { matchesSpecialty } from "./parse";
import { isNurseCourse, type Course } from "./courses/types";
import type { NotificationPrefs, UserRecord } from "./types";

/**
 * Email notifications (profile, "E-pasta paziņojumi"), sent by the daily /api/cron/notifications:
 * - reminders: 12, 6 and 4 months before the certificate (or nurse registration) period ends. 4 months is a month
 *   before Reg. 391 point 46's deadline: documents go in at least 3 months before the certificate expires.
 * - courseAlerts: on Mondays, courses that appeared in the list since the last such email and fit the user.
 * Reminders are on unless turned off (they are about the user's own deadline); course emails only when turned on.
 */
export const DEFAULT_PREFS: NotificationPrefs = { reminders: true, courseAlerts: false };
export const prefsOf = (u: Pick<UserRecord, "notifications">): NotificationPrefs => ({ ...DEFAULT_PREFS, ...u.notifications });

export type NotifyKind = keyof NotificationPrefs;
export const NOTIFY_KINDS: readonly NotifyKind[] = ["reminders", "courseAlerts"];

/** Days before the period end, with the month count the subject line says */
export const REMINDERS = [
  { days: 365, months: 12 },
  { days: 180, months: 6 },
  { days: 120, months: 4 },
] as const;

/** What the cron has sent this user, so nothing goes twice: users/<id>/notify-state.json */
export interface NotifyState {
  /** "<period end>:<days>" per reminder sent */
  reminders: string[];
  /** ISO time of the last course email, or when course emails were turned on; courses seen first after it are new */
  coursesSince: string | null;
}
export const EMPTY_STATE: NotifyState = { reminders: [], coursesSince: null };

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);

/**
 * The reminder due today, if any: the latest milestone already reached, unless it was sent for this period end.
 * A missed day sends only the most urgent one, never a backlog; a period that has ended gets none.
 */
export function dueReminder(end: string | null, today: string, sent: string[], certId = "main"): (typeof REMINDERS)[number] | null {
  if (!end) return null;
  const left = daysBetween(today, end);
  if (left < 0) return null;
  const reached = REMINDERS.filter((r) => left <= r.days);
  const due = reached[reached.length - 1];
  return due && !sent.includes(reminderKey(end, due.days, certId)) ? due : null;
}
/** "<end>:<days>" for the main certificate (as before there were several), "<certId>:<end>:<days>" for the others */
export const reminderKey = (end: string, days: number, certId = "main") => (certId === "main" ? `${end}:${days}` : `${certId}:${end}:${days}`);

/* ---------- unsubscribe links: one per user and kind, signed with AUTH_SECRET ---------- */

const sign = (userId: string, kind: NotifyKind) =>
  createHmac("sha256", Buffer.from(secret())).update(`notify-unsub:${userId}:${kind}`).digest("base64url").slice(0, 32);

export const unsubscribeToken = sign;

export function verifyUnsubscribe(userId: string, kind: string, token: string): kind is NotifyKind {
  if (!(NOTIFY_KINDS as readonly string[]).includes(kind)) return false;
  const want = Buffer.from(sign(userId, kind as NotifyKind));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The page that asks before turning a kind off (a link scanner opening it changes nothing) */
export const unsubscribeUrl = (base: string, userId: string, kind: NotifyKind) =>
  `${base}/pazinojumi?u=${userId}&k=${kind}&t=${unsubscribeToken(userId, kind)}`;

/* ---------- emails ---------- */

export interface Email {
  subject: string;
  text: string;
  headers: Record<string, string>;
}

const firstName = (u: UserRecord) => u.profile.fullName.trim().split(/\s+/)[0] ?? "";
const dictFor = (u: UserRecord) => {
  const locale: Locale = u.locale ?? "lv";
  const nurse = u.profile.profession === "nurse";
  return { locale, nurse, d: nurse ? inHours(t(locale)) : t(locale) };
};
const unsubHeaders = (link: string) => ({ "List-Unsubscribe": `<${link}>` });

/** `certLabel`: the specialty, named when the user has certificates in more than one */
export function reminderEmail(u: UserRecord, p: Progress, months: number, base: string, certLabel: string | null = null): Email {
  const { locale, nurse, d } = dictFor(u);
  const m = d.notify;
  const end = p.windowEnd!;
  const missing = missingPhrases(p, d.dashboard, fmtNum);
  const unsub = unsubscribeUrl(base, u.id, "reminders");
  const lines = [
    m.hello(firstName(u)),
    "",
    ...(certLabel ? [m.certLine(certLabel)] : []),
    (nurse ? m.periodEndsNurse : m.periodEnds)(formatDate(end, locale)),
    m.status(fmtNum(p.total), p.required) + " " + (p.remaining > 0 ? m.remaining(fmtNum(p.remaining)) : m.allCollected),
    ...(missing.length ? [m.stillMissing, ...missing.map((x) => `- ${x}`)] : []),
    // Reg. 391 point 46; nurses re-register under Reg. 630, which this line does not describe
    ...(nurse ? [] : ["", m.submitBy(formatDate(addMonths(end, -3), locale))]),
    "",
    m.openDashboard,
    `${base}/dashboard`,
    ...(p.remaining > 0 ? ["", nurse ? m.digestAll : m.findCourses, `${base}/courses`] : []),
    "",
    m.stopReminders,
    unsub,
    "",
    "Medserti",
  ];
  return { subject: (nurse ? m.reminderSubjectNurse : m.reminderSubject)(months), text: lines.join("\n"), headers: unsubHeaders(unsub) };
}

/** YYYY-MM-DD plus (or minus) whole months, clamped to the month's last day */
export function addMonths(iso: string, months: number): string {
  const [y, mo, day] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}

/**
 * Courses for the weekly email: first seen after `since`, still ahead (events) or available (recordings, programmes),
 * and fitting the user: their specialty named in the audience or title, or courses for nurses. All-specialty courses
 * are left out, or every email would be the same long list.
 */
export function newCoursesFor(u: UserRecord, courses: Course[], firstSeen: Record<string, string>, since: string, today: string): Course[] {
  const nurse = u.profile.profession === "nurse";
  const specialty = u.profile.specialty.trim();
  if (!nurse && !specialty) return [];
  return courses
    .filter((c) => (firstSeen[c.id] ?? "") > since)
    .filter((c) => (c.kind === "event" ? !!c.startDate && c.startDate >= today : !c.availableUntil || c.availableUntil >= today))
    .filter((c) => (nurse ? isNurseCourse(c) : matchesSpecialty(`${c.audience} ${c.title}`, specialty)))
    .sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"));
}

const DIGEST_MAX = 10;

export function courseDigestEmail(u: UserRecord, list: Course[], base: string): Email {
  const { locale, nurse, d } = dictFor(u);
  const m = d.notify;
  const unsub = unsubscribeUrl(base, u.id, "courseAlerts");
  const shown = list.slice(0, DIGEST_MAX);
  const lines = [
    m.hello(firstName(u)),
    "",
    m.digestIntro,
    "",
    ...shown.flatMap((c) => [
      `- ${c.title}`,
      `  ${[c.startDate ? formatDate(c.startDate, locale) : m.recording, c.city === "Online" ? d.courses.online : c.city, c.tip != null ? `${fmtNum(c.tip)} TIP` : null]
        .filter(Boolean)
        .join(" · ")}`,
      `  ${base}/courses?open=${encodeURIComponent(c.id)}`,
    ]),
    ...(list.length > shown.length ? ["", m.digestMore(list.length - shown.length)] : []),
    "",
    m.digestAll,
    `${base}/courses`,
    "",
    m.stopDigest,
    unsub,
    "",
    "Medserti",
  ];
  return { subject: (nurse ? m.digestSubjectNurse : m.digestSubject)(list.length), text: lines.join("\n"), headers: unsubHeaders(unsub) };
}

/** Riga's weekday, 1 = Monday */
export const rigaWeekday = (now: Date) =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Riga", weekday: "short" }).format(now));
