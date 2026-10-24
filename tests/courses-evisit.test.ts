// Evisit public "Aktualitātes" cards (lib/courses/sources/evisit.ts). Run: npx tsx --test tests/courses-evisit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEvisit } from "../lib/courses/sources/evisit";
import { freeForFilter, isNurseCourse } from "../lib/courses/types";

// five real cards from https://www.evisit.eu/current-events/index (24 Oct 2026), lecturer names and photos removed
const html = readFileSync(new URL("./fixtures/evisit-current-events.html", import.meta.url), "utf8");
const courses = parseEvisit(html);
const byId = (id: string) => courses.find((c) => c.id === `evisit:${id}`);

test("pharmacist-only lectures are left out", () => {
  assert.equal(byId("85"), undefined);
  assert.equal(courses.length, 4);
});

test("free recorded lecture: title, TIP, audience, link", () => {
  const c = byId("127")!;
  assert.equal(c.title, "Ķirurģijas un farmakoterapijas sinerģija aptaukošanās un cukura diabēta ārstēšanā");
  assert.equal(c.tip, 2);
  assert.equal(c.kind, "recorded");
  assert.equal(c.city, "Online");
  assert.equal(c.price, "Bez maksas");
  assert.ok(c.free);
  assert.equal(c.audience, "Ārsti, māsas un citi interesenti");
  assert.ok(c.allSpecialties);
  assert.ok(isNurseCourse(c));
  assert.equal(c.url, "https://www.evisit.eu/current-events/view/kirurgijas-un-farmakoterapijas-sinergija-aptaukosanas-un-cukura-diabeta-arstesana/127");
});

test("a published price is kept; 'Maksas' without an amount is paid, never counted as free", () => {
  assert.deepEqual([byId("113")!.price, byId("113")!.tip], ["EUR 10,00", 3.8]);
  const paid = byId("72")!;
  assert.equal(paid.price, "Par maksu");
  assert.equal(paid.free, false);
  assert.equal(freeForFilter(paid), false);
});

test("'Ārstniecības personas' counts as every specialty", () => {
  assert.ok(byId("93")!.allSpecialties);
});
