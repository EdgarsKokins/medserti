// LUMPII course page reading (lib/courses/sources/lumpii.ts). Run: npx tsx --test tests/courses-lumpii.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLumpii } from "../lib/courses/sources/lumpii";
import { mergeCourses } from "../lib/courses/refresh";
import type { Course } from "../lib/courses/types";

// synthetic page in the shape of the real article: heading line with venue, date and time, then the quoted title
const page = `<article><div itemprop="articleBody">
<p>SEMINĀRS KLĀTIENĒ A.Čaka ielā 50, Rīgā 13.11.2026 12:00-16:00</p>
<p>“Aktualitātes vairogdziedzera slimībās - klīniskie gadījumi”</p>
<p>KURSI: "NEATLIEKAMĀ PALĪDZĪBA PIEAUGUŠAJIEM"</p>
<p>Tuvākais ZOOM datums ir 25.11.2026 15.00 - 19.00, klātienē 26.11.2026 14:00-16:30</p>
<p>TIP 8 (apstiprināti LĀB). 40,- EUR</p>
<p>Klientu ievērībai</p>
</div></article>`;

test("a heading with the venue in the locative gives the address, city and start time", () => {
  const [seminar] = parseLumpii(page, "2026-11-01");
  assert.equal(seminar.startDate, "2026-11-13");
  assert.equal(seminar.location, "A.Čaka ielā 50, Rīgā");
  assert.equal(seminar.city, "Rīga");
  assert.equal(seminar.time, "12:00-16:00");
  // no price on the page: none is made up
  assert.equal(seminar.price, null);
});

test("a time written with dots and spaces is normalised", () => {
  const course = parseLumpii(page, "2026-11-01").find((c) => c.startDate === "2026-11-25");
  assert.equal(course?.time, "15:00-19:00");
});

test("merged into a LĀB TIP row on the same date, the time and venue come along", () => {
  const [seminar] = parseLumpii(page, "2026-11-01");
  const tip: Course = {
    ...seminar,
    id: "lab_tip:TIP2026/1",
    source: "lab_tip",
    location: null,
    city: null,
    time: null,
    approvalId: "TIP2026/1",
    tip: 4,
  };
  const out = mergeCourses({ lab_tip: [tip], lumpii: [seminar] });
  const row = out.find((c) => c.id === tip.id);
  assert.equal(row?.time, "12:00-16:00");
  assert.equal(row?.location, "A.Čaka ielā 50, Rīgā");
  assert.equal(row?.city, "Rīga");
  assert.equal(row?.tip, 4);
});
