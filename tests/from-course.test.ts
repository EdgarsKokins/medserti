// A certificate uploaded from a course in the list: the course fills only what the certificate left empty
import { test } from "node:test";
import assert from "node:assert/strict";
import { fillFromCourse } from "../lib/courses/fromCourse";
import { EMPTY_FIELDS } from "../lib/parse";

const course = {
  id: "lab_tip:TIP2026/1", title: "Neiroloģijas konference", organizer: "Latvijas Neirologu biedrība",
  startDate: "2026-11-20", endDate: "2026-11-21", tip: 12, approvalId: "TIP2026/1",
} as never;

test("an unread certificate gets the course's title, organizer, dates, TIP and approval number, marked for checking", () => {
  const { fields, filled } = fillFromCourse({ ...EMPTY_FIELDS }, course);
  assert.deepEqual(filled, ["title", "organizer", "date", "points", "approvalId"]);
  assert.equal(fields.title, "Neiroloģijas konference");
  assert.equal(fields.date, "2026-11-20");
  assert.equal(fields.endDate, "2026-11-21");
  assert.equal(fields.points, 12);
  assert.equal(fields.country, "LV");
  assert.ok((fields.fieldConfidence?.points ?? 1) < 0.7, "below LOW_CONFIDENCE, so the review panel marks it");
});

test("what the certificate says wins", () => {
  const read = { ...EMPTY_FIELDS, title: "Neiroloģijas konference 2026", date: "2026-11-21", points: 6, fieldConfidence: { title: 0.95, date: 0.9, points: 0.9 } };
  const { fields, filled } = fillFromCourse(read, course);
  assert.deepEqual(filled, ["organizer", "approvalId"]);
  assert.equal(fields.title, "Neiroloģijas konference 2026");
  assert.equal(fields.date, "2026-11-21");
  assert.equal(fields.endDate, null, "the course's end date only comes with the course's start date");
  assert.equal(fields.points, 6);
  assert.equal(fields.fieldConfidence?.title, 0.95);
});
