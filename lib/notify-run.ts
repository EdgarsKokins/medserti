import "server-only";
import { deleteHashFields, getHash, getRecord, getRecords, listRecordKeys, setHashFields, setRecord } from "./records";
import { listCertificates } from "./db";
import { isDemoUserId } from "./demo/id";
import { certificateWindow } from "./rules";
import { certProgress } from "./certAssign";
import { asProfile, profileCerts } from "./profileCerts";
import { specialtyLabel } from "./specialties";
import { readCourseIndex } from "./courses/store";
import type { Course } from "./courses/types";
import { sendEmail } from "./email";
import { todayLv } from "./format";
import { reportServerError } from "./monitoring/errors";
import {
  courseDigestEmail,
  dueReminder,
  EMPTY_STATE,
  newCoursesFor,
  prefsOf,
  reminderEmail,
  reminderKey,
  rigaWeekday,
  type Email,
  type NotifyState,
} from "./notifications";
import type { UserRecord } from "./types";

const USER_KEY = /^users\/([^/]+)\/user\.json$/;
export const stateKey = (userId: string) => `users/${userId}/notify-state.json`;
/** course id -> ISO time it first appeared in the index; "0000" for the courses there when this started */
const FIRST_SEEN = "courses/first-seen";
const INITIAL = "0000";
/** Resend's default limit is 2 requests a second */
const SEND_GAP_MS = 600;

/** Keeps the first-seen map in step with the course index: new ids get `now`, ids gone from the index are dropped */
async function updateFirstSeen(courses: Course[], now: string): Promise<Record<string, string>> {
  const seen = await getHash<string>(FIRST_SEEN);
  const first = Object.keys(seen).length === 0;
  const ids = new Set(courses.map((c) => c.id));
  const added = Object.fromEntries(courses.filter((c) => !(c.id in seen)).map((c) => [c.id, first ? INITIAL : now]));
  await setHashFields(FIRST_SEEN, added);
  await deleteHashFields(FIRST_SEEN, Object.keys(seen).filter((id) => !ids.has(id)));
  return { ...seen, ...added };
}

/**
 * Daily run (/api/cron/notifications): recertification reminders every day they are due, course emails on Mondays.
 * Each email is recorded in the user's notify-state before the next one, so a crash or a retry never sends twice.
 * `base` is the site address for links.
 */
export async function runNotifications(base: string, now = new Date()) {
  const nowIso = now.toISOString();
  const today = todayLv(now);
  const monday = rigaWeekday(now) === 1;
  const keys = (await listRecordKeys("users/")).filter((k) => USER_KEY.test(k));
  const users = (await getRecords<UserRecord>(keys)).filter((u): u is UserRecord => !!u && !isDemoUserId(u.id));
  // the map runs every day, so on Monday "new" means new since the last email, not since the last refresh
  const courses = (await readCourseIndex().catch(() => null))?.courses ?? [];
  const firstSeen = courses.length ? await updateFirstSeen(courses, nowIso) : {};

  const out = { users: users.length, reminders: 0, courseEmails: 0, failed: 0 };
  let sentOne = false;
  const send = async (u: UserRecord, e: Email) => {
    if (sentOne) await new Promise((r) => setTimeout(r, SEND_GAP_MS));
    sentOne = true;
    await sendEmail({ to: u.email, subject: e.subject, text: e.text, headers: e.headers });
  };

  for (const u of users) {
    const prefs = prefsOf(u);
    const courseDay = prefs.courseAlerts && monday && courses.length > 0;
    if (!prefs.reminders && !courseDay) continue;
    try {
      const state: NotifyState = { ...EMPTY_STATE, ...(await getRecord<NotifyState>(stateKey(u.id))) };
      if (prefs.reminders) {
        // each own certificate has its own period; the window alone says whether a reminder is due, and the
        // uploads are read only when one is
        const own = profileCerts(u.profile);
        let uploads: Awaited<ReturnType<typeof listCertificates>> | null = null;
        for (const c of own) {
          const end = certificateWindow(asProfile(u.profile, c), today).end;
          const due = dueReminder(end, today, state.reminders, c.id);
          if (!due || !end) continue;
          uploads ??= await listCertificates(u.id);
          const { progress } = certProgress(u.profile, uploads, c, now);
          const label = own.length > 1 ? specialtyLabel(c.specialty, u.locale ?? "lv") : null;
          await send(u, reminderEmail(u, progress, due.months, base, label));
          state.reminders = [...state.reminders, reminderKey(end, due.days, c.id)];
          await setRecord(stateKey(u.id), state);
          out.reminders++;
        }
      }
      if (courseDay) {
        // no start mark yet (turned on before this ran): start counting from now, send from next Monday
        if (state.coursesSince) {
          const list = newCoursesFor(u, courses, firstSeen, state.coursesSince, today);
          if (list.length) {
            await send(u, courseDigestEmail(u, list, base));
            out.courseEmails++;
          }
        }
        await setRecord(stateKey(u.id), { ...state, coursesSince: nowIso });
      }
    } catch (err) {
      out.failed++;
      await reportServerError(err, "/api/cron/notifications", u.id);
    }
  }
  return out;
}
