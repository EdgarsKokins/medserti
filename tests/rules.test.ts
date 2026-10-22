/* Rules tests (lib/rules.ts and the views built on it). Run with: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { cappedPoints, certificateWindow, computeProgress, practicalCap, ruleBasis, ruleRequiredPoints, todayLv } from "@/lib/rules";
import { categoryBreakdown, isoDay } from "@/components/dashboard/model";
import { buildRecertificationSheet, toBuffer, type ExportCertificate, type ExportPerson } from "@/lib/export/docs";
import type { CmeCertificate, Profile } from "@/lib/types";

const NOW = new Date("2026-10-22T10:00:00Z");

const profile = (over: Partial<Profile> = {}): Profile => ({
  fullName: "Anna Test",
  profession: "doctor",
  specialty: "Internists",
  specialtyCode: null,
  certificationKind: "specialty",
  certificateNumber: "",
  certificateIssued: "2024-06-01",
  certificateExpires: "2029-06-01",
  requiredPointsOverride: null,
  ...over,
});

let n = 0;
const cert = (over: Partial<CmeCertificate> = {}): CmeCertificate =>
  ({
    id: `c${++n}`,
    userId: "u",
    fileName: "f.pdf",
    filePath: "p",
    contentType: "application/pdf",
    uploadedAt: "2026-01-01T00:00:00Z",
    status: "confirmed",
    title: "Course",
    organizer: "Org",
    date: "2025-03-01",
    endDate: null,
    points: 10,
    academicHours: null,
    category: "training_latvia",
    inSpecialty: true,
    emergencyCare: false,
    practicalHours: null,
    approvalId: null,
    country: "LV",
    confidence: 1,
    ...over,
  }) as CmeCertificate;

const check = (p: ReturnType<typeof computeProgress>, id: string) => p.checks.find((c) => c.id === id);

/* L3: the window always has a start */

test("L3: expiry only -> start is expiry minus 5 years, an old certificate does not count", () => {
  const prof = profile({ certificateIssued: null, certificateExpires: "2027-06-01" });
  assert.deepEqual(certificateWindow(prof), { start: "2022-06-01", end: "2027-06-01" });
  const p = computeProgress(prof, [cert({ date: "2012-05-01" }), cert({ date: "2023-01-10" })], NOW);
  assert.equal(p.counted.length, 1);
  assert.equal(p.total, 10);
  assert.equal(p.windowStart, "2022-06-01");
});

test("L3: no dates at all -> start is 5 years before today, end stays open", () => {
  const prof = profile({ certificateIssued: null, certificateExpires: null });
  assert.deepEqual(certificateWindow(prof, "2026-10-22"), { start: "2021-10-22", end: null });
  const p = computeProgress(prof, [cert({ date: "2015-01-01" }), cert({ date: "2024-01-01" })], NOW);
  assert.equal(p.counted.length, 1);
  assert.equal(p.daysLeft, null);
});

test("L3: issue date only -> end is issue plus 5 years", () => {
  assert.deepEqual(certificateWindow(profile({ certificateIssued: "2024-06-01", certificateExpires: null })), { start: "2024-06-01", end: "2029-06-01" });
});

test("L3: nurse with no registration date is bounded too", () => {
  const w = certificateWindow(profile({ profession: "nurse", certificateIssued: null, certificateExpires: null }), "2026-10-22");
  assert.equal(w.start, "2021-10-22");
});

/* L4: met uses unrounded sums */

test("L4: 249.96 of 250 is not met; shown 249.9 with 0.1 left", () => {
  const p = computeProgress(profile(), [cert({ points: 200 }), cert({ points: 49.96 })], NOW);
  const total = check(p, "total")!;
  assert.equal(total.met, false);
  assert.equal(total.have, 249.9);
  assert.equal(p.total, 249.9);
  assert.equal(p.remaining, 0.1);
  assert.equal(p.allMet, false);
});

test("L4: exactly 250 is met with 0 left", () => {
  const p = computeProgress(profile(), [cert({ points: 200 }), cert({ points: 50 })], NOW);
  assert.equal(check(p, "total")!.met, true);
  assert.equal(p.total, 250);
  assert.equal(p.remaining, 0);
});

test("L4: specialty and emergency checks compare unrounded sums too", () => {
  const p = computeProgress(
    profile(),
    [
      cert({ points: 149.96 }),
      cert({ points: 100, inSpecialty: false }),
      cert({ points: 7.96, inSpecialty: false, emergencyCare: true, practicalHours: 3.96 }),
    ],
    NOW,
  );
  const spec = check(p, "specialty")!;
  assert.equal(spec.met, false);
  assert.equal(spec.have, 149.9);
  assert.equal(check(p, "emergency_points")!.met, false);
  assert.equal(check(p, "emergency_points")!.have, 7.9);
  assert.equal(check(p, "emergency_practical")!.met, false);
});

