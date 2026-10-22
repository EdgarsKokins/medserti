// Course de-duplication (lib/courses/util.ts titleKey, lib/courses/refresh.ts mergeCourses). Run: npx tsx --test tests/courses-merge.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { samePrefix, titleKey } from "../lib/courses/util";
import { mergeCourses } from "../lib/courses/refresh";
import type { Course } from "../lib/courses/types";

let n = 0;
const course = (over: Partial<Course>): Course => ({
  id: `test:${++n}`,
  kind: "event",
  source: "lab_tip",
  title: "",
  url: "https://example.lv/",
  startDate: "2026-11-20",
  endDate: null,
  availableUntil: null,
  format: "in_person",
  location: null,
  city: "Rīga",
  tip: 4,
  minutes: 240,
  audience: "",
  allSpecialties: true,
  organizer: null,
  approvalId: null,
  annexItem: null,
  price: null,
  free: false,
  ...over,
});

test("titleKey keeps Latin letters and folds Latvian diacritics", () => {
  assert.equal(titleKey("Ģimenes ārsta prakse: aktualitātes 2026"), "gimenesarstaprakseaktualitates2026");
  assert.equal(titleKey("Rīga"), titleKey("RIGA"));
});

test("titleKey keeps Cyrillic letters instead of returning an empty key", () => {
  assert.equal(titleKey("Неотложная помощь в кардиологии"), "неотложнаяпомощьвкардиологии");
  assert.equal(titleKey("Ёлка"), "елка");
  assert.notEqual(titleKey("Неотложная помощь"), titleKey("Детская неврология"));
  assert.equal(titleKey("— – …"), "");
});

test("samePrefix needs both keys to be long enough", () => {
  assert.equal(samePrefix("", "anything at all"), false);
  assert.equal(samePrefix("kurss", "kurssarstiem2026"), false);
  assert.equal(samePrefix(titleKey("Kardioloģijas aktualitātes"), titleKey("Kardioloģijas aktualitātes 2026: II daļa")), true);
});

test("a Russian-titled course does not merge into an unrelated TIP row on the same date", () => {
  const tip = course({ title: "Kardioloģijas aktualitātes ģimenes ārstiem", approvalId: "TIP2026/1" });
  const ru = course({ source: "lab_courses", title: "Неотложная помощь в кардиологии", price: "EUR 40,00", url: "https://example.lv/ru" });
  const out = mergeCourses({ lab_tip: [tip], lab_courses: [ru] });
  assert.equal(out.length, 2);
  assert.equal(out.find((c) => c.id === tip.id)?.price, null);
  assert.equal(out.find((c) => c.id === tip.id)?.url, "https://example.lv/");
});

test("two different Russian titles from shop sources both stay listed", () => {
  const a = course({ source: "kursiarstiem", title: "Неотложная помощь" });
  const b = course({ source: "medicinaskursi", title: "Детская неврология" });
  assert.equal(mergeCourses({ kursiarstiem: [a], medicinaskursi: [b] }).length, 2);
});

test("the same Russian title from LĀB courses still enriches its TIP row", () => {
  const tip = course({ title: "Неотложная помощь в кардиологии" });
  const shop = course({ source: "lab_courses", title: "Неотложная помощь в кардиологии", price: "EUR 40,00", url: "https://example.lv/ru" });
  const out = mergeCourses({ lab_tip: [tip], lab_courses: [shop] });
  assert.equal(out.length, 1);
  assert.equal(out[0].price, "EUR 40,00");
});

test("a short title is not prefix-matched to a longer TIP title on the same date", () => {
  const tip = course({ title: "Kurss ārstiem: sirds mazspējas ārstēšana" });
  const short = course({ source: "lab_courses", title: "Kurss", price: "EUR 10,00" });
  const out = mergeCourses({ lab_tip: [tip], lab_courses: [short] });
  assert.equal(out.length, 2);
  assert.equal(out.find((c) => c.id === tip.id)?.price, null);
});

test("titles without letters never merge or de-duplicate", () => {
  const tip = course({ title: "—" });
  const other = course({ source: "lab_courses", title: "…", price: "EUR 10,00" });
  const rss = course({ source: "kursiarstiem", title: "–" });
  assert.equal(mergeCourses({ lab_tip: [tip], lab_courses: [other], kursiarstiem: [rss] }).length, 3);
});

test("a long Latin title with an extra suffix still merges by prefix on the same date", () => {
  const tip = course({ title: "Sirds mazspējas diagnostika un ārstēšana ģimenes ārsta praksē" });
  const shop = course({ source: "lab_courses", title: "Sirds mazspējas diagnostika un ārstēšana ģimenes ārsta praksē (tiešsaistē)", price: "EUR 25,00" });
  const out = mergeCourses({ lab_tip: [tip], lab_courses: [shop] });
  assert.equal(out.length, 1);
  assert.equal(out[0].price, "EUR 25,00");
});
