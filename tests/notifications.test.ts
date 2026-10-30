// Email notifications (lib/notifications.ts, lib/notify-run.ts): when reminders go, the unsubscribe token, which
// courses a weekly email lists, and a full daily run against the local record store.
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.chdir(mkdtempSync(path.join(tmpdir(), "medserti-notify-")));
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "BLOB_READ_WRITE_TOKEN", "RESEND_API_KEY"])
  delete process.env[k];

let n: typeof import("../lib/notifications");
before(async () => {
  n = await import("../lib/notifications");
});

test("reminders: 12, 6 and 4 months before the end, each once, the most urgent after a gap", () => {
  const end = "2027-10-30";
  assert.equal(n.dueReminder(end, "2026-10-01", []), null, "more than a year left");
  assert.equal(n.dueReminder(end, "2026-10-30", [])?.days, 365);
  assert.equal(n.dueReminder(end, "2026-11-15", [n.reminderKey(end, 365)]), null, "already sent");
  assert.equal(n.dueReminder(end, "2027-05-03", [n.reminderKey(end, 365)])?.days, 180);
  // a skipped day (or a late sign-up) sends only the most urgent one
  assert.equal(n.dueReminder(end, "2027-07-20", [])?.days, 120);
  assert.equal(n.dueReminder(end, "2027-10-31", []), null, "period over");
  assert.equal(n.dueReminder(null, "2027-07-20", []), null, "no dates in the profile");
  // a new period starts the milestones again
  assert.equal(n.dueReminder("2032-10-30", "2031-11-01", [n.reminderKey(end, 365)])?.days, 365);
});

test("documents are due 3 months before the end (Reg. 391 point 46), short months clamped", () => {
  assert.equal(n.addMonths("2028-01-15", -3), "2027-10-15");
  assert.equal(n.addMonths("2028-05-31", -3), "2028-02-29");
});

test("unsubscribe tokens name one account and one kind", () => {
  const u = "77777777-7777-4777-8777-777777777777";
  const tok = n.unsubscribeToken(u, "reminders");
  assert.ok(n.verifyUnsubscribe(u, "reminders", tok));
  assert.ok(!n.verifyUnsubscribe(u, "courseAlerts", tok), "other kind");
  assert.ok(!n.verifyUnsubscribe("88888888-8888-4888-8888-888888888888", "reminders", tok), "other account");
  assert.ok(!n.verifyUnsubscribe(u, "reminders", tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A")), "changed token");
  assert.ok(!n.verifyUnsubscribe(u, "everything", tok), "unknown kind");
});

const course = (id: string, over: Record<string, unknown>) =>
  ({ id, kind: "event", title: id, audience: "", allSpecialties: false, startDate: "2026-12-01", availableUntil: null, city: "Rīga", tip: 4, source: "lab_tip", ...over }) as never;

test("weekly course email: new since the last one, still ahead, for the user's specialty", () => {
  const user = { profile: { profession: "doctor", specialty: "Neirologs" } } as never;
  const courses = [
    course("new-neuro", { audience: "Neirologi" }),
    course("old-neuro", { audience: "Neirologi" }),
    course("new-past", { audience: "Neirologi", startDate: "2026-10-01" }),
    course("new-other", { audience: "Kardiologi" }),
    course("new-everyone", { audience: "", allSpecialties: true }),
    course("new-recording", { kind: "recorded", startDate: null, audience: "Neirologi" }),
  ];
  const seen = { "new-neuro": "2026-11-02T07:00:00Z", "old-neuro": "0000", "new-past": "2026-11-02T07:00:00Z", "new-other": "2026-11-02T07:00:00Z", "new-everyone": "2026-11-02T07:00:00Z", "new-recording": "2026-11-03T07:00:00Z" };
  const list = n.newCoursesFor(user, courses, seen, "2026-10-26T07:00:00Z", "2026-11-09");
  assert.deepEqual((list as { id: string }[]).map((c) => c.id), ["new-neuro", "new-recording"]);
});

test("daily run: a due reminder goes once, and not when turned off", async () => {
  const { createUser, getUser, saveUser } = await import("../lib/db");
  const { runNotifications } = await import("../lib/notify-run");
  const { addYears } = await import("../lib/rules");
  const today = new Date("2027-07-20T07:00:00Z");
  const id = "99999999-9999-4999-8999-999999999999";
  // period ends 2027-10-30: 102 days left, so the 4-month reminder is due
  await createUser({
    id, email: "notify-test@example.test", passwordHash: "x", createdAt: "2026-01-01T00:00:00Z", locale: "lv",
    profile: { fullName: "Anna Test", profession: "doctor", specialty: "Neirologs", specialtyCode: null, certificationKind: "specialty",
      certificateNumber: "", certificateIssued: addYears("2027-10-30", -5), certificateExpires: null },
  });
  assert.deepEqual(await runNotifications("http://localhost", today), { users: 1, reminders: 1, courseEmails: 0, failed: 0 });
  assert.equal((await runNotifications("http://localhost", today)).reminders, 0, "not twice");

  const u = (await getUser(id))!;
  await saveUser({ ...u, notifications: { reminders: false, courseAlerts: false } });
  assert.equal((await runNotifications("http://localhost", new Date("2027-08-20T07:00:00Z"))).reminders, 0, "turned off");
});

test("reminder email: points, what is missing, the point 46 date and the unsubscribe link", () => {
  const user = { id: "77777777-7777-4777-8777-777777777777", email: "a@b.lv", locale: "lv", profile: { fullName: "Anna Ozola", profession: "doctor" } } as never;
  const p = { windowEnd: "2028-01-15", total: 180, required: 250, remaining: 70, checks: [{ id: "specialty", have: 100, need: 150, met: false }] } as never;
  const e = n.reminderEmail(user, p, 4, "https://medserti.lv");
  assert.match(e.subject, /4 mēneši/);
  assert.match(e.text, /Labdien, Anna!/);
  assert.match(e.text, /Ieskaitīti 180 no 250 TIP\. Vēl jāsavāc 70 TIP\./);
  assert.match(e.text, /50 TIP savā specialitātē/);
  assert.match(e.text, /līdz 15\.10\.2027\.$/m);
  assert.doesNotMatch(e.text, /\.\./, "no double dots after Latvian dates");
  assert.match(e.text, /https:\/\/medserti\.lv\/pazinojumi\?u=77777777-7777-4777-8777-777777777777&k=reminders&t=/);
  assert.match(e.headers["List-Unsubscribe"], /^<https:\/\/medserti\.lv\/pazinojumi\?/);
});
