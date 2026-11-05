// The opened course on /courses (lib/courses/card.ts): apply action, the when and where lines, the empty-value line.
// All course text here is made up. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseDict } from "@/lib/i18n";
import { catalog } from "@/lib/i18n/catalog";
import { applyMode, dateSpan, isDirectApply, missingLine, restFacts, whenLine, whereLine } from "@/lib/courses/card";
import { SOURCE_URLS, type Course, type CourseExtra } from "@/lib/courses/types";

const lv = baseDict("lv").courses;
const en = baseDict("en").courses;
const ru = baseDict("ru").courses;
const TODAY = "2026-11-05";

const row = (over: Partial<Course> = {}) =>
  ({
    kind: "event",
    source: "lab_tip",
    startDate: "2026-11-16",
    endDate: null,
    availableUntil: null,
    format: "in_person",
    city: "Rīga",
    tip: 8,
    minutes: 360,
    audience: "Ģimenes ārsts",
    allSpecialties: false,
    organizer: "Izdomātā biedrība",
    ...over,
  }) as Course;

const extra = (over: Partial<CourseExtra> = {}): CourseExtra => ({
  url: "https://example.com/kurss",
  location: "Parauga iela 1",
  approvalId: "TIP2026/0001",
  annexItem: 2,
  time: "09:00",
  detailRef: null,
  contact: null,
  ...over,
});

test("apply: which sources link straight to sign-up", () => {
  for (const s of ["lab_courses", "kursiarstiem", "medicinaskursi", "evisit", "lfa", "lupsk", "lza", "kosmetologs"] as const) assert.equal(isDirectApply(s, "https://example.com/x"), true, s);
  assert.equal(isDirectApply("lab_tip", "https://example.com/x"), false);
  // LUMPII and LMA: their own course's page is direct, their list page is not
  assert.equal(isDirectApply("lumpii", "https://example.com/kursi/parauga-kurss"), true);
  assert.equal(isDirectApply("lumpii", SOURCE_URLS.lumpii), false);
  assert.equal(isDirectApply("lma", "https://example.com/parauga-kurss"), true);
  assert.equal(isDirectApply("lma", SOURCE_URLS.lma), false);
});

test("apply: direct link, email, phone, or the list as a way in", () => {
  const contact = (email: string | null, phone: string | null) => ({ name: "Parauga Persona", email, phone });
  assert.deepEqual(applyMode({ source: "kursiarstiem" }, extra({ contact: contact("a@example.com", null) })), { kind: "direct", url: "https://example.com/kurss" });
  assert.deepEqual(applyMode({ source: "lab_tip" }, extra({ contact: contact("a@example.com", "60000000") })), { kind: "email", email: "a@example.com", phone: "60000000" });
  assert.deepEqual(applyMode({ source: "lab_tip" }, extra({ contact: contact(null, "60000000") })), { kind: "phone", phone: "60000000" });
  assert.deepEqual(applyMode({ source: "lab_tip" }, extra()), { kind: "none", url: "https://example.com/kurss" });
  // a LUMPII or LMA list page with a published contact goes to the contact, not the list
  assert.equal(applyMode({ source: "lumpii" }, extra({ url: SOURCE_URLS.lumpii, contact: contact("a@example.com", null) })).kind, "email");
  assert.deepEqual(applyMode({ source: "lma" }, extra({ url: SOURCE_URLS.lma })), { kind: "none", url: SOURCE_URLS.lma });
  // details failed to load: never "direct", the source's list is still there
  assert.deepEqual(applyMode({ source: "kursiarstiem" }, null), { kind: "none", url: SOURCE_URLS.kursiarstiem });
});

test("dates read as words in each language", () => {
  assert.equal(dateSpan("2026-11-16", null, lv), "16. novembrī");
  assert.equal(dateSpan("2026-11-16", "2026-11-16", lv), "16. novembrī");
  assert.equal(dateSpan("2026-11-16", "2026-11-20", lv), "16. - 20. novembrī");
  assert.equal(dateSpan("2026-11-30", "2026-12-02", lv), "30. novembrī - 2. decembrī");
  assert.equal(dateSpan("2027-01-05", null, en), "5 January");
  assert.equal(dateSpan("2026-11-16", "2026-11-20", en), "16 - 20 November");
  assert.equal(dateSpan("2026-11-16", "2026-11-20", ru), "16 - 20 ноября");
  // same month number in two different years is not one month
  assert.equal(dateSpan("2026-11-30", "2027-11-02", en), "30 November - 2 November");
});

test("when: one day shows the weekday, several days do not, another year is said", () => {
  assert.deepEqual(whenLine(row(), extra(), lv, "lv", TODAY), { main: "16. novembrī", sub: ["pirmdien", "plkst. 09:00", "6 st."] });
  assert.deepEqual(whenLine(row({ endDate: "2026-11-20" }), extra(), lv, "lv", TODAY).sub, ["plkst. 09:00", "6 st."]);
  assert.deepEqual(whenLine(row({ startDate: "2027-01-15" }), extra(), ru, "ru", TODAY).sub, ["2027 г.", "пятница", "09:00", "6 ч"]);
  // details not loaded yet: what the row knows, no time
  assert.deepEqual(whenLine(row(), undefined, en, "en", TODAY).sub, ["Monday", "6 h"]);
});