test("L4: nurse topic minimums compare unrounded hours", () => {
  const prof = profile({ profession: "nurse", certificateIssued: null, certificateExpires: "2028-03-01" });
  const p = computeProgress(prof, [cert({ points: 3.96, nurseTopic: "infection_control" })], NOW);
  const ic = check(p, "infection_control")!;
  assert.equal(ic.met, false);
  assert.equal(ic.have, 3.9);
});

/* L5: the 16% practical cap is the same on the dashboard, the category bars and the LĀB sheet */

const capCerts = () => [
  cert({ points: 200 }),
  cert({ points: 60, category: "practical_training", inSpecialty: false }), // cap is 250 x 16% = 40
];

test("L5: dashboard caps practical training at 16%", () => {
  const p = computeProgress(profile(), capCerts(), NOW);
  assert.equal(p.practicalRaw, 60);
  assert.equal(p.practicalCounted, 40);
  assert.equal(p.total, 240);
});

test("L5: categoryBreakdown rows add up to the dashboard total", () => {
  const p = computeProgress(profile(), capCerts(), NOW);
  const rows = categoryBreakdown(p);
  assert.equal(rows.reduce((a, r) => a + r.points, 0), p.total);
  const practical = rows.find((r) => r.category === "practical_training")!;
  assert.equal(practical.points, 40);
  assert.equal(practical.rawPoints, 60);
});

const person: ExportPerson = {
  firstName: "Anna", lastName: "Test", personalCode: "", practitionerId: "", address: "", phone: "", email: "",
  notifyBy: "email", commission: "", workplaces: [], abroad: [], abroadNoMisconduct: false, languageDoc: false,
  earlierActivities: false, earlierNote: "", otherDocs: "", paperCertificate: false, delivery: "pickup",
  deliveryAddress: "", declarations: false,
};

/** The rows app/export/page.tsx builds */
function exportRows(prof: Profile, certs: CmeCertificate[]): ExportCertificate[] {
  const p = computeProgress(prof, certs, NOW);
  const { scale } = practicalCap(p.counted, p.required, prof.profession === "nurse");
  return p.counted.map((c) => {
    const points = cappedPoints(c, scale);
    return {
      approvalId: null, organizer: c.organizer, title: c.title, date: c.date!, endDate: null, points,
      ...(points < (c.points ?? 0) ? { rawPoints: c.points ?? 0 } : {}), inSpecialty: c.inSpecialty,
    };
  });
}

