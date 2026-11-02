// "In the specialty" decided without the doctor (lib/specialtyDecision.ts). Run: npx tsx --test tests/specialty-decision.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSpecialty } from "../lib/specialtyDecision";
import { EMPTY_FIELDS } from "../lib/parse";
import type { Course } from "../lib/courses/types";
import type { TipLookup } from "../lib/types";

const read = (over: Partial<typeof EMPTY_FIELDS> = {}) => ({
  fields: { ...EMPTY_FIELDS, title: "Galvassāpju diagnostika ikdienas praksē", organizer: "Demo biedrība", date: "2026-10-10", points: 2, country: "LV", ...over },
  content: "certificate" as const,
  tipLookup: null,
});
const event = (audience: string): TipLookup => ({
  status: "match",
  checkedAt: "2026-11-02T00:00:00Z",
  candidates: [{ approvalId: "TIP2026/1", title: "Galvassāpju diagnostika", start: "2026-10-10", end: null, days: ["2026-10-10"], organizer: "Demo biedrība", audience, tip: 2, detailRef: null, score: 1 }],
});
const never = async () => {
  throw new Error("no lookup expected");
};

test("the certificate's own text decides first, without a lookup", async () => {
  assert.deepEqual(await decideSpecialty(read({ inSpecialty: true }), "Neirologs", null, "", never), { inSpecialty: true, inSpecialtyBy: "text" });
});

test("the audience of the course it was added from", async () => {
  const course = { audience: "Neirologs; Algologs", title: "Galvassāpes" } as Course;
  assert.deepEqual(await decideSpecialty(read(), "Neirologs", course, "", never), { inSpecialty: true, inSpecialtyBy: "course" });
});

test("LĀB's approval of the same event names the specialty", async () => {
  assert.deepEqual(await decideSpecialty(read(), "Neirologs", null, "", async () => event("Neirologs, Bērnu neirologs")), { inSpecialty: true, inSpecialtyBy: "registry" });
});

test("an all-specialty audience is not taken as the specialty", async () => {
  assert.deepEqual(await decideSpecialty(read(), "Neirologs", null, "", async () => event("Visu specialitāšu ārsti")), { inSpecialty: false, inSpecialtyBy: null });
});

test("an event abroad or with no specialty in the profile is not looked up", async () => {
  assert.deepEqual(await decideSpecialty(read({ country: "DE" }), "Neirologs", null, "", never), { inSpecialty: false, inSpecialtyBy: null });
  assert.deepEqual(await decideSpecialty(read(), "", null, "", never), { inSpecialty: false, inSpecialtyBy: null });
});

test("an ambiguous register answer decides nothing", async () => {
  const amb: TipLookup = { ...event("Neirologs"), status: "ambiguous" };
  assert.deepEqual(await decideSpecialty(read(), "Neirologs", null, "", async () => amb), { inSpecialty: false, inSpecialtyBy: null });
});