test("when: recordings and programmes have no date", () => {
  const rec = row({ kind: "recorded", startDate: null, format: "recorded", city: "Online", availableUntil: "2027-03-31", minutes: 90 });
  assert.deepEqual(whenLine(rec, extra(), lv, "lv", TODAY), { main: "Jebkurā laikā", sub: ["pieejams līdz 31.03.2027.", "1.5 st."] });
  const ongoing = row({ kind: "ongoing", startDate: null, availableUntil: "2027-12-31", minutes: null });
  assert.deepEqual(whenLine(ongoing, extra(), lv, "lv", TODAY), { main: "Apstiprināts līdz 31.12.2027.", sub: [] });
  assert.equal(whenLine(row({ kind: "ongoing", startDate: null }), extra(), lv, "lv", TODAY).main, "Jebkurā laikā");
  assert.equal(whenLine(row({ startDate: null, minutes: null }), extra({ time: null }), lv, "lv", TODAY).main, null);
});

test("where: city and address, online, nothing", () => {
  assert.deepEqual(whereLine(row(), extra(), lv), { main: "Rīga", sub: ["Parauga iela 1"] });
  assert.deepEqual(whereLine(row({ city: "Latvija" }), extra({ location: null }), lv), { main: "Visa Latvija", sub: [] });
  assert.deepEqual(whereLine(row({ format: "online_live", city: "Online" }), extra({ location: null }), lv), { main: "Tiešsaistē", sub: [] });
  assert.deepEqual(whereLine(row({ city: null }), extra(), lv), { main: "Parauga iela 1", sub: [] });
  assert.deepEqual(whereLine(row({ city: null }), extra({ location: null }), lv), { main: null, sub: [] });
  // a venue that only repeats the city is not an address
  assert.deepEqual(whereLine(row(), extra({ location: "Rīga" }), lv), { main: "Rīga", sub: [] });
});

test("empty values: one line, only what is really missing", () => {
  assert.equal(missingLine(row(), extra(), lv, "lv"), null);
  assert.equal(
    missingLine(row({ city: "Rīga", tip: null, minutes: null, organizer: null, audience: "" }), extra({ time: null, location: null }), lv, "lv"),
    "Nav norādīts: sākuma laiks, adrese, ilgums, TIP, organizators, mērķauditorija.",
  );
  assert.equal(missingLine(row({ organizer: null }), extra({ time: null }), en, "en"), "Not listed: start time, organiser.");
  assert.equal(missingLine(row({ minutes: null }), extra(), ru, "ru"), "Не указано: продолжительность.");
  // no city is said on the where line, not here; online needs no address; "for all specialties" is an audience
  assert.equal(missingLine(row({ city: null }), extra({ location: null }), lv, "lv"), null);
  assert.equal(missingLine(row({ format: "online_live", city: "Online" }), extra({ location: null }), lv, "lv"), null);
  assert.equal(missingLine(row({ audience: "", allSpecialties: true }), extra(), lv, "lv"), null);
  // a recording has no start time to miss
  assert.equal(missingLine(row({ kind: "recorded", format: "recorded", city: "Online" }), extra({ time: null, location: null }), lv, "lv"), null);
  // still loading is not missing; a failed load is
  assert.equal(missingLine(row(), undefined, lv, "lv"), null);
  assert.equal(missingLine(row(), null, lv, "lv"), "Nav norādīts: sākuma laiks, adrese.");
});

test("every other fact stays reachable", () => {
  const contact = { name: "Parauga Persona", email: "a@example.com", phone: "60000000" };
  assert.deepEqual(restFacts(row(), extra({ contact }), lv), [
    ["Organizators", "Izdomātā biedrība"],
    ["Mērķauditorija", "Ģimenes ārsts"],
    ["Formāts", "Klātienē"],
    ["Kontakts", "Parauga Persona · a@example.com"],
    ["LĀB apstiprinājums", "TIP2026/0001, 4. pielikuma 2. p."],
  ]);
  // a course with its own sign-up page shows no contact; LMA's approval is LMA's
  const lma = restFacts(row({ source: "lma" }), extra({ contact }), lv);
  assert.equal(lma.some(([k]) => k === "Kontakts"), false);
  assert.equal(lma.some(([k]) => k === "LMA apstiprinājums"), true);
  // a programme's TIP is for the whole course
  assert.deepEqual(restFacts(row({ kind: "ongoing", tip: 40 }), extra(), en).find(([k]) => k === "TIP"), ["TIP", "40 for the whole course"]);
  assert.deepEqual(restFacts(row({ audience: "", allSpecialties: true }), extra(), lv).find(([k]) => k === "Mērķauditorija"), ["Mērķauditorija", lv.forAll]);
});

test("new texts: in all three languages, labelled for /admin, no long hyphens", () => {
  const { byKey } = catalog();
  const keys = ["moreAbout", "dateMissing", "placeMissing", "contact", "atTime", "dayMonth", "dayRange", "year", "months.0", "months.11", "weekdays.0", "weekdays.6"].map((k) => `courses.details.${k}`);
  for (const key of keys) {
    const entry = byKey.get(key);
    assert.ok(entry, key);
    assert.match(entry.label, /^Atvērts kurss/, key);
    for (const l of ["lv", "en", "ru"] as const) {
      assert.ok(entry[l].def.trim(), `${key} ${l}`);
      assert.doesNotMatch(entry[l].def, /[\u2013\u2014]/, `${key} ${l}`);
    }
  }
  assert.equal(byKey.get("courses.details.dayRange")?.lv.kind, "template");
  assert.equal(byKey.get("courses.details.dayRange")?.lv.def, "{from}. - {to}. {month}");
  assert.equal(lv.details.months.length, 12);
  assert.equal(en.details.weekdays.length, 7);
  assert.equal(ru.details.months.length, 12);
});