async function sheetText(rows: ExportCertificate[]): Promise<string> {
  const doc = buildRecertificationSheet(person, { number: "1", validUntil: "2029-06-01", specialty: "Internists" }, rows);
  const zip = await JSZip.loadAsync(await toBuffer(doc));
  return (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
}

test("L5: the Annex 3 sheet shows capped practical points and a note, totals match the dashboard", async () => {
  const certs = capCerts();
  const rows = exportRows(profile(), certs);
  const p = computeProgress(profile(), certs, NOW);
  assert.equal(rows.reduce((a, r) => a + r.points, 0), p.total);
  const text = await sheetText(rows);
  assert.match(text, /40\*/);
  assert.match(text, /ieskaitīti 40 no 60 TIP/);
  assert.match(text, /Kopā ieskaitāmi 240 TIP/);
});

test("L4 + L5: the sheet note never rounds a short total up to the target", async () => {
  const certs = [cert({ points: 150 }), cert({ points: 60, category: "practical_training" }), cert({ points: 59.96, inSpecialty: false })];
  const p = computeProgress(profile(), certs, NOW);
  assert.equal(p.total, 249.9);
  assert.match(await sheetText(exportRows(profile(), certs)), /Kopā ieskaitāmi 249,9 TIP/);
});

test("L5: no cap note when practical training is under the cap", async () => {
  const rows = exportRows(profile(), [cert({ points: 200 }), cert({ points: 30, category: "practical_training" })]);
  assert.equal(rows.some((r) => r.rawPoints != null), false);
  assert.doesNotMatch(await sheetText(rows), /ieskaitīti/);
});

test("L5: nurses have no practical cap (Reg. 630)", () => {
  const prof = profile({ profession: "nurse", certificateIssued: null, certificateExpires: "2028-03-01" });
  const p = computeProgress(prof, [cert({ points: 80, category: "practical_training" })], NOW);
  assert.equal(p.practicalCounted, 80);
  assert.equal(p.total, 80);
});

/* L6: one Riga "today" */

test("L6: todayLv is the Riga date, a day ahead of UTC after midnight", () => {
  assert.equal(todayLv(new Date("2026-10-21T22:30:00Z")), "2026-10-22"); // 01:30 in Riga (EEST)
  assert.equal(todayLv(new Date("2026-01-14T22:30:00Z")), "2026-01-15"); // 00:30 in Riga (EET)
  assert.equal(todayLv(new Date("2026-10-22T20:00:00Z")), "2026-10-22");
  assert.equal(isoDay(new Date("2026-10-21T22:30:00Z")), "2026-10-22");
});

test("L6: daysLeft counts from the Riga date", () => {
  const prof = profile({ certificateIssued: "2021-11-01", certificateExpires: "2026-11-01" });
  // 01:30 on 22 Oct in Riga: 10 days to 01 Nov (the UTC date, 21 Oct, gave 11)
  assert.equal(computeProgress(prof, [], new Date("2026-10-21T22:30:00Z")).daysLeft, 10);
  assert.equal(computeProgress(prof, [], new Date("2026-10-22T12:00:00Z")).daysLeft, 10);
});

test("L6: the window with no dates starts 5 years before the Riga date", () => {
  const prof = profile({ certificateIssued: null, certificateExpires: null });
  const p = computeProgress(prof, [cert({ date: "2021-10-22" })], new Date("2026-10-21T22:30:00Z"));
  assert.equal(p.windowStart, "2021-10-22");
  assert.equal(p.counted.length, 1);
});

/* Nurses: Reg. 630 point 26.3 topic minimums only from 01 Jan 2027 */

test("nurse: registration ending before 2027 needs 100 hours and no topic minimums", () => {
  const prof = profile({ profession: "nurse", certificateIssued: null, certificateExpires: "2026-12-31" });
  const p = computeProgress(prof, [cert({ points: 100, date: "2024-01-01" })], NOW);
  assert.equal(p.required, 100);
  assert.deepEqual(p.checks.map((c) => c.id), ["total"]);
  assert.equal(p.allMet, true);
  assert.equal(p.windowStart, "2021-12-31");
});

test("nurse: registration ending in 2027 or later adds the four topic minimums", () => {
  const prof = profile({ profession: "nurse", certificateIssued: null, certificateExpires: "2027-01-01" });
  const certs = [
    cert({ points: 8, nurseTopic: "emergency" }),
    cert({ points: 4, nurseTopic: "infection_control" }),
    cert({ points: 8, nurseTopic: "patient_safety" }),
    cert({ points: 49, nurseTopic: "nursing" }),
    cert({ points: 31, nurseTopic: "other" }),
  ];
  const p = computeProgress(prof, certs, NOW);
  assert.deepEqual(p.checks.map((c) => c.id).sort(), ["emergency_points", "infection_control", "nursing", "patient_safety", "total"]);
  assert.equal(check(p, "total")!.met, true);
  assert.equal(check(p, "nursing")!.met, false);
  assert.equal(p.allMet, false);
  const done = computeProgress(prof, [...certs, cert({ points: 1, nurseTopic: "nursing" })], NOW);
  assert.equal(done.allMet, true);
});

/* Functional specialists: 150 TIP until 01 Jan 2028 (point 86), physiotherapists excluded */

test("functional specialist: certificate ending before 2028 needs 150 TIP", () => {
  const prof = profile({ profession: "functional_specialist", specialtyCode: "fs-ot", specialty: "Ergoterapeits", certificateIssued: "2022-12-31", certificateExpires: "2027-12-31" });
  assert.equal(ruleBasis(prof), "functionalTransition");
  assert.equal(ruleRequiredPoints(prof), 150);
  // the 16% cap follows the 150 requirement: 24 TIP
  const p = computeProgress(prof, [cert({ points: 140, date: "2024-01-01" }), cert({ points: 40, category: "practical_training", date: "2024-02-01" })], NOW);
  assert.equal(p.practicalCounted, 24);
  assert.equal(p.total, 164);
});

test("functional specialist: certificate ending on 01 Jan 2028 or later needs 250 TIP", () => {
  const prof = profile({ profession: "functional_specialist", specialtyCode: "fs-ot", specialty: "Ergoterapeits", certificateIssued: "2023-01-01", certificateExpires: "2028-01-01" });
  assert.equal(ruleBasis(prof), null);
  assert.equal(ruleRequiredPoints(prof), 250);
});

test("functional specialist: physiotherapists get no transition", () => {
  const prof = profile({ profession: "functional_specialist", specialtyCode: "fs-physio", specialty: "Fizioterapeits", certificateExpires: "2027-06-01" });
  assert.equal(ruleBasis(prof), null);
  assert.equal(ruleRequiredPoints(prof), 250);
});

test("functional specialist: method certificates get no transition", () => {
  const prof = profile({ profession: "functional_specialist", certificationKind: "method", specialtyCode: "fs-ot", certificateExpires: "2027-06-01" });
  assert.equal(ruleBasis(prof), null);
  assert.equal(ruleRequiredPoints(prof), 100);
});
