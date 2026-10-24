// Course list fixes from the 24 Oct 2026 usability test (lib/courses/types.ts freeForFilter, lib/courses/util.ts cityOf). Run: npx tsx --test tests/courses-feedback.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { freeForFilter } from "../lib/courses/types";
import { cityOf } from "../lib/courses/util";

test("no published price is not free", () => {
  assert.equal(freeForFilter({ price: null, free: false }), false);
  assert.equal(freeForFilter({ price: "Bez maksas", free: true }), true);
  assert.equal(freeForFilter({ price: "EUR 10,00", free: false }), false);
});

test("venues written without the town get their city", () => {
  const cases: [string, string | null][] = [
    ["Ziemeļkurzemes reģionālā slimnīca", "Ventspils"],
    ['Klātienē, Gradu ielā 68, "Turība"', "Rīga"],
    ["RSU, MITC, Anniņmuižas bulvāris 26A", "Rīga"],
    ["Medbaltic 2026, Ķīpsalā", "Rīga"],
    ["Ļatvija", "Latvija"],
    ["Video lekcijas", "Online"],
    ["Moodle", "Online"],
    // unknown practices stay unknown rather than guessed
    ["A.Veselovska ārsta prakse", null],
  ];
  for (const [place, city] of cases) assert.equal(cityOf(place).city, city, place);
});
